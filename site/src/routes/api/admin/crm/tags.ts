import type { APIEvent } from '@solidjs/start/server';
import { sql, eq, desc, and } from 'drizzle-orm';
import * as schema from '~/db/auth-schema';
import { requireAdmin } from '~/lib/admin';
import { parseAdminCrmTagInput } from '~/lib/dashboard-contract';
import { storedDataErrorResponse } from '~/lib/api-error';
import {
  AssignedTagRowSchema,
  CountRowSchema,
  CustomerTagNameRowSchema,
  IdRowSchema,
  TagCatalogRowSchema,
  isInvalidD1Row,
  optionalD1RowValue,
  readD1RowArray,
  readOptionalD1Row,
} from '~/lib/contracts/d1-rows';

export async function GET(event: APIEvent) {
  try {
    const adminCheck = await requireAdmin(event);
    if (adminCheck instanceof Response) {
      return adminCheck;
    }

    const { db } = adminCheck;

    const url = new URL(event.request.url);
    const customerId = url.searchParams.get('customerId');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 200);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    if (customerId) {
      const customerTagsLookup = await readD1RowArray(
        AssignedTagRowSchema,
        'Assigned tag rows have an invalid shape',
        await db
          .select({
            id: schema.customerTag.id,
            name: schema.customerTag.name,
            color: schema.customerTag.color,
            description: schema.customerTag.description,
            assignedAt: schema.customerTagAssignment.createdAt,
            assignedById: schema.customerTagAssignment.assignedBy,
          })
          .from(schema.customerTagAssignment)
          .innerJoin(
            schema.customerTag,
            eq(schema.customerTagAssignment.tagId, schema.customerTag.id)
          )
          .where(eq(schema.customerTagAssignment.userId, customerId))
          .orderBy(desc(schema.customerTagAssignment.createdAt))
          .limit(limit)
          .offset(offset)
          .all()
      );
      if (customerTagsLookup._tag === 'invalid') {
        return storedDataErrorResponse();
      }

      return new Response(
        JSON.stringify({
          tags: customerTagsLookup.value.map(t => ({
            id: t.id,
            name: t.name,
            color: t.color,
            description: t.description ?? null,
            assignedAt: t.assignedAt.toISOString(),
            assignedById: t.assignedById,
          })),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          },
        }
      );
    }

    // Get all available tags with usage count
    const allTagsLookup = await readD1RowArray(
      TagCatalogRowSchema,
      'Tag catalog rows have an invalid shape',
      await db
        .select({
          id: schema.customerTag.id,
          name: schema.customerTag.name,
          color: schema.customerTag.color,
          description: schema.customerTag.description,
          createdAt: schema.customerTag.createdAt,
          usageCount: sql<number>`(
          SELECT COUNT(*)
          FROM customer_tag_assignment
          WHERE customer_tag_assignment.tag_id = ${schema.customerTag.id}
        )`,
        })
        .from(schema.customerTag)
        .orderBy(schema.customerTag.name)
        .limit(limit)
        .offset(offset)
        .all()
    );
    const totalCountLookup = await readOptionalD1Row(
      CountRowSchema,
      'Tag catalog count has an invalid shape',
      await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.customerTag)
        .get()
    );
    if (allTagsLookup._tag === 'invalid' || isInvalidD1Row(totalCountLookup)) {
      return storedDataErrorResponse();
    }

    return new Response(
      JSON.stringify({
        tags: allTagsLookup.value.map(t => ({
          id: t.id,
          name: t.name,
          color: t.color,
          description: t.description ?? null,
          createdAt: t.createdAt.toISOString(),
          usageCount: t.usageCount,
        })),
        pagination: {
          limit,
          offset,
          total: optionalD1RowValue(totalCountLookup)?.count ?? 0,
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error: unknown) {
    console.error('[Admin CRM Tags GET] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function POST(event: APIEvent) {
  try {
    const adminCheck = await requireAdmin(event);
    if (adminCheck instanceof Response) {
      return adminCheck;
    }

    const { db, userId: adminId } = adminCheck;

    const parsedBody = parseAdminCrmTagInput(await event.request.json());
    if (!parsedBody.ok) {
      return new Response(JSON.stringify({ error: parsedBody.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { customerId, tagId, name, color, description } = parsedBody.value;

    // Case 1: Assign existing tag to customer
    if (customerId && tagId) {
      const customerLookup = await readOptionalD1Row(
        IdRowSchema,
        'Customer id row has an invalid shape',
        await db
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(eq(schema.user.id, customerId))
          .limit(1)
          .get()
      );
      if (isInvalidD1Row(customerLookup)) {
        return storedDataErrorResponse();
      }
      if (customerLookup._tag === 'missing') {
        return new Response(JSON.stringify({ error: 'Customer not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const tagLookup = await readOptionalD1Row(
        IdRowSchema,
        'Tag id row has an invalid shape',
        await db
          .select({ id: schema.customerTag.id })
          .from(schema.customerTag)
          .where(eq(schema.customerTag.id, tagId))
          .limit(1)
          .get()
      );
      if (isInvalidD1Row(tagLookup)) {
        return storedDataErrorResponse();
      }
      if (tagLookup._tag === 'missing') {
        return new Response(JSON.stringify({ error: 'Tag not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const existingAssignmentLookup = await readOptionalD1Row(
        IdRowSchema,
        'Tag assignment id row has an invalid shape',
        await db
          .select({ id: schema.customerTagAssignment.id })
          .from(schema.customerTagAssignment)
          .where(
            and(
              eq(schema.customerTagAssignment.userId, customerId),
              eq(schema.customerTagAssignment.tagId, tagId)
            )
          )
          .limit(1)
          .get()
      );
      if (isInvalidD1Row(existingAssignmentLookup)) {
        return storedDataErrorResponse();
      }
      if (existingAssignmentLookup._tag === 'present') {
        return new Response(JSON.stringify({ error: 'Tag already assigned to customer' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const assignmentId = crypto.randomUUID();
      await db
        .insert(schema.customerTagAssignment)
        .values({
          id: assignmentId,
          userId: customerId,
          tagId: tagId,
          assignedBy: adminId,
          createdAt: new Date(),
        })
        .run();

      return new Response(
        JSON.stringify({
          success: true,
          assignmentId,
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Case 2: Create a new tag
    if (name) {
      // Check if tag name already exists
      const existingTagLookup = await readOptionalD1Row(
        IdRowSchema,
        'Tag id row has an invalid shape',
        await db
          .select({ id: schema.customerTag.id })
          .from(schema.customerTag)
          .where(eq(schema.customerTag.name, name.trim()))
          .limit(1)
          .get()
      );
      if (isInvalidD1Row(existingTagLookup)) {
        return storedDataErrorResponse();
      }
      if (existingTagLookup._tag === 'present') {
        return new Response(JSON.stringify({ error: 'Tag with this name already exists' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const newTagId = crypto.randomUUID();
      await db
        .insert(schema.customerTag)
        .values({
          id: newTagId,
          name: name.trim(),
          color: color || '#6366f1',
          description: description?.trim() || null,
          createdAt: new Date(),
        })
        .run();

      // If customerId is also provided, assign the new tag
      if (customerId) {
        const customerLookup = await readOptionalD1Row(
          IdRowSchema,
          'Customer id row has an invalid shape',
          await db
            .select({ id: schema.user.id })
            .from(schema.user)
            .where(eq(schema.user.id, customerId))
            .limit(1)
            .get()
        );
        if (isInvalidD1Row(customerLookup)) {
          return storedDataErrorResponse();
        }
        if (customerLookup._tag === 'present') {
          await db
            .insert(schema.customerTagAssignment)
            .values({
              id: crypto.randomUUID(),
              userId: customerId,
              tagId: newTagId,
              assignedBy: adminId,
              createdAt: new Date(),
            })
            .run();
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          tag: {
            id: newTagId,
            name: name.trim(),
            color: color || '#6366f1',
            description: description?.trim() || null,
          },
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Either (customerId and tagId) or name is required' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    console.error('[Admin CRM Tags POST] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function PUT(event: APIEvent) {
  try {
    const adminCheck = await requireAdmin(event);
    if (adminCheck instanceof Response) {
      return adminCheck;
    }

    const { db } = adminCheck;

    const parsedBody = parseAdminCrmTagInput(await event.request.json());
    if (!parsedBody.ok) {
      return new Response(JSON.stringify({ error: parsedBody.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { tagId, name, color, description } = parsedBody.value;

    if (!tagId) {
      return new Response(JSON.stringify({ error: 'tagId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify tag exists
    const existingTagLookup = await readOptionalD1Row(
      CustomerTagNameRowSchema,
      'Tag row has an invalid shape',
      await db
        .select()
        .from(schema.customerTag)
        .where(eq(schema.customerTag.id, tagId))
        .limit(1)
        .get()
    );
    if (isInvalidD1Row(existingTagLookup)) {
      return storedDataErrorResponse();
    }
    if (existingTagLookup._tag === 'missing') {
      return new Response(JSON.stringify({ error: 'Tag not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const existingTag = existingTagLookup.value;

    // Check for name conflict if updating name
    if (name && name.trim() !== existingTag.name) {
      const nameConflictLookup = await readOptionalD1Row(
        IdRowSchema,
        'Tag name conflict row has an invalid shape',
        await db
          .select({ id: schema.customerTag.id })
          .from(schema.customerTag)
          .where(eq(schema.customerTag.name, name.trim()))
          .limit(1)
          .get()
      );
      if (isInvalidD1Row(nameConflictLookup)) {
        return storedDataErrorResponse();
      }
      if (nameConflictLookup._tag === 'present') {
        return new Response(JSON.stringify({ error: 'Tag with this name already exists' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Build update object
    const updates: Partial<typeof schema.customerTag.$inferInsert> = {};
    if (name !== undefined) {
      updates.name = name.trim();
    }
    if (color !== undefined) {
      updates.color = color;
    }
    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(schema.customerTag)
        .set(updates)
        .where(eq(schema.customerTag.id, tagId))
        .run();
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[Admin CRM Tags PUT] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function DELETE(event: APIEvent) {
  try {
    const adminCheck = await requireAdmin(event);
    if (adminCheck instanceof Response) {
      return adminCheck;
    }

    const { db } = adminCheck;

    const url = new URL(event.request.url);
    const tagId = url.searchParams.get('tagId');
    const customerId = url.searchParams.get('customerId');

    if (!tagId) {
      return new Response(JSON.stringify({ error: 'tagId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // If customerId is provided, remove tag assignment only
    if (customerId) {
      await db
        .delete(schema.customerTagAssignment)
        .where(
          and(
            eq(schema.customerTagAssignment.userId, customerId),
            eq(schema.customerTagAssignment.tagId, tagId)
          )
        )
        .run();

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Otherwise, delete the tag entirely (cascade will remove assignments)
    const existingTagLookup = await readOptionalD1Row(
      IdRowSchema,
      'Tag id row has an invalid shape',
      await db
        .select({ id: schema.customerTag.id })
        .from(schema.customerTag)
        .where(eq(schema.customerTag.id, tagId))
        .limit(1)
        .get()
    );
    if (isInvalidD1Row(existingTagLookup)) {
      return storedDataErrorResponse();
    }
    if (existingTagLookup._tag === 'missing') {
      return new Response(JSON.stringify({ error: 'Tag not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await db.delete(schema.customerTag).where(eq(schema.customerTag.id, tagId)).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[Admin CRM Tags DELETE] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
