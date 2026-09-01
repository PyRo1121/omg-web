/** Better Auth cookie revocation failed during browser sign-out. */
class BetterAuthSignOutError extends Error {
  readonly _tag = 'BetterAuthSignOutError';
  constructor(override readonly cause: unknown) {
    super('Better Auth sign-out failed');
  }
}

/** Observable result after the browser's sole session authority is revoked. */
export interface BrowserSignOutResult {
  readonly failures: readonly BetterAuthSignOutError[];
}

/**
 * Revoke Better Auth and return a classified error value instead of rejecting.
 *
 * Plain async by design: a single fallible call needs no Effect machinery, and
 * result-unions are the boundary convention crossing into UI callers.
 */
export async function revokeBetterAuthSession(
  revoke: () => Promise<void>
): Promise<BrowserSignOutResult> {
  try {
    await revoke();
    return { failures: [] };
  } catch (cause: unknown) {
    return { failures: [new BetterAuthSignOutError(cause)] };
  }
}
