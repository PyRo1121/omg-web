import { Effect, Exit } from 'effect';
import * as Schema from 'effect/Schema';

const REFERENCE_VERSION = 'v1';
const REFERENCE_MAX_LENGTH = 2048;
const SECRET_CONTEXT = 'omg-organization-invitation-reference-v1';
const Secret = Schema.String.check(Schema.isMinLength(16), Schema.isMaxLength(512));
const InvitationId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const Expiration = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64));
const Reference = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(REFERENCE_MAX_LENGTH),
  Schema.isPattern(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u)
);
const ReferencePayload = Schema.Struct({
  expiresAt: Expiration,
  id: InvitationId,
});

/** An invitation reference was malformed, expired, or failed authentication. */
export class OrganizationInvitationReferenceInvalid extends Error {
  readonly _tag = 'OrganizationInvitationReferenceInvalid';

  constructor() {
    super('Organization invitation reference is invalid');
  }
}

/** The runtime could not perform the invitation-reference cryptography. */
export class OrganizationInvitationReferenceUnavailable extends Error {
  readonly _tag = 'OrganizationInvitationReferenceUnavailable';

  constructor(override readonly cause?: unknown) {
    super('Organization invitation reference is unavailable');
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (value.length === 0 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    return null;
  }
  const padded =
    value.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function copyBytes(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function encryptionKey(
  secret: string
): Effect.Effect<CryptoKey, OrganizationInvitationReferenceUnavailable> {
  return Effect.tryPromise({
    try: async () => {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${SECRET_CONTEXT}\u0000${secret}`)
      );
      return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
        'encrypt',
        'decrypt',
      ]);
    },
    catch: cause => new OrganizationInvitationReferenceUnavailable(cause),
  });
}

function expirationValue(
  value: Date | string
): Effect.Effect<string, OrganizationInvitationReferenceInvalid> {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? Effect.fail(new OrganizationInvitationReferenceInvalid())
    : Effect.succeed(date.toISOString());
}

/**
 * Encrypt one Better Auth invitation ID into a browser-safe opaque reference.
 *
 * The ID remains inside the server-side token payload and is never placed in
 * page data, markup, or the invitation URL in clear text.
 */
export function createOrganizationInvitationReference(
  invitationId: string,
  expiresAt: Date | string,
  secret: string
): Effect.Effect<
  string,
  OrganizationInvitationReferenceInvalid | OrganizationInvitationReferenceUnavailable
> {
  return Effect.gen(function* () {
    const parsedSecret = yield* Schema.decodeUnknownEffect(Secret)(secret).pipe(
      Effect.mapError(() => new OrganizationInvitationReferenceUnavailable())
    );
    const id = yield* Schema.decodeUnknownEffect(InvitationId)(invitationId).pipe(
      Effect.mapError(() => new OrganizationInvitationReferenceInvalid())
    );
    const expires = yield* expirationValue(expiresAt);
    const key = yield* encryptionKey(parsedSecret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify({ expiresAt: expires, id }));
    const ciphertext = yield* Effect.tryPromise({
      try: () => crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
      catch: cause => new OrganizationInvitationReferenceUnavailable(cause),
    });
    return `${REFERENCE_VERSION}.${encodeBase64Url(iv)}.${encodeBase64Url(
      new Uint8Array(ciphertext)
    )}`;
  });
}

/**
 * Resolve an opaque invitation reference back to its server-only Better Auth ID.
 *
 * @param reference - The bounded opaque value read from a cookie or URL.
 * @param secret - The Better Auth secret used to authenticate the reference.
 * @param now - The clock used for deterministic expiry checks.
 */
export function resolveOrganizationInvitationReference(
  reference: string,
  secret: string,
  now: Date = new Date()
): Effect.Effect<
  string,
  OrganizationInvitationReferenceInvalid | OrganizationInvitationReferenceUnavailable
> {
  return Effect.gen(function* () {
    const parsedReference = Schema.decodeUnknownExit(Reference)(reference);
    if (Exit.isFailure(parsedReference)) {
      return yield* Effect.fail(new OrganizationInvitationReferenceInvalid());
    }
    if (Number.isNaN(now.getTime())) {
      return yield* Effect.fail(new OrganizationInvitationReferenceInvalid());
    }
    const parts = parsedReference.value.split('.');
    if (parts.length !== 3) {
      return yield* Effect.fail(new OrganizationInvitationReferenceInvalid());
    }
    const version = parts[0];
    const encodedIv = parts[1];
    const encodedCiphertext = parts[2];
    if (
      version !== REFERENCE_VERSION ||
      encodedIv === undefined ||
      encodedCiphertext === undefined
    ) {
      return yield* Effect.fail(new OrganizationInvitationReferenceInvalid());
    }
    const iv = decodeBase64Url(encodedIv);
    const ciphertext = decodeBase64Url(encodedCiphertext);
    if (iv === null || iv.length !== 12 || ciphertext === null || ciphertext.length === 0) {
      return yield* Effect.fail(new OrganizationInvitationReferenceInvalid());
    }
    const parsedSecret = yield* Schema.decodeUnknownEffect(Secret)(secret).pipe(
      Effect.mapError(() => new OrganizationInvitationReferenceUnavailable())
    );
    const key = yield* encryptionKey(parsedSecret);
    const plaintext = yield* Effect.tryPromise({
      try: () =>
        crypto.subtle.decrypt({ name: 'AES-GCM', iv: copyBytes(iv) }, key, copyBytes(ciphertext)),
      catch: () => new OrganizationInvitationReferenceInvalid(),
    });
    const parsedJson = Schema.decodeUnknownExit(Schema.fromJsonString(Schema.Unknown))(
      new TextDecoder().decode(new Uint8Array(plaintext))
    );
    if (Exit.isFailure(parsedJson)) {
      return yield* Effect.fail(new OrganizationInvitationReferenceInvalid());
    }
    const payload = Schema.decodeUnknownExit(ReferencePayload)(parsedJson.value);
    if (Exit.isFailure(payload)) {
      return yield* Effect.fail(new OrganizationInvitationReferenceInvalid());
    }
    const expiresAt = new Date(payload.value.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
      return yield* Effect.fail(new OrganizationInvitationReferenceInvalid());
    }
    return payload.value.id;
  });
}

/** Name of the temporary HttpOnly cookie used while an invite recipient signs in. */
export const ORGANIZATION_INVITATION_REFERENCE_COOKIE = 'omg-organization-invitation';

/** URL path that consumes an opaque organization invitation reference. */
export const ORGANIZATION_INVITATION_ACCEPT_PATH = '/dashboard/organization/invitations/accept/';
