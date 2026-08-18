import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  decodeSendCodeRequest,
  decodeSendCodeResponse,
  decodeVerifyCodeResponse,
} from './otp-auth';

const validSendResponse = {
  success: true as const,
  message: 'Verification code sent',
};

const validVerifyResponse = {
  success: true as const,
  token: 'tok_abc',
  expires_at: '2026-01-01T00:00:00.000Z',
  user: {
    id: 'cust_1',
    email: 'ada@example.com',
    name: null,
  },
};

describe('decodeSendCodeRequest', () => {
  it('normalizes and brands a valid email', async () => {
    const exit = await Effect.runPromiseExit(decodeSendCodeRequest({ email: 'Ada@Example.COM' }));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.email).toBe('ada@example.com');
    }
  });

  it('rejects an invalid email', async () => {
    const exit = await Effect.runPromiseExit(decodeSendCodeRequest({ email: 'not-an-email' }));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('decodeSendCodeResponse', () => {
  it('accepts a success payload', async () => {
    const decoded = await Effect.runPromise(decodeSendCodeResponse(validSendResponse));
    expect(decoded.message).toBe('Verification code sent');
  });

  it('rejects a failure-shaped 200 body', async () => {
    const exit = await Effect.runPromiseExit(
      decodeSendCodeResponse({ success: false, error: 'nope' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('decodeVerifyCodeResponse', () => {
  it('brands the session token', async () => {
    const decoded = await Effect.runPromise(decodeVerifyCodeResponse(validVerifyResponse));
    expect(decoded.token).toBe('tok_abc');
    expect(decoded.user.id).toBe('cust_1');
  });

  it('rejects a payload without a token', async () => {
    const exit = await Effect.runPromiseExit(
      decodeVerifyCodeResponse({ ...validVerifyResponse, token: '' })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
