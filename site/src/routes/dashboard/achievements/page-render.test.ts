import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AchievementsPage from './+page.svelte';

const achievements = {
  unlocked: 1,
  total: 2,
  achievements: [
    {
      name: 'First command',
      description: 'Run your first command.',
      unlocked: true,
      unlockedAt: '2026-08-27T12:00:00.000Z',
    },
    {
      name: 'Package pro',
      description: 'Install ten packages.',
      unlocked: false,
      unlockedAt: null,
    },
  ],
};

describe('account achievements page', () => {
  it('renders grounded locked and unlocked states without identifiers', () => {
    const result = render(AchievementsPage, {
      props: {
        data: { achievements: { status: 'available', achievements } },
        form: null,
        params: {},
      },
    });

    expect(result.body).toContain('1 of 2 unlocked');
    expect(result.body).toContain('First command');
    expect(result.body).toContain('Unlocked Aug 27, 2026');
    expect(result.body).toContain('Locked');
    expect(result.body).not.toContain('first-command');
    expect(result.body).not.toContain('license_key');
  });

  it('renders explicit empty and unavailable states', () => {
    const empty = render(AchievementsPage, {
      props: {
        data: {
          achievements: {
            status: 'available',
            achievements: { unlocked: 0, total: 0, achievements: [] },
          },
        },
        form: null,
        params: {},
      },
    });
    const unavailable = render(AchievementsPage, {
      props: { data: { achievements: { status: 'unavailable' } }, form: null, params: {} },
    });

    expect(empty.body).toContain('No achievements are available yet.');
    expect(unavailable.body).toContain('Achievements are temporarily unavailable.');
  });
});
