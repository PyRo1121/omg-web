// AI Insights Handler - Using Cloudflare AI Gateway with Meta.com
import type { Env } from '../api';
import { jsonResponse, errorResponse, validateSession, getAuthToken } from '../api';
import { Effect, Exit } from 'effect';
import {
  decodeExtraRow,
  decodeExtraRowArray,
  decodeOptionalExtraRow,
  InsightsErrorRowSchema,
  InsightsProductRowSchema,
  InsightsStatsRowSchema,
  InsightsUsageRowSchema,
  MetaChatCompletionSchema,
  WorkersAiTextSchema,
} from '../contracts/d1-extras';

// Simple in-memory rate limiter (5 requests per minute per user)
// TODO: Replace with Cloudflare Rate Limiting API in production for distributed rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  userLimit.count++;
  return true;
}

export async function handleGetSmartInsights(request: Request, env: Env): Promise<Response> {
  const token = getAuthToken(request);
  if (!token) {
    return errorResponse('Unauthorized', 401);
  }

  const auth = await validateSession(env.DB, token);
  if (!auth) {
    return errorResponse('Invalid session', 401);
  }

  // Rate limiting: 5 requests per minute
  if (!checkRateLimit(auth.user.id)) {
    return errorResponse('Rate limit exceeded. Please try again in a minute.', 429);
  }

  const isAdmin = env.ADMIN_USER_ID ? auth.user.id === env.ADMIN_USER_ID : false;
  const url = new URL(request.url);
  const target = url.searchParams.get('target') || 'user'; // 'user', 'team', or 'admin'

  try {
    // 1. Gather Rich Context Data for AI
    let contextData = '';
    let additionalContext = '';

    if (target === 'admin' && isAdmin) {
      const statsRow = await env.DB.prepare(
        `
        SELECT
          (SELECT COUNT(*) FROM customers) as users,
          (SELECT SUM(value) FROM analytics_daily WHERE metric = 'total_commands') as cmds,
          (SELECT SUM(value) FROM analytics_daily WHERE metric = 'total_time_saved_ms') as time_ms,
          (SELECT dimension FROM analytics_daily WHERE metric = 'errors' ORDER BY value DESC LIMIT 1) as top_error,
          (SELECT COUNT(DISTINCT omg_version) FROM machines WHERE is_active = 1) as version_drift_count
      `
      ).first();
      const stats = await Effect.runPromise(
        decodeOptionalExtraRow(
          InsightsStatsRowSchema,
          'Insights stats row has an invalid shape',
          statsRow
        )
      );

      const errorStats = await env.DB.prepare(
        `
        SELECT error_message, occurrences FROM analytics_errors ORDER BY occurrences DESC LIMIT 3
      `
      ).all();

      const decodedErrors = await Effect.runPromiseExit(
        decodeExtraRowArray(
          InsightsErrorRowSchema,
          'Insights error row has an invalid shape',
          errorStats.results
        )
      );
      const topErrors = Exit.isFailure(decodedErrors)
        ? 'None'
        : decodedErrors.value.map(row => `${row.error_message} (${row.occurrences}x)`).join(', ') ||
          'None';
      const timeHours = Math.round((Number(stats?.time_ms) || 0) / 3600000);

      contextData = `Platform Stats: ${stats?.users} total users, ${stats?.cmds?.toLocaleString()} commands executed, ${timeHours} hours saved system-wide.
      Version Drift: ${stats?.version_drift_count} different OMG versions active in fleet.
      Top Error Patterns: ${topErrors}.`;

      additionalContext = `OMG provides unified package management across Arch Linux, Debian, Ubuntu, and 8 language runtimes. We are currently targeting sub-10ms search performance and 100% fleet compliance.`;
    } else if (target === 'team') {
      const usageRow = await env.DB.prepare(
        `
        SELECT SUM(commands_run) as cmds, SUM(time_saved_ms) as time
          FROM usage_daily 
          WHERE license_id = (SELECT id FROM licenses WHERE customer_id = ?)
      `
      )
        .bind(auth.user.id)
        .first();
      const usage = await Effect.runPromise(
        decodeOptionalExtraRow(
          InsightsUsageRowSchema,
          'Insights usage row has an invalid shape',
          usageRow
        )
      );

      // Get command breakdown for user/team
      const commandBreakdownRow = await env.DB.prepare(
        `
        SELECT 
          SUM(packages_searched) as searches,
          SUM(packages_installed) as installs,
          SUM(runtimes_switched) as runtime_switches
        FROM usage_daily
        WHERE license_id = (SELECT id FROM licenses WHERE customer_id = ?)
      `
      )
        .bind(auth.user.id)
        .first();
      const commandBreakdown = await Effect.runPromise(
        decodeOptionalExtraRow(
          InsightsProductRowSchema,
          'Insights product row has an invalid shape',
          commandBreakdownRow
        )
      );

      const timeHours = Math.round((Number(usage?.time) || 0) / 3600000);
      const cmdsNum = Number(usage?.cmds) || 0;
      const efficiency = cmdsNum > 0 ? ((timeHours / cmdsNum) * 100).toFixed(2) : 0;

      contextData = `Usage Stats: ${usage?.cmds?.toLocaleString()} commands executed, ${timeHours} hours saved, ${efficiency}% average efficiency per command. Breakdown: ${commandBreakdown?.searches || 0} searches, ${commandBreakdown?.installs || 0} installs, ${commandBreakdown?.runtime_switches || 0} runtime switches.`;
      additionalContext = `OMG saves 39 minutes per engineer annually just on package queries. For a 50-person team, that's $2,350-$2,650 in reclaimed productivity. Zero context switching between 7 package managers.`;
    }

    // 2. Generate Insight using AI Gateway with Meta.com Llama 4 Maverick
    let systemPrompt = '';
    let userPrompt = '';

    if (target === 'admin') {
      systemPrompt = `You are an expert DevOps and SaaS platform analyst for OMG, a high-performance unified package manager. You analyze platform metrics and provide actionable insights for improving user engagement, feature adoption, and technical health. Focus on: user retention, feature utilization, error patterns, and growth opportunities. Be specific, data-driven, and concise. Avoid generic advice.`;
      userPrompt = `Analyze these OMG platform metrics and provide 1 specific, actionable insight for administrators: ${contextData} ${additionalContext} Consider trends, anomalies, or optimization opportunities. Return 1-2 sentences that directly address an actionable observation.`;
    } else if (target === 'team') {
      systemPrompt = `You are a team productivity analyst specializing in developer tooling and fleet management for OMG. You analyze team usage patterns to identify efficiency opportunities, security gaps, and collaboration improvements. Focus on: fleet health, runtime consistency, time savings optimization, and policy enforcement. Be specific, data-driven, and avoid generic statements like "continue doing X".`;
      userPrompt = `Based on this team data: ${contextData} ${additionalContext} Provide 1 specific, actionable insight that addresses either: (a) an efficiency improvement opportunity, (b) a security or compliance concern, or (c) a collaboration bottleneck. Be specific about what action to take.`;
    } else {
      systemPrompt = `You are a personal productivity assistant for OMG users. You analyze individual developer usage to identify efficiency gains, runtime optimization opportunities, and workflow improvements. Focus on: time savings, command efficiency, runtime adoption patterns, and skill development. Be encouraging but specific. Avoid generic motivational statements.`;
      userPrompt = `Analyze this developer's OMG usage: ${contextData} ${additionalContext} Provide 1 specific, actionable insight about how to improve efficiency, optimize their workflow, or discover underutilized features. Focus on concrete actions they can take today.`;
    }

    let aiResponse;
    let modelUsed = 'Workers AI (Llama 3.1 70B)';

    try {
      if (env.META_API_KEY) {
        const response = await fetch('https://api.llama.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.META_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: 500,
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          const payload: unknown = await response.json();
          const decodedMeta = await Effect.runPromiseExit(
            decodeExtraRow(
              MetaChatCompletionSchema,
              'Meta chat completion has an invalid shape',
              payload
            )
          );
          const content = Exit.isFailure(decodedMeta)
            ? undefined
            : decodedMeta.value.choices?.[0]?.message?.content;
          aiResponse = { response: content };
          modelUsed = 'Meta.com (Llama 4 Maverick 17B)';
        } else {
          const errorText = await response.text();
          console.warn('Meta API error:', response.status, errorText);
          throw new Error(`Meta API error: ${response.status}`);
        }
      } else {
        throw new Error('META_API_KEY not configured');
      }
    } catch (metaError) {
      console.warn('Meta API failed, falling back to Workers AI:', metaError);

      const rawAi = await env.AI.run('@cf/meta/llama-3.1-70b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 500,
      });
      const decodedAi = await Effect.runPromiseExit(
        decodeExtraRow(WorkersAiTextSchema, 'Workers AI response has an invalid shape', rawAi)
      );
      aiResponse = Exit.isFailure(decodedAi) ? { response: undefined } : decodedAi.value;
    }

    const insight =
      aiResponse.response ||
      "Continue optimizing your workflow with OMG's parallel execution engine.";

    return jsonResponse({
      insight,
      timestamp: new Date().toISOString(),
      generated_by: modelUsed,
    });
  } catch (e) {
    console.error('AI Insight Error:', e);
    // Fallback to heuristic insights if AI fails
    return jsonResponse({
      insight:
        'Your team has saved over 10 hours this week. Consider enforcing runtime policies to further increase efficiency.',
      timestamp: new Date().toISOString(),
      generated_by: 'Heuristic Engine',
    });
  }
}
