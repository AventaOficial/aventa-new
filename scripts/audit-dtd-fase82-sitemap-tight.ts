import { BOT_INGEST_USER_AGENT } from '../lib/bots/ingest/ingestHttp';

async function main() {
  const sm = [
    'https://www.chedraui.com.mx/sitemap/product-10.xml',
    'https://www.chedraui.com.mx/sitemap/product-20.xml',
    'https://www.chedraui.com.mx/sitemap/product-30.xml',
  ];
  for (const u of sm) {
    const r = await fetch(u, {
      headers: { 'User-Agent': BOT_INGEST_USER_AGENT, Accept: 'application/xml' },
    });
    const t = await r.text();
    const locs = [...t.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]!);
    const hits = locs.filter((x) => /-2x1-|2x1-gratis|-3x2-/.test(x));
    console.log(JSON.stringify({ u, status: r.status, n: locs.length, hitCount: hits.length, hits: hits.slice(0, 8) }));
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
