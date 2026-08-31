import { createMiddleware } from '@solidjs/start/middleware';
import { applySecurityHeaders } from '../../shared/security-headers';

/** Apply browser security policy and private caching to dynamic account surfaces. */
export function applyResponsePolicy(requestUrl: string, headers: Headers): void {
  const renderedContentSecurityPolicy = headers.get('Content-Security-Policy');
  applySecurityHeaders(headers);
  if (renderedContentSecurityPolicy !== null) {
    headers.set('Content-Security-Policy', renderedContentSecurityPolicy);
  }
  const pathname = new URL(requestUrl).pathname;
  if (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/api/')
  ) {
    headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  }
}

export default createMiddleware({
  onBeforeResponse: event => {
    applyResponsePolicy(event.request.url, event.response.headers);
  },
});
