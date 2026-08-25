export interface Env {
  BUCKET: R2Bucket;
}

const MAX_ATTACHMENT_FILENAME_LENGTH = 128;
const RELEASE_OBJECT_PREFIX = 'releases/';
const RELEASE_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** R2 lookup or stream failed at the storage layer (distinct from a code defect). */
class ReleaseStoreUnavailableError extends Error {
  readonly _tag = 'ReleaseStoreUnavailableError';

  constructor(override readonly cause: unknown) {
    super('Release artifact store is unavailable');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = URL.parse(request.url);
    if (url === null) {
      return new Response('Invalid request URL', { status: 400 });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    }
    try {
      return await handleRequest(url.pathname, env);
    } catch (error: unknown) {
      // Only storage failures are mapped to a 503; any other defect escapes so
      // the platform's observability logs record it as an exception instead of
      // masking a code regression as an outage.
      if (error instanceof ReleaseStoreUnavailableError) {
        return new Response('Release artifact store temporarily unavailable', {
          status: 503,
          headers: { 'Content-Type': 'text/plain', 'Retry-After': '60' },
        });
      }
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;

/** Serve release metadata and artifacts from R2. Throws only on storage failure. */
async function handleRequest(path: string, env: Env): Promise<Response> {
  // Endpoint: GET /latest-version
  // Returns the semantic version string of the latest stable release (e.g. "0.1.215")
  if (path === '/latest-version') {
    const object = await readReleaseObject(env, `${RELEASE_OBJECT_PREFIX}latest-version`);
    if (!object) {
      // No version marker in R2 — the release pipeline hasn't synced yet.
      // Return 503 so `omg self-update` reports a clear error instead of
      // silently comparing against a stale hardcoded version.
      return new Response(
        'Version info unavailable. Release pipeline may not have synced to R2 yet.',
        {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        }
      );
    }
    return new Response(object.body, {
      headers: {
        'Content-Type': 'text/plain',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }

  // Endpoint: GET /download/:filename
  // Serves release artifacts (binaries, sigs, sha256)
  if (path.startsWith('/download/')) {
    // Artifacts are flat, bounded filenames under one dedicated R2 prefix.
    // Reject path separators and dot-segments rather than exposing arbitrary
    // bucket keys to anyone who can guess them.
    const filename = path.slice('/download/'.length);
    if (!RELEASE_FILENAME_PATTERN.test(filename) || filename === '.' || filename === '..') {
      return new Response('Not Found', { status: 404 });
    }
    const object = await readReleaseObject(env, `${RELEASE_OBJECT_PREFIX}${filename}`);

    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    // Artifacts must never render inline on this origin: force a download with
    // an opaque content type so any HTML/SVG that ever lands in the bucket is
    // inert rather than stored XSS adjacent to the update infrastructure.
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${attachmentFilename(filename)}"`);
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(object.body, {
      headers,
    });
  }

  // Default: 404
  return new Response('Not Found', { status: 404 });
}

/** Fetch an object from R2, rethrowing storage failures as a typed error. */
async function readReleaseObject(env: Env, key: string): Promise<R2ObjectBody | null> {
  try {
    return await env.BUCKET.get(key);
  } catch (cause: unknown) {
    throw new ReleaseStoreUnavailableError(cause);
  }
}

/**
 * Reduce a raw R2 key to a safe `Content-Disposition` filename: basename only,
 * restricted to word characters, dots, and hyphens, length-capped.
 */
function attachmentFilename(rawKey: string): string {
  const base = rawKey.slice(Math.max(rawKey.lastIndexOf('/'), rawKey.lastIndexOf('\\')) + 1);
  const sanitized = base.replaceAll(/[^\w.-]/g, '_').slice(0, MAX_ATTACHMENT_FILENAME_LENGTH);
  return sanitized.length > 0 ? sanitized : 'download';
}
