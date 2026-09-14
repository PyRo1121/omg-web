import { error } from '@sveltejs/kit';
import { Effect } from 'effect';
import {
  ADMIN_EXPORTS,
  isAdminExportKind,
  loadAdminExport,
} from '../../../../lib/server/admin-operations.server';
import { adminPageValue, requireAdminPageContext } from '../../../../lib/server/admin-page.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async event => {
  if (!isAdminExportKind(event.params.kind)) error(404, 'Export not found');
  const { env, identity } = await requireAdminPageContext(event);
  const exit = await Effect.runPromiseExit(loadAdminExport(identity, env, event.params.kind));
  const bytes = adminPageValue(exit, 'Operator export unavailable');
  const filename = ADMIN_EXPORTS[event.params.kind].filename;
  return new Response(bytes, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'text/csv; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
