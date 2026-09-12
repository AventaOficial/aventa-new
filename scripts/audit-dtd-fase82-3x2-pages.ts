import { BOT_INGEST_USER_AGENT } from '../lib/bots/ingest/ingestHttp';
import { parseRobotsTxt, isUrlAllowedByRobots } from '../lib/hunter/dayToDay/robots';
import { scanProductBoundPromotionText } from '../lib/hunter/dealQualification/signals';

async function fetchText(url: string) {
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': BOT_INGEST_USER_AGENT,
      'Accept-Language': 'es-MX,es;q=0.9',
    },
    cache: 'no-store',
  });
  return { text: await res.text(), status: res.status, ms: Date.now() - t0 };
}

function items(html: string) {
  const out: Array<{ name: string; sku: unknown; url: unknown; price: unknown; image: boolean }> = [];
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(m[1] ?? '') as {
        itemListElement?: Array<{
          item?: {
            name?: string;
            sku?: string;
            image?: unknown;
            '@id'?: string;
            url?: string;
            offers?: { price?: number; lowPrice?: number; offers?: Array<{ price?: number }> };
          };
        }>;
      };
      for (const el of parsed.itemListElement ?? []) {
        const item = el.item;
        if (!item?.name) continue;
        const nested = item.offers?.offers?.[0]?.price;
        out.push({
          name: item.name,
          sku: item.sku ?? null,
          url: item['@id'] ?? item.url ?? null,
          price: nested ?? item.offers?.price ?? item.offers?.lowPrice ?? null,
          image: Boolean(item.image),
        });
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

async function main() {
  const robots = parseRobotsTxt(
    (
      await fetch('https://www.chedraui.com.mx/robots.txt', {
        headers: { 'User-Agent': BOT_INGEST_USER_AGENT },
      })
    ).ok
      ? await (await fetch('https://www.chedraui.com.mx/robots.txt')).text()
      : '',
  );
  const urls = [
    'https://www.chedraui.com.mx/3x2-en-cereales-kelloggs-seleccionados',
    'https://www.chedraui.com.mx/3x2-en-articulos-regio-seleccionados',
    'https://www.chedraui.com.mx/3x2-colgate-total-12-y-360',
    'https://www.chedraui.com.mx/3x2-en-galletas-marinela-y-suandy-seleccionadas',
  ];
  const rows = [];
  for (const url of urls) {
    const page = await fetchText(url);
    const list = items(page.text).slice(0, 8);
    const pageScan = scanProductBoundPromotionText(url);
    rows.push({
      url,
      allowed: isUrlAllowedByRobots(url, robots),
      status: page.status,
      ms: page.ms,
      n: list.length,
      pagePromo: pageScan.kind,
      samples: list,
    });
  }
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
