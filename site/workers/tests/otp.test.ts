import '../src/cloudflare-test.d.ts';

import { describe, expect, it } from 'vitest';
import { generateOtpCode, hashOtpCode } from '../src/otp';

const TEST_SECRET = 'otp-domain-test-secret';

describe('OTP cryptography', () => {
  it('generates six-digit decimal codes', () => {
    for (let sample = 0; sample < 256; sample += 1) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/u);
    }
  });

  it('creates deterministic, domain-separated keyed digests', async () => {
    const digest = await hashOtpCode('ada@example.com', '123456', TEST_SECRET);
    const repeated = await hashOtpCode('ada@example.com', '123456', TEST_SECRET);
    const otherEmail = await hashOtpCode('grace@example.com', '123456', TEST_SECRET);
    const otherCode = await hashOtpCode('ada@example.com', '654321', TEST_SECRET);

    expect(digest).toBe(repeated);
    expect(digest).toMatch(/^hmac-sha256:v1:[0-9a-f]{64}$/u);
    expect(digest).not.toContain('123456');
    expect(otherEmail).not.toBe(digest);
    expect(otherCode).not.toBe(digest);
  });
});
