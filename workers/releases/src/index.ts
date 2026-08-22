export interface Env {
  BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = URL.parse(request.url);
    if (url === null) {
      return new Response('Invalid request URL', { status: 400 });
    }
    try {
      return await handleRequest(url.pathname, env);
    } catch {
      // R2 failures must not surface as an opaque Worker exception (1101).
      return new Response('Release artifact store temporarily unavailable', {
        status: 503,
        headers: { 'Content-Type': 'text/plain', 'Retry-After': '60' },
      });
    }
  },
} satisfies ExportedHandler<Env>;

/** Serve release metadata and artifacts from R2. Throws only on storage failure. */
async function handleRequest(path: string, env: Env): Promise<Response> {
  // Endpoint: GET /latest-version
  // Returns the semantic version string of the latest stable release (e.g. "0.1.215")
  if (path === '/latest-version') {
    const object = await env.BUCKET.get('latest-version');
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
        'Cache-Control': 'public, max-age=60',
      },
    });
  }

  // Endpoint: GET /download/:filename
  // Serves release artifacts (binaries, sigs, sha256)
  if (path.startsWith('/download/')) {
    // An empty key is invalid in R2 and would throw instead of returning a miss.
    const filename = path.slice('/download/'.length);
    if (filename.length === 0) {
      return new Response('Not Found', { status: 404 });
    }
    const object = await env.BUCKET.get(filename);

    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return new Response(object.body, {
      headers,
    });
  }

  // Default: 404
  return new Response('Not Found', { status: 404 });
}
