import { BOT_INGEST_USER_AGENT } from '../lib/bots/ingest/ingestHttp';
import { parseRobotsTxt, isUrlAllowedByRobots } from '../lib/hunter/dayToDay/robots';
import { scanProductBoundPromotionText } from '../lib/hunter/dealQualification/signals';

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xml',
      'User-Agent': BOT_INGEST_USER_AGENT,
      'Accept-Language': 'es-MX,es;q=0.9',
    },
    cache: 'no-store',
  });
  return { text: await res.text(), status: res.status };
}

function itemNames(html: string): string[] {
  const names: string[] = [];
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(m[1] ?? '') as {
        itemListElement?: Array<{ item?: { name?: string } }>;
      };
      for (const el of parsed.itemListElement ?? []) {
        if (el.item?.name) names.push(el.item.name);
      }
    } catch {
      /* skip */
    }
  }
  return names;
}

async function main() {
  const robots = parseRobotsTxt((await fetchText('https://www.chedraui.com.mx/robots.txt')).text);
  const sm = await fetchText('https://www.chedraui.com.mx/sitemap/custom-user-routes-1.xml');
  const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]!);
  const promoToken = locs.filter((u) => /2x1|3x2|combo|liquidac|cupon|precio-especial/i.test(u));
  const allowed = promoToken.filter((u) => isUrlAllowedByRobots(u, robots));

  const listings = [
    'https://www.chedraui.com.mx/promociones/nuestras-marcas',
    'https://www.chedraui.com.mx/promociones/perecederos',
    'https://www.chedraui.com.mx/promociones/jabones',
  ];
  const nameHits = [];
  for (const url of listings) {
    const page = await fetchText(url);
    const names = itemNames(page.text);
    const hits = names
      .map((n) => ({ n, scan: scanProductBoundPromotionText(n) }))
      .filter((r) => r.scan.kind);
    nameHits.push({ url, n: names.length, hits });
  }

  const samplePages = allowed.slice(0, 3);
  const pageRows = [];
  for (const url of samplePages) {
    const page = await fetchText(url);
    const names = itemNames(page.text);
    pageRows.push({
      url,
      status: page.status,
      bytes: page.text.length,
      itemCount: names.length,
      promoNames: names.filter((n) => scanProductBoundPromotionText(n).kind).slice(0, 5),
      sampleNames: names.slice(0, 4),
    });
  }

  console.log(
    JSON.stringify(
      {
        tokenRoutes: allowed,
        nameHits,
        pageRows,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
