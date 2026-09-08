import type { AdminDailyActivity, AdminOverview } from '../../../../shared/admin-overview';

/** Operator attention severity used only for presentation ordering and color. */
type AdminAttentionTone = 'urgent' | 'watch' | 'clear';

/** One exact, evidence-backed operator attention item. */
interface AdminAttentionItem {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: AdminAttentionTone;
}

/** One activity day plus its relative visual width. Exact counts remain unchanged. */
interface AdminActivityBar extends AdminDailyActivity {
  readonly widthPercent: number;
}

const BILLING_EXCEPTION_STATUSES = new Set([
  'past_due',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
]);

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Summarize exact 24-hour command outcomes separately from operator exceptions. */
export function commandHealthSummary(overview: AdminOverview): AdminAttentionItem {
  return overview.commandFailure24h > 0
    ? {
        label: 'Command health',
        value: `${countLabel(overview.commandFailure24h, 'failure')} in 24h`,
        detail: `${countLabel(overview.commandSuccess24h, 'successful operation')} were recorded in the same period.`,
        tone: 'urgent',
      }
    : {
        label: 'Command health',
        value: 'No failures in 24h',
        detail: `${countLabel(overview.commandSuccess24h, 'successful operation')} were recorded.`,
        tone: 'clear',
      };
}

/** Build the bounded list of conditions that warrant operator attention. */
export function attentionItems(overview: AdminOverview): ReadonlyArray<AdminAttentionItem> {
  const items: Array<AdminAttentionItem> = [];
  const billingExceptions = overview.subscriptions.reduce(
    (total, item) =>
      BILLING_EXCEPTION_STATUSES.has(item.label.toLowerCase()) ? total + item.count : total,
    0
  );
  if (billingExceptions > 0) {
    items.push({
      label: 'Billing exceptions',
      value: countLabel(billingExceptions, 'subscription'),
      detail: 'Past-due, unpaid, incomplete, or paused subscriptions.',
      tone: 'watch',
    });
  }

  if (overview.activeLicenses > 0 && overview.activeMachines === 0) {
    items.push({
      label: 'Fleet coverage',
      value: 'No active machines',
      detail: `${countLabel(overview.activeLicenses, 'active license')} currently have no active machine reporting.`,
      tone: 'watch',
    });
  }
  return items;
}

/** Return the newest recorded activity day, independent of input ordering. */
export function latestActivityDay(overview: AdminOverview): AdminDailyActivity | null {
  let latest: AdminDailyActivity | null = null;
  for (const day of overview.dailyActivity) {
    if (latest === null || day.date > latest.date) {
      latest = day;
    }
  }
  return latest;
}

/** Sum the exact signup counts returned for the recent-signup window. */
export function recentSignupCount(overview: AdminOverview): number {
  return overview.recentSignups.reduce((total, item) => total + item.count, 0);
}

/** Add relative bar widths while preserving exact activity counts for labels. */
export function activityBars(overview: AdminOverview): ReadonlyArray<AdminActivityBar> {
  const maximumCommands = overview.dailyActivity.reduce(
    (maximum, day) => Math.max(maximum, day.commands),
    0
  );
  return overview.dailyActivity.map(day => ({
    ...day,
    widthPercent: maximumCommands === 0 ? 0 : Math.round((day.commands / maximumCommands) * 100),
  }));
}

/** Turn a persisted audit action key into a compact sentence label. */
export function formatActivityAction(action: string): string {
  const words = action
    .replace(/[._-]+/gu, ' ')
    .trim()
    .toLowerCase();
  return words.length === 0
    ? 'Unknown activity'
    : `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`;
}
