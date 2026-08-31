import { Cause, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import { BoundedFormRejected, readBoundedUrlEncodedForm } from './bounded-form.server';

function failureOf(exit: Exit.Exit<URLSearchParams, BoundedFormRejected | Error>): Error | null {
  return Exit.isSuccess(exit) ? null : Option.getOrNull(Cause.findErrorOption(exit.cause));
}

describe('bounded URL-encoded forms', () => {
  it('rejects malformed UTF-8 as invalid form input', async () => {
    const prefix = new TextEncoder().encode('name=');
    const body = new Uint8Array(prefix.byteLength + 1);
    body.set(prefix);
    body[prefix.byteLength] = 0xff;
    const request = new Request('https://omg.latham.cloud/dashboard/organization/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const exit = await Effect.runPromiseExit(readBoundedUrlEncodedForm(request, 1024));
    const failure = failureOf(exit);

    expect(failure).toBeInstanceOf(BoundedFormRejected);
    expect(failure).toMatchObject({ status: 400, reason: 'invalid' });
  });
});
