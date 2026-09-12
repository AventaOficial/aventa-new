/**
 * FASE 8.2 — auditoría limitada de superficies públicas Chedraui.
 * No persiste. No activa flags. Presupuesto pequeño de requests.
 */
import { parseJsonLdProducts } from '../lib/hunter/dayToDay/parsePublicProductHtml';
import { parseRobotsTxt, isUrlAllowedByRobots } from '../lib/hunter/dayToDay/robots';
import { qualifyCandidate } from '../lib/hunter/dealQualification/qualifyCandidate';
import { scanProductBoundPromotionText } from '../lib/hunter/dealQualification/signals';
import { BOT_INGEST_USER_AGENT } from '../lib/bots/ingest/ingestHttp';

async function fetchText(url: string) {
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': BOT_INGEST_USER_AGENT,
      'Accept-Language': 'es-MX,es;q=0.9',
    },
    redirect: 'follow',
    cache: 'no-store',
  });
  const text = await res.text();
  return { status: res.status, text, ms: Date.now() - t0, finalUrl: res.url, ok: res.ok };
}

function ldTypes(html: string): string[] {
  const types = new Set<string>();
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of blocks) {
    try {
      const parsed: unknown = JSON.parse(m[1] ?? '');
      const walk = (n: unknown) => {
        if (!n) return;
        if (Array.isArray(n)) {
          n.forEach(walk);
          return;
        }
        if (typeof n === 'object') {
          const o = n as Record<string, unknown>;
          if (o['@type']) types.add(String(o['@type']));
          if (o['@graph']) walk(o['@graph']);
        }
      };
      walk(parsed);
    } catch {
      /* ignore malformed ld+json */
    }
  }
  return [...types];
}

function productLinks(html: string, origin: string): string[] {
  const out: string[] = [];
  const re = /href=["']([^"']+\/p)(?:["'?#])/gi;
  for (const m of html.matchAll(re)) {
    try {
      const u = new URL(m[1]!, origin).href;
      if (!out.includes(u)) out.push(u);
    } catch {
      /* skip */
    }
  }
  return out;
}

function promoHeadingSnippets(html: string): string[] {
  const idx = html.search(/<h[1-3][^>]*>\s*Promociones/i);
  if (idx < 0) return [];
  const slice = html
    .slice(idx, idx + 2500)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [slice.slice(0, 400)];
}

async function main() {
  const robots = await fetchText('https://www.chedraui.com.mx/robots.txt');
  const rules = parseRobotsTxt(robots.text);
  const sm = await fetchText('https://www.chedraui.com.mx/sitemap.xml');
  const sitemapLocs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]);

  const surfaces = [
    'https://www.chedraui.com.mx/promociones/nuestras-marcas',
    'https://www.chedraui.com.mx/promociones/perecederos',
    'https://www.chedraui.com.mx/super-extra',
    'https://www.chedraui.com.mx/promociones-exclusivas',
  ];

  const rows = [];
  for (const url of surfaces) {
    const allowed = isUrlAllowedByRobots(url, rules);
    const page = await fetchText(url);
    const products = parseJsonLdProducts(page.text, url);
    const links = productLinks(page.text, 'https://www.chedraui.com.mx');
    const withOrig = products.filter(
      (p) => p.originalPrice != null && p.price != null && p.originalPrice > p.price,
    );
    const withPromo = products.filter((p) => p.promotionType);
    rows.push({
      url,
      allowed,
      status: page.status,
      ms: page.ms,
      bytes: page.text.length,
      ldTypes: ldTypes(page.text),
      jsonLdProducts: products.length,
      withOriginal: withOrig.length,
      withPromoType: withPromo.length,
      productLinks: links.length,
      sampleProducts: products.slice(0, 4).map((p) => ({
        title: p.title,
        price: p.price,
        original: p.originalPrice,
        promo: p.promotionType,
        sku: p.productId,
        image: Boolean(p.image),
      })),
      sampleLinks: links.slice(0, 6),
      hasState: /__STATE__/.test(page.text),
    });
  }

  const pdps = [
    'https://www.chedraui.com.mx/te-doblett-manzanilla-2x1-gratis-20-sobres-48g-3706076/p',
    'https://www.chedraui.com.mx/limpiador-multiusos-liquido-chedraui-frescura-manzana-canela-2l-3549945/p',
    'https://www.chedraui.com.mx/detergente-liquido-mas-blanc-y-clar-465l-3902009/p',
  ];
  const pdpRows = [];
  for (const url of pdps) {
    const page = await fetchText(url);
    const products = parseJsonLdProducts(page.text, url);
    const snippets = promoHeadingSnippets(page.text);
    const scan = scanProductBoundPromotionText(`${products[0]?.title ?? ''} ${snippets.join(' ')}`);
    const q = qualifyCandidate({
      currentPrice: products[0]?.price ?? null,
      originalPrice: products[0]?.originalPrice ?? null,
      explicitDiscountPercent: products[0]?.explicitDiscountPercent ?? null,
      explicitSavings: products[0]?.explicitSavings ?? null,
      promotionKind: scan.kind || products[0]?.promotionType || null,
      promotionBoundToProduct: Boolean(scan.kind || products[0]?.promotionBoundToProduct),
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: products[0]?.originalPrice != null ? 'source_explicit' : 'unknown',
    });
    pdpRows.push({
      url,
      allowed: isUrlAllowedByRobots(url, rules),
      status: page.status,
      ms: page.ms,
      product: products[0]
        ? {
            title: products[0].title,
            price: products[0].price,
            original: products[0].originalPrice,
            image: Boolean(products[0].image),
            sku: products[0].productId,
            promo: products[0].promotionType,
          }
        : null,
      promoSnippets: snippets,
      scan,
      qualification: q.qualification,
      reasons: q.reasons,
    });
  }

  console.log(
    JSON.stringify(
      {
        crawlDelay: /crawl-delay/i.test(robots.text),
        sitemapLocs,
        listing: rows,
        pdps: pdpRows,
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
