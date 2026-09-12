/**
 * HTTP público Day-to-Day. Reutiliza fetchWithTimeout.
 * No reintenta. No rota proxies. No evade challenges.
 */
import { gunzipSync } from 'zlib';
import { BOT_INGEST_USER_AGENT } from '@/lib/bots/ingest/ingestHttp';
import { fetchWithTimeout, HUNTER_HTTP_TIMEOUT_MS, isTimeoutAbortError } from '@/lib/server/fetchWithTimeout';

function decodeFetchedBody(url: string, buf: Buffer): string {
  const magic = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (magic || /\.gz(?:$|\?)/i.test(url)) {
    try {
      return gunzipSync(buf).toString('utf8');
    } catch {
      return buf.toString('utf8');
    }
  }
  return buf.toString('utf8');
}

export type PublicFetchResult = {
  ok: boolean;
  status: number;
  text: string;
  timedOut: boolean;
  finalUrl: string;
};

export async function fetchPublicText(
  url: string,
  timeoutMs: number = HUNTER_HTTP_TIMEOUT_MS,
): Promise<PublicFetchResult> {
  try {
    const res = await fetchWithTimeout(url, {
      timeoutMs,
      headers: {
        Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': BOT_INGEST_USER_AGENT,
        'Accept-Language': 'es-MX,es;q=0.9',
      },
      redirect: 'follow',
      cache: 'no-store',
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const text = decodeFetchedBody(url, buf);
    return {
      ok: res.ok,
      status: res.status,
      text,
      timedOut: false,
      finalUrl: res.url || url,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: '',
      timedOut: isTimeoutAbortError(error),
      finalUrl: url,
    };
  }
}

export function extractSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim()).filter(Boolean);
}

export function looksLikeProductUrl(url: string): boolean {
  return /\/p(?:\/|$|\?)|\/ip\/|\/producto\/|\/product\//i.test(url);
}
