import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { AuthBridgeWorkerRejected } from './admin-session-bridge';
import { provisionLicenseForUser, responseFromProvisionLicenseExit } from './provision-license';

function jsonResponse(status: number, serializedBody: string): Response {
  return new Response(serializedBody, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('provisionLicenseForUser', () => {
  it('decodes a valid Worker provision payload', async () => {
    const exit = await Effect.runPromiseExit(
      provisionLicenseForUser(
        { email: 'ada@example.com', name: 'Ada' },
        'https://api.example.com',
        's3cret',
        {
          post() {
            return Effect.succeed(
              jsonResponse(
                200,
                JSON.stringify({
                  success: true,
                  customerId: 'cust_1',
                  licenseKey: 'key-abc',
                })
              )
            );
          },
        }
      )
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.licenseKey).toBe('key-abc');
    }
  });

  it('maps an invalid Worker payload to a parse error', async () => {
    const exit = await Effect.runPromiseExit(
      provisionLicenseForUser(
        { email: 'ada@example.com', name: 'Ada' },
        'https://api.example.com',
        's3cret',
        {
          post() {
            return Effect.succeed(jsonResponse(200, JSON.stringify({ success: true })));
          },
        }
      )
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it('maps a rejected Worker response to 502', () => {
    const exit = Exit.fail(new AuthBridgeWorkerRejected(401));
    expect(responseFromProvisionLicenseExit(exit).status).toBe(502);
  });
});
