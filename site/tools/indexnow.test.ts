import { describe, expect, it, vi } from 'vitest';
import { notifyIndexNow } from './indexnow.mjs';

const key = 'test-key-for-indexnow';
const url = 'https://getomg.xyz/runtimes/node/';

function successfulFetch() {
  return vi.fn(async (input: string, options?: RequestInit) => {
    if (options?.method === 'POST') return new Response(null, { status: 202 });
    if (input.endsWith('/sitemap.xml'))
      return new Response(`<urlset><url><loc>${url}</loc></url></urlset>`);
    if (input.endsWith('.txt')) return new Response(key);
    return new Response(`<html><head><link rel="canonical" href="${url}"></head></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  });
}

describe('changed-page IndexNow notification', () => {
  it('previews a deduplicated batch without any network requests', async () => {
    const fetcher = successfulFetch();
    const result = await notifyIndexNow({ urls: [url, url], key, submit: false }, fetcher);
    expect(result).toEqual({ submitted: false, urls: [url] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.com/',
    'https://getomg.xyz/dashboard/',
    `${url}?token=secret`,
    `${url}#install`,
    'https://getomg.xyz/runtimes/node',
    'https://getomg.xyz/guides/../dashboard/',
  ])('rejects a noncanonical or private URL: %s', async unsafe => {
    const fetcher = successfulFetch();
    await expect(notifyIndexNow({ urls: [unsafe], key, submit: true }, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('submits one batch only after checking the live sitemap, key, and page', async () => {
    const fetcher = successfulFetch();
    const result = await notifyIndexNow({ urls: [url, url], key, submit: true }, fetcher);
    expect(result).toEqual({ submitted: true, status: 202, urls: [url] });
    const call = fetcher.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(call?.[0]).toBe('https://api.indexnow.org/indexnow');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      host: 'getomg.xyz',
      key,
      keyLocation: `https://getomg.xyz/${key}.txt`,
      urlList: [url],
    });
  });

  it('does not submit unpublished URLs', async () => {
    const fetcher = successfulFetch();
    await expect(
      notifyIndexNow(
        { urls: ['https://getomg.xyz/runtimes/not-published/'], key, submit: true },
        fetcher
      )
    ).rejects.toThrow('live sitemap');
    expect(fetcher.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it('does not submit without a matching ownership file', async () => {
    const fetcher = successfulFetch();
    fetcher.mockImplementationOnce(async () => new Response('wrong-key'));
    await expect(notifyIndexNow({ urls: [url], key, submit: true }, fetcher)).rejects.toThrow(
      'ownership'
    );
    expect(fetcher.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it('rejects noindex HTML and does not retry a rate limit', async () => {
    const base = successfulFetch();
    const noindex = vi.fn(async (input: string, options?: RequestInit) =>
      input === url
        ? new Response(
            `<link rel="canonical" href="${url}"><meta name="robots" content="noindex">`,
            {
              headers: { 'Content-Type': 'text/html' },
            }
          )
        : base(input, options)
    );
    await expect(notifyIndexNow({ urls: [url], key, submit: true }, noindex)).rejects.toThrow(
      'indexable'
    );
    const limited = vi.fn(async (input: string, options?: RequestInit) =>
      options?.method === 'POST' ? new Response(null, { status: 429 }) : base(input, options)
    );
    await expect(notifyIndexNow({ urls: [url], key, submit: true }, limited)).rejects.toThrow(
      '429'
    );
    expect(limited.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  });
});
