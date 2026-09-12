/**
 * FASE 8.2 — inspección de ItemList / links / sitemap de rutas custom.
 */
import { parseRobotsTxt, isUrlAllowedByRobots } from '../lib/hunter/dayToDay/robots';
import { BOT_INGEST_USER_AGENT } from '../lib/bots/ingest/ingestHttp';

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': BOT_INGEST_USER_AGENT,
      'Accept-Language': 'es-MX,es;q=0.9',
    },
    redirect: 'follow',
    cache: 'no-store',
  });
  return { status: res.status, text: await res.text() };
}

function firstLd(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      out.push(JSON.parse(m[1] ?? ''));
    } catch {
      /* skip */
    }
  }
  return out;
}

function summarizeItemList(node: unknown): Record<string, unknown> {
  const o = node as Record<string, unknown>;
  const els = o.itemListElement;
  if (!Array.isArray(els)) return { type: o['@type'], keys: Object.keys(o) };
  const first = els[0] as Record<string, unknown> | undefined;
  const item = first?.item as Record<string, unknown> | undefined;
  return {
    type: o['@type'],
    numberOfItems: o.numberOfItems ?? els.length,
    firstKeys: first ? Object.keys(first) : [],
    firstItemKeys: item ? Object.keys(item) : [],
    firstUrl: (first?.url as string) || (item?.url as string) || first?.['@id'] || item?.['@id'] || null,
    firstName: (item?.name as string) || (first?.name as string) || null,
    sampleUrls: els.slice(0, 8).map((el) => {
      const e = el as Record<string, unknown>;
      const it = e.item as Record<string, unknown> | undefined;
      return e.url || it?.url || e['@id'] || it?.['@id'] || null;
    }),
  };
}

async function main() {
  const robots = parseRobotsTxt((await fetchText('https://www.chedraui.com.mx/robots.txt')).text);

  const listing = await fetchText('https://www.chedraui.com.mx/promociones/nuestras-marcas');
  const lds = firstLd(listing.text);
  const itemLists = lds.map(summarizeItemList);

  const hrefP = [...listing.text.matchAll(/href="([^"]*\/p[^"]*)"/gi)].slice(0, 8).map((m) => m[1]);
  const hrefPromo = [...listing.text.matchAll(/href="([^"]*promocion[^"]*)"/gi)]
    .slice(0, 12)
    .map((m) => m[1]);

  const pdp = await fetchText(
    'https://www.chedraui.com.mx/limpiador-multiusos-liquido-chedraui-frescura-manzana-canela-2l-3549945/p',
  );
  const idx = pdp.text.search(/3x2/i);
  const around =
    idx >= 0
      ? pdp.text
          .slice(Math.max(0, idx - 180), idx + 220)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : null;

  const custom = await fetchText('https://www.chedraui.com.mx/sitemap/custom-user-routes-1.xml');
  const apps = await fetchText('https://www.chedraui.com.mx/sitemap/custom-apps-routes-1.xml');
  const customLocs = [...custom.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]!);
  const promoLocs = customLocs.filter((u) => /promoc|oferta|descuento|super|liquid|combo|2x1/i.test(u));
  const allowedPromo = promoLocs.filter((u) => isUrlAllowedByRobots(u, robots)).slice(0, 40);

  const appLocs = [...apps.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]!);
  const appPromo = appLocs.filter((u) => /promoc|oferta|descuento|super|liquid/i.test(u)).slice(0, 20);

  console.log(
    JSON.stringify(
      {
        listingStatus: listing.status,
        ldCount: lds.length,
        itemLists,
        hrefP,
        hrefPromo: [...new Set(hrefPromo)].slice(0, 15),
        cleaner3x2: around,
        customRouteCount: customLocs.length,
        allowedPromo,
        appPromo,
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
