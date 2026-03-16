import { NextResponse } from 'next/server';

const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; AVENTA-Bot/1.0; +https://aventaofertas.com)';

function getDomain(hostname: string): string {
  return hostname.replace(/^www\./, '').toLowerCase();
}

function getMetaContent(html: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const propertyMatch = html.match(
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      'i'
    )
  );
  if (propertyMatch) return propertyMatch[1].trim() || null;
  const contentFirstMatch = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
      'i'
    )
  );
  return contentFirstMatch ? contentFirstMatch[1].trim() || null : null;
}

function getById(html: string, id: string, attr: 'content' | 'src' | 'text'): string | null {
  const idEsc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (attr === 'text') {
    const m = html.match(new RegExp(`<[^>]+id=["']${idEsc}["'][^>]*>([\\s\\S]*?)<\\/`, 'i'));
    return m ? m[1].replace(/<[^>]+>/g, '').trim() || null : null;
  }
  const m = html.match(
    new RegExp(`<[^>]+id=["']${idEsc}["'][^>]+${attr}=["']([^"']*)["']`, 'i')
  );
  if (m) return m[1].trim() || null;
  const m2 = html.match(
    new RegExp(`<[^>]+${attr}=["']([^"']*)["'][^>]+id=["']${idEsc}["']`, 'i')
  );
  return m2 ? m2[1].trim() || null : null;
}

function absoluteUrl(base: string, path: string | null): string | null {
  if (!path || !path.trim()) return null;
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed, base).href;
  } catch {
    return null;
  }
}

function parseAmazon(html: string, base: string): { title: string | null; image: string | null; store: string } {
  const title =
    getMetaContent(html, 'og:title') ||
    getById(html, 'productTitle', 'text') ||
    null;
  const rawImage =
    getMetaContent(html, 'og:image') ||
    getById(html, 'landingImage', 'src') ||
    null;
  const image = absoluteUrl(base, rawImage);
  return {
    title: title && title.length > 0 ? title : null,
    image,
    store: 'Amazon',
  };
}

function parseMercadoLibre(html: string, base: string): { title: string | null; image: string | null; store: string } {
  const title = getMetaContent(html, 'og:title') || null;
  const rawImage = getMetaContent(html, 'og:image') || null;
  const image = absoluteUrl(base, rawImage);
  return {
    title: title && title.length > 0 ? title : null,
    image,
    store: 'Mercado Libre',
  };
}

function parseGeneric(html: string, base: string): { title: string | null; image: string | null; store: string | null } {
  const title =
    getMetaContent(html, 'og:title') ||
    getMetaContent(html, 'twitter:title') ||
    null;
  const rawImage =
    getMetaContent(html, 'og:image') ||
    getMetaContent(html, 'twitter:image') ||
    null;
  const image = absoluteUrl(base, rawImage);
  const store =
    getMetaContent(html, 'og:site_name') ||
    getMetaContent(html, 'application-name') ||
    null;
  return {
    title: title && title.length > 0 ? title : null,
    image,
    store: store && store.length > 0 ? store : null,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!rawUrl) {
      return NextResponse.json({
        title: null,
        image: null,
        store: null,
      });
    }

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return NextResponse.json({
        title: null,
        image: null,
        store: null,
      });
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      return NextResponse.json({
        title: null,
        image: null,
        store: null,
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json({
        title: null,
        image: null,
        store: null,
      });
    }

    const html = await res.text();
    const base = url.origin + url.pathname;
    const domain = getDomain(url.hostname);

    const isAmazon =
      domain === 'amazon.com' ||
      domain === 'amazon.com.mx' ||
      domain.endsWith('.amazon.com') ||
      domain.endsWith('.amazon.com.mx');
    if (isAmazon) {
      const data = parseAmazon(html, base);
      return NextResponse.json(data);
    }

    const isMercadoLibre =
      domain === 'mercadolibre.com' ||
      domain === 'mercadolibre.com.mx' ||
      domain.endsWith('.mercadolibre.com') ||
      domain.endsWith('.mercadolibre.com.mx');
    if (isMercadoLibre) {
      const data = parseMercadoLibre(html, base);
      return NextResponse.json(data);
    }

    const data = parseGeneric(html, base);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      title: null,
      image: null,
      store: null,
    });
  }
}
