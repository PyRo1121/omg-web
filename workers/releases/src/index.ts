export interface Env {
  BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Endpoint: GET /latest-version
    // Returns the semantic version string of the latest stable release (e.g. "0.1.215")
    if (path === '/latest-version') {
      const object = await env.BUCKET.get('latest-version');
      if (!object) {
        // No version marker in R2 — the release pipeline hasn't synced yet.
        // Return 503 so `omg self-update` reports a clear error instead of
        // silently comparing against a stale hardcoded version.
        return new Response('Version info unavailable. Release pipeline may not have synced to R2 yet.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
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
      const filename = path.replace('/download/', '');
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
  },
};
