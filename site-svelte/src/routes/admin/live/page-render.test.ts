import { Effect, Exit } from 'effect';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import LivePage from './+page.svelte';
import { decodeLivePayloadResponse } from './admin-live.svelte';

describe('operator live page', () => {
  it('rejects a declared response larger than the browser boundary', async () => {
    const response = new Response('{}', { headers: { 'Content-Length': '524289' } });

    const exit = await Effect.runPromiseExit(decodeLivePayloadResponse(response));

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('stops reading an undeclared response at the browser boundary', async () => {
    const response = new Response('x'.repeat(512 * 1024 + 1));

    const exit = await Effect.runPromiseExit(decodeLivePayloadResponse(response));

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('rejects more events than the retained browser limit', async () => {
    const event = {
      eventType: 'command',
      eventName: 'install',
      timestamp: '2026-08-30T12:00:00.000Z',
      version: '1.4.0',
      platform: 'linux',
      durationMs: 120,
      createdAt: '2026-08-30 12:00:00',
    };
    const response = Response.json({
      events: Array.from({ length: 101 }, () => event),
      count: 101,
      refreshedAt: '2026-08-30T12:00:01.000Z',
    });

    const exit = await Effect.runPromiseExit(decodeLivePayloadResponse(response));

    expect(Exit.isFailure(exit)).toBe(true);
  });

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
