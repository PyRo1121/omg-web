import { describe, expect, it } from 'vitest';
import type { AdminOverview } from '../../../../site/shared/admin-overview';
import {
  activityBars,
  attentionItems,
  commandHealthSummary,
  formatActivityAction,
  latestActivityDay,
  recentSignupCount,
} from './admin-view';

function overview(overrides: Partial<AdminOverview> = {}): AdminOverview {
  return {
    activeLicenses: 8,
    activeMachines: 9,
    activity: [],
    commandFailure24h: 0,
    commandSuccess24h: 103,
    commands30d: 820,
    dailyActivity: [
      { activeUsers: 3, commands: 90, date: '2026-08-26' },
      { activeUsers: 4, commands: 120, date: '2026-08-27' },
    ],
    fleetVersions: [],
    installsByPlatform: [],
    packagesInstalled30d: 140,
    recentSignups: [
      { count: 1, date: '2026-08-26' },
      { count: 2, date: '2026-08-27' },
    ],
    searches30d: 44,
    subscriptions: [{ count: 2, label: 'active' }],
    tiers: [],
    timeSavedMs30d: 7_200_000,
    totalInstalls: 17,
    totalUsers: 12,
    ...overrides,
  };
}

describe('admin overview decisions', () => {
  it('keeps healthy state separate from actionable exceptions', () => {
    expect(attentionItems(overview())).toEqual([]);
    expect(commandHealthSummary(overview())).toEqual({
      detail: '103 successful operations were recorded.',
      label: 'Command health',
      tone: 'clear',
      value: 'No failures in 24h',
    });

    expect(
      attentionItems(
        overview({
          activeMachines: 0,
          commandFailure24h: 3,
          subscriptions: [
            { count: 2, label: 'active' },
            { count: 1, label: 'past_due' },
            { count: 2, label: 'paused' },
          ],
        })
      )
    ).toEqual([
      {
        detail: 'Past-due, unpaid, incomplete, or paused subscriptions.',
        label: 'Billing exceptions',
        tone: 'watch',
        value: '3 subscriptions',
      },
      {
        detail: '8 active licenses currently have no active machine reporting.',
        label: 'Fleet coverage',
        tone: 'watch',
        value: 'No active machines',
      },
    ]);
    expect(
      commandHealthSummary(overview({ commandFailure24h: 3, commandSuccess24h: 103 }))
    ).toEqual({
      detail: '103 successful operations were recorded in the same period.',
      label: 'Command health',
      tone: 'urgent',
      value: '3 failures in 24h',
    });
  });

  it('derives exact signup and latest-day summaries', () => {
    expect(recentSignupCount(overview())).toBe(3);
    expect(latestActivityDay(overview())).toEqual({
      activeUsers: 4,
      commands: 120,
      date: '2026-08-27',
    });
    expect(latestActivityDay(overview({ dailyActivity: [] }))).toBeNull();
  });

  it('builds relative bars without changing exact displayed values', () => {
    expect(activityBars(overview())).toEqual([
      { activeUsers: 3, commands: 90, date: '2026-08-26', widthPercent: 75 },
      { activeUsers: 4, commands: 120, date: '2026-08-27', widthPercent: 100 },
    ]);
  });

  it.each([
    ['machine.registered', 'Machine registered'],
    ['admin_update_user', 'Admin update user'],
    ['license', 'License'],
  ])('formats %s as %s', (action, label) => {
    expect(formatActivityAction(action)).toBe(label);
  });
});
