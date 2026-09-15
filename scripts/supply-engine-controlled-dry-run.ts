/**
 * Corrida controlada del Supply Engine (dry_run) con candidatos sintéticos.
 * No escribe ofertas. Útil para validar métricas DISCOVERED→APPROVAL_READY.
 *
 *   npx tsx scripts/supply-engine-controlled-dry-run.ts
 */
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '../lib/bots/ingest/fetchParsedOfferMetadata';
import {
  applyNicheProfileToIngestConfig,
  nicheProfileById,
  runSupplyEngine,
  summarizeSupplyEngineReport,
  toSupplyCandidate,
  type SupplySource,
} from '../lib/hunter/supply';
import { communitySupplySource } from '../lib/hunter/supply/community';

function meta(over: Partial<ParsedOfferMetadata>): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-x',
    title: 'Producto',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/x.jpg',
    discountPrice: 100,
    originalPrice: 200,
    discountPercent: 50,
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      discountPercentProvenance: 'source_explicit',
    },
    ...over,
  };
}

function cand(opts: {
  id: string;
  title: string;
  price: number;
  original: number | null;
  discount: number;
  signals?: ParsedOfferMetadata['signals'];
}) {
  const url = `https://articulo.mercadolibre.com.mx/MLM-${opts.id}`;
  return toSupplyCandidate({
    item: {
      url,
      source: 'ml_api',
      sourceDetail: 'controlled-dry-run',
      precomputedMeta: meta({
        canonicalUrl: url,
        title: opts.title,
        discountPrice: opts.price,
        originalPrice: opts.original,
        discountPercent: opts.discount,
        signals: { ...meta({}).signals, ...opts.signals },
      }),
    },
    hunterSourceId: 'ml_api_legacy',
    sourceId: 'ml_api_legacy',
    sourceFamily: 'official_api',
    sourceType: 'official_api',
  });
}

function sourceWith(candidates: ReturnType<typeof cand>[]): SupplySource {
  return {
    ...communitySupplySource,
    id: 'ml_api_legacy',
    displayName: 'ML API (controlled)',
    family: 'official_api',
    type: 'official_api',
    hunterSourceId: 'ml_api_legacy',
    ingestSourceId: 'ml_api',
    isEnabled: () => true,
    isConfigured: () => true,
    async collect() {
      return { ok: true, candidates };
    },
  };
}

const FIXTURES = {
  beauty: [
    cand({
      id: 'beauty-low',
      title: 'Perfume Chanel 100ml',
      price: 1299,
      original: 2199,
      discount: 41,
      signals: {
        historyReady: true,
        priceLowest90d: 1299,
        habitual30d: 1899,
        savingsVsHabitualPct: 31,
        effectiveDiscountPercent: 31,
        priceVsLowest90dPct: 0,
        categoryId: 'MLM1246',
      },
    }),
    cand({
      id: 'beauty-fake',
      title: 'Crema facial 50ml',
      price: 299,
      original: 599,
      discount: 50,
      signals: {
        historyReady: true,
        priceLowest90d: 289,
        habitual30d: 299,
        savingsVsHabitualPct: 0,
        effectiveDiscountPercent: 0,
        suspectedArtificialListPrice: true,
        priceVsLowest90dPct: 3,
        categoryId: 'MLM1246',
      },
    }),
    cand({
      id: 'beauty-insufficient',
      title: 'Labial matte',
      price: 149,
      original: 249,
      discount: 40,
      signals: {
        historyReady: false,
        categoryId: 'MLM1246',
      },
    }),
  ],
  electronics: [
    cand({
      id: 'elec-drop',
      title: 'Smartphone 128GB',
      price: 4999,
      original: 7999,
      discount: 37,
      signals: {
        historyReady: true,
        priceLowest90d: 4899,
        habitual30d: 6500,
        savingsVsHabitualPct: 23,
        effectiveDiscountPercent: 23,
        priceVsLowest90dPct: 2,
        categoryId: 'MLM1055',
      },
    }),
    cand({
      id: 'elec-dup-a',
      title: 'Audifonos BT',
      price: 599,
      original: 999,
      discount: 40,
      signals: {
        historyReady: true,
        priceLowest90d: 580,
        habitual30d: 850,
        savingsVsHabitualPct: 29,
        effectiveDiscountPercent: 29,
        priceVsLowest90dPct: 3,
        categoryId: 'MLM1000',
      },
    }),
    cand({
      id: 'elec-dup-b',
      title: 'Audifonos BT',
      price: 599,
      original: 999,
      discount: 40,
      signals: {
        historyReady: true,
        priceLowest90d: 580,
        habitual30d: 850,
        savingsVsHabitualPct: 29,
        effectiveDiscountPercent: 29,
        priceVsLowest90dPct: 3,
        categoryId: 'MLM1000',
      },
    }),
  ],
  day_to_day: [
    cand({
      id: 'dtd-1',
      title: 'Detergente 5L',
      price: 129,
      original: 179,
      discount: 28,
      signals: {
        historyReady: true,
        priceLowest90d: 125,
        habitual30d: 165,
        savingsVsHabitualPct: 22,
        effectiveDiscountPercent: 22,
        priceVsLowest90dPct: 3,
        categoryId: 'MLM1430',
      },
    }),
    cand({
      id: 'dtd-anomaly',
      title: 'Freidora de aire 5L',
      price: 799,
      original: 2499,
      discount: 68,
      signals: {
        historyReady: true,
        priceLowest90d: 1199,
        habitual30d: 1899,
        savingsVsHabitualPct: 58,
        effectiveDiscountPercent: 58,
        priceVsLowest90dPct: -33,
        categoryId: 'MLM1575',
      },
    }),
  ],
} as const;

async function main() {
  const totals = {
    discovered: 0,
    unique: 0,
    duplicates: 0,
    insufficientEvidence: 0,
    falseDiscounts: 0,
    historicalLows: 0,
    priceDrops: 0,
    anomalies: 0,
    approvalReady: 0,
    verified: 0,
    rejected: 0,
    sourceFailures: 0,
  };

  for (const nicheId of ['beauty', 'electronics', 'day_to_day'] as const) {
    const niche = nicheProfileById(nicheId)!;
    const fixtures = FIXTURES[nicheId];
    // electronics: same URL for dup pair
    const list =
      nicheId === 'electronics'
        ? [
            fixtures[0]!,
            fixtures[1]!,
            toSupplyCandidate({
              item: {
                ...fixtures[2]!.ingestItem,
                url: fixtures[1]!.ingestItem.url,
                precomputedMeta: {
                  ...fixtures[2]!.ingestItem.precomputedMeta!,
                  canonicalUrl: fixtures[1]!.canonicalUrl,
                },
              },
              hunterSourceId: 'ml_api_legacy',
              sourceId: 'ml_api_legacy',
              sourceFamily: 'official_api',
              sourceType: 'official_api',
            }),
          ]
        : [...fixtures];

    const report = await runSupplyEngine({
      mode: 'dry_run',
      nicheId,
      persistSnapshots: false,
      allowWrite: false,
      sources: [sourceWith(list)],
      config: applyNicheProfileToIngestConfig(loadBotIngestConfig('standard'), niche),
    });

    console.log(JSON.stringify({ niche: nicheId, ...summarizeSupplyEngineReport(report) }, null, 2));

    totals.discovered += report.metrics.discovered;
    totals.unique += report.metrics.unique;
    totals.duplicates += report.metrics.duplicates;
    totals.insufficientEvidence += report.metrics.insufficientEvidence;
    totals.falseDiscounts += report.metrics.falseDiscounts;
    totals.historicalLows += report.metrics.historicalLows;
    totals.priceDrops += report.metrics.priceDrops;
    totals.anomalies += report.metrics.anomalies;
    totals.approvalReady += report.metrics.approvalReady;
    totals.verified += report.metrics.verified;
    totals.rejected += report.metrics.rejected;
    totals.sourceFailures += report.metrics.sourceFailures;
  }

  console.log('\n=== CONTROLLED DRY-RUN TOTALS ===');
  console.log(JSON.stringify(totals, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
