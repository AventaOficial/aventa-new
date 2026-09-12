import { BOT_INGEST_USER_AGENT } from '../lib/bots/ingest/ingestHttp';
import { qualifyCandidate } from '../lib/hunter/dealQualification/qualifyCandidate';
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
  return { text: await res.text(), ms: Date.now() - t0, status: res.status };
}

function productsFromItemList(html: string) {
  const out: Array<Record<string, unknown>> = [];
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(m[1] ?? '') as Record<string, unknown>;
      const els = parsed.itemListElement;
      if (!Array.isArray(els)) continue;
      for (const el of els) {
        const item = (el as { item?: Record<string, unknown> }).item;
        if (item && String(item['@type'] ?? '').includes('Product')) out.push(item);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

function offerSummary(item: Record<string, unknown>) {
  const offers = item.offers as Record<string, unknown> | undefined;
  const name = String(item.name ?? '');
  const scan = scanProductBoundPromotionText(name + ' ' + String(item.description ?? ''));
  const price = Number(offers?.price ?? offers?.lowPrice);
  const high = Number(offers?.highPrice);
  const q = qualifyCandidate({
    currentPrice: Number.isFinite(price) && price > 0 ? price : null,
    originalPrice: Number.isFinite(high) && high > 0 ? high : null,
    explicitDiscountPercent: null,
    explicitSavings: null,
    promotionKind: scan.kind,
    promotionBoundToProduct: Boolean(scan.kind),
    currentPriceProvenance: 'source_explicit',
    originalPriceProvenance: Number.isFinite(high) && high > 0 ? 'source_explicit' : 'unknown',
  });
  return {
    name: name.slice(0, 80),
    sku: item.sku ?? item.mpn ?? null,
    url: item['@id'] ?? item.url ?? null,
    image: Boolean(item.image),
    price: Number.isFinite(price) ? price : null,
    highPrice: Number.isFinite(high) ? high : null,
    currency: offers?.priceCurrency ?? null,
    offerKeys: offers ? Object.keys(offers) : [],
    promo: scan.kind,
    qualification: q.qualification,
  };
}

async function main() {
  const urls = [
    'https://www.chedraui.com.mx/promociones/nuestras-marcas',
    'https://www.chedraui.com.mx/promociones/perecederos',
    'https://www.chedraui.com.mx/super-extra',
    'https://www.chedraui.com.mx/promociones/nuestras-marcas?page=2',
  ];
  const rows = [];
  for (const url of urls) {
    const page = await fetchText(url);
    const products = productsFromItemList(page.text).slice(0, 10);
    const summaries = products.map(offerSummary);
    const counts = {
      n: summaries.length,
      verified: summaries.filter((s) => s.qualification === 'VERIFIED_DEAL').length,
      promo: summaries.filter((s) => s.qualification === 'PROMOTION').length,
      potential: summaries.filter((s) => s.qualification === 'POTENTIAL_DEAL').length,
      catalog: summaries.filter((s) => s.qualification === 'NO_VERIFIED_DEAL').length,
      withHigh: summaries.filter((s) => s.highPrice != null && s.price != null && s.highPrice > s.price)
        .length,
    };
    rows.push({ url, status: page.status, ms: page.ms, counts, samples: summaries.slice(0, 6) });
  }
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
