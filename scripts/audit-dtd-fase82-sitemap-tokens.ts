import { BOT_INGEST_USER_AGENT } from '../lib/bots/ingest/ingestHttp';

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: { Accept: 'application/xml,text/html', 'User-Agent': BOT_INGEST_USER_AGENT },
    cache: 'no-store',
  });
  return { text: await res.text(), status: res.status };
}

async function main() {
  const sitemaps = [
    'https://www.chedraui.com.mx/sitemap/product-0.xml',
    'https://www.chedraui.com.mx/sitemap/product-1.xml',
  ];
  const rows = [];
  for (const url of sitemaps) {
    const page = await fetchText(url);
    const locs = [...page.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]!);
    const hits = locs.filter((u) => /2x1|3x2|combo-|liquidac/i.test(u));
    rows.push({ url, status: page.status, locs: locs.length, hits: hits.slice(0, 15), hitCount: hits.length });
  }

  const listings = [
    'https://www.chedraui.com.mx/promociones/frutas-y-verduras',
    'https://www.chedraui.com.mx/promociones/pollo',
    'https://www.chedraui.com.mx/promociones/ofertas-reckitt',
    'https://www.chedraui.com.mx/cupon/cereal',
  ];
  const listRows = [];
  for (const url of listings) {
    const page = await fetchText(url);
    let n = 0;
    const names: string[] = [];
    for (const m of page.text.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    )) {
      try {
        const parsed = JSON.parse(m[1] ?? '') as {
          itemListElement?: Array<{ item?: { name?: string } }>;
        };
        n = parsed.itemListElement?.length ?? 0;
        for (const el of parsed.itemListElement ?? []) {
          if (el.item?.name) names.push(el.item.name);
        }
      } catch {
        /* skip */
      }
    }
    listRows.push({
      url,
      status: page.status,
      n,
      promoNames: names.filter((nm) => /2x1|3x2|combo/i.test(nm)).slice(0, 8),
    });
  }

  console.log(JSON.stringify({ rows, listRows }, null, 2));
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
