import { error } from '@sveltejs/kit';
import { Cause, Effect, Exit, Option } from 'effect';
import {
  forwardSiteAnalytics,
  SiteAnalyticsRejected,
} from '../../../../lib/server/site-analytics.server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async event => {
  if (event.platform === undefined) error(503, 'Analytics unavailable');
  const exit = await Effect.runPromiseExit(
    forwardSiteAnalytics(event.request, event.platform.env.LICENSING_API)
  );
  if (Exit.isSuccess(exit)) {
    return Response.json(
      { accepted: exit.value },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const failure = Option.getOrNull(Cause.findErrorOption(exit.cause));
  if (failure instanceof SiteAnalyticsRejected) error(failure.status, 'Analytics request rejected');
  error(503, 'Analytics unavailable');
};
