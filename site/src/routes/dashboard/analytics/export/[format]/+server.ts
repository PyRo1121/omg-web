import { error, redirect } from '@sveltejs/kit';
import { Effect, Exit } from 'effect';
import {
  createAccountAnalyticsExport,
  loadAccountAnalytics,
  type AccountAnalyticsExportFormat,
} from '../../../../../lib/server/account-analytics.server';
import { loadAccountIdentity } from '../../../../../lib/server/account-dashboard.server';
import { reportEffectFailure } from '../../../../../lib/server/observability.server';
import type { RequestHandler } from './$types';

function exportFormat(value: string | undefined): AccountAnalyticsExportFormat | null {
  return value === 'csv' || value === 'json' ? value : null;
}

export const GET: RequestHandler = async event => {
  if (event.platform === undefined) {
    error(503, 'Usage export unavailable');
  }
  const format = exportFormat(event.params.format);
  if (format === null) {
    error(404, 'Usage export not found');
  }
  const identity = await loadAccountIdentity(event);
  if (identity === null) {
    redirect(302, '/login/');
  }
  if (!identity.user.emailVerified) {
    error(403, 'Verify your email before exporting usage data');
  }

  const exit = await Effect.runPromiseExit(loadAccountAnalytics(identity.user, event.platform.env));
  if (Exit.isFailure(exit)) {
    reportEffectFailure('account.analytics_export_unavailable', exit.cause);
    error(503, 'Usage export unavailable');
  }
  const download = createAccountAnalyticsExport(exit.value, format, new Date());
  return new Response(download.body, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${download.filename}"`,
      'Content-Type': download.contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
