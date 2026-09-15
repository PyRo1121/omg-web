import { pathToFileURL } from 'node:url';

const origin = 'https://getomg.xyz';
const publicPath =
  /^\/(?:$|(?:docs|updates|security|privacy|terms|runtimes|guides|compare)\/(?:[a-z0-9-]+\/)?)$/u;

/**
 * Notify only explicitly selected, published canonical pages. A dry run never
 * contacts the site or a search engine. No automatic retries or full-site pings.
 * @param {{urls: string[], key: string, submit: boolean}} options
 * @param {typeof fetch} fetcher
 */
export async function notifyIndexNow({ urls, key, submit }, fetcher = fetch) {
  if (!/^[a-zA-Z0-9-]{8,128}$/u.test(key))
    throw new Error('Set a valid INDEXNOW_KEY and host its ownership file first.');
  const unique = [...new Set(urls)];
  if (unique.length === 0 || unique.length > 100)
    throw new Error('Supply 1–100 changed public page URLs.');
  for (const value of unique) {
    const url = new URL(value);
    if (
      url.origin !== origin ||
      url.href !== value ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      !publicPath.test(url.pathname)
    ) {
      throw new Error(
        'Only canonical getomg.xyz public page URLs without queries or fragments are allowed.'
      );
    }
  }
  if (!submit) return { submitted: false, urls: unique };

  const keyLocation = `${origin}/${key}.txt`;
  const ownership = await fetcher(keyLocation, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (ownership.status !== 200 || (await ownership.text()).trim() !== key)
    throw new Error('The live ownership file does not match INDEXNOW_KEY.');
  const sitemap = await fetcher(`${origin}/sitemap.xml`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (sitemap.status !== 200) throw new Error('Cannot read the live sitemap.');
  const published = new Set(
    [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/gu)].map(match => match[1])
  );
  for (const url of unique) {
    if (!published.has(url))
      throw new Error(
        'A selected URL is absent from the live sitemap. Deploy it before submission.'
      );
    const page = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    const html = await page.text();
    if (
      page.status !== 200 ||
      !page.headers.get('Content-Type')?.includes('text/html') ||
      /noindex/iu.test(page.headers.get('X-Robots-Tag') ?? '') ||
      /<meta\b[^>]*\bcontent=["'][^"']*noindex/iu.test(html) ||
      !html.includes(`rel="canonical" href="${url}"`)
    ) {
      throw new Error('A selected page is not a successful, self-canonical, indexable HTML page.');
    }
  }
  const response = await fetcher('https://api.indexnow.org/indexnow', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'getomg.xyz', key, keyLocation, urlList: unique }),
  });
  if (response.status !== 200 && response.status !== 202)
    throw new Error(`IndexNow returned HTTP ${response.status}. No automatic retry was made.`);
  return { submitted: true, status: response.status, urls: unique };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const submit = args.includes('--submit');
  const urls = args.filter(arg => arg !== '--submit');
  try {
    const result = await notifyIndexNow({ urls, key: process.env['INDEXNOW_KEY'] ?? '', submit });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.submitted)
      process.stdout.write(
        'Received by IndexNow; this is not confirmation of indexing or ranking.\n'
      );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'IndexNow notification failed.'}\n`
    );
    process.exitCode = 1;
  }
}
