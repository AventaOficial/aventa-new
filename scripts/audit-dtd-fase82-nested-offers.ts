import { BOT_INGEST_USER_AGENT } from '../lib/bots/ingest/ingestHttp';
import { parseJsonLdProducts } from '../lib/hunter/dayToDay/parsePublicProductHtml';

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
  return { text: await res.text(), ms: Date.now() - t0, status: res.status };
}

function firstItemOffers(html: string) {
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(m[1] ?? '') as {
        itemListElement?: Array<{ item?: Record<string, unknown> }>;
      };
      const item = parsed.itemListElement?.[0]?.item;
      if (!item) continue;
      return {
        name: item.name,
        sku: item.sku,
        offerType: (item.offers as { '@type'?: string } | undefined)?.['@type'],
        offers: item.offers,
      };
    } catch {
      /* skip */
    }
  }
  return null;
}

async function main() {
  const listing = await fetchText('https://www.chedraui.com.mx/promociones/perecederos');
  const nested = firstItemOffers(listing.text);

  const pdp = await fetchText(
    'https://www.chedraui.com.mx/pechuga-de-pavo-san-rafael-natural-kg-3008618/p',
  );
  const parsedPdp = parseJsonLdProducts(
    pdp.text,
    'https://www.chedraui.com.mx/pechuga-de-pavo-san-rafael-natural-kg-3008618/p',
  );

  const discountPages = [
    'https://www.chedraui.com.mx/15-de-descuento-en-productos-verdes-motivos-seleccionados',
    'https://www.chedraui.com.mx/30-de-descuento-en-productos-vanish-lysol-airwick-brasso-harpic-easy-off-y-finish',
    'https://www.chedraui.com.mx/promociones/jabones',
  ];
  const discountRows = [];
  for (const url of discountPages) {
    const page = await fetchText(url);
    let n = 0;
    let offerTypes: string[] = [];
    let sample: unknown = null;
    for (const m of page.text.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    )) {
      try {
        const parsed = JSON.parse(m[1] ?? '') as {
          '@type'?: string;
          itemListElement?: Array<{ item?: Record<string, unknown> }>;
        };
        const els = parsed.itemListElement ?? [];
        n = els.length;
        offerTypes = els.slice(0, 5).map((el) => String((el.item?.offers as { '@type'?: string } | undefined)?.['@type'] ?? ''));
        sample = els[0]?.item
          ? {
              name: els[0].item.name,
              sku: els[0].item.sku,
              offers: els[0].item.offers,
            }
          : { ldType: parsed['@type'] };
      } catch {
        /* skip */
      }
    }
    discountRows.push({ url, status: page.status, ms: page.ms, bytes: page.text.length, n, offerTypes, sample });
  }

  console.log(JSON.stringify({ nested, pdp: parsedPdp[0] ?? null, discountRows }, null, 2));
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
