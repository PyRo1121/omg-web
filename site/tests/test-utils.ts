interface SiteSessionResponseOptions {
  readonly token?: string;
  readonly expiresAt?: string;
  readonly customerId?: string;
}

export function siteSessionResponse(options: SiteSessionResponseOptions = {}): Response {
  return Response.json({
    token: options.token ?? 'server-only-token',
    expiresAt: options.expiresAt ?? '2026-09-01T00:00:00.000Z',
    customerId: options.customerId ?? 'customer-id',
  });
}

export function failClosedDatabase(): { prepare(): never } {
  return {
    prepare() {
      throw new Error('Test must not access D1');
    },
  };
}
