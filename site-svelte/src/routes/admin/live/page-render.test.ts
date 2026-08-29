import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import LivePage from './+page.svelte';

describe('operator live page', () => {
  it('renders only privacy-reduced command fields', () => {
    const result = render(LivePage, {
      props: {
        data: {
          live: {
            events: [
              {
                eventType: 'command',
                eventName: 'install',
                timestamp: '2026-08-30T12:00:00.000Z',
                version: '1.4.0',
                platform: 'linux',
                durationMs: 120,
                createdAt: '2026-08-30 12:00:00',
              },
            ],
            count: 1,
            refreshedAt: '2026-08-30T12:00:01.000Z',
          },
        },
      },
    });

    expect(result.body).toContain('Command activity');
    expect(result.body).toContain('Install');
    expect(result.body).toContain('Linux');
    expect(result.body).not.toContain('private-event-id');
    expect(result.body).not.toContain('private-machine-id');
    expect(result.body).not.toContain('private-session-id');
  });
});
