/**
 * READ-ONLY forensics: muestra estratificada de pending ml_worker.
 * No escribe DB. No cambia estados.
 *
 * npx tsx --env-file=.env.local scripts/forensics-ml-worker-quality.ts
 */
import { createClient } from '@supabase/supabase-js';
import { evaluateExistingOfferQuality } from '../lib/hunter/dealQuality';
import type { ExistingOfferQualityRow } from '../lib/hunter/dealQuality';

type OfferRow = ExistingOfferQualityRow & {
  created_at?: string | null;
  bot_meta?: unknown;
};

type GroundTruth =
  | 'REAL_DEAL'
  | 'PROBABLE_DEAL'
  | 'CATALOG'
  | 'FALSE_DISCOUNT'
  | 'INSUFFICIENT_EVIDENCE';

type ArtificialVerdict = 'CORRECT_BLOCK' | 'POSSIBLE_FALSE_POSITIVE' | 'INSUFFICIENT_EVIDENCE';

type CatalogVerdict = 'CATALOG_REAL' | 'POTENTIAL_MISSED' | 'INSUFFICIENT_DATA';

function env(name: string): string {
  const v = process.env[name]?.trim() ?? '';
  if (!v) throw new Error(`Falta ${name}`);
  return v;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function signalsOf(botMeta: unknown) {
  const root = asRecord(botMeta);
  const s = asRecord(root?.signals) ?? {};
  return {
    source: str(root?.source) ?? '(sin source)',
    sourceDetail: str(root?.sourceDetail) ?? '(sin detail)',
    imageFromSource: bool(root?.imageFromSource),
    dealQuality: asRecord(root?.dealQuality),
    ratingAverage: num(s.ratingAverage),
    soldQuantity: num(s.soldQuantity),
    priceLowest30d: num(s.priceLowest30d),
    priceLowest90d: num(s.priceLowest90d),
    priceVsLowest90dPct: num(s.priceVsLowest90dPct),
    habitual30d: num(s.habitual30d),
    savingsVsHabitualPct: num(s.savingsVsHabitualPct),
    effectiveDiscountPercent: num(s.effectiveDiscountPercent),
    suspectedArtificialListPrice: bool(s.suspectedArtificialListPrice),
    priceIntelSource: str(s.priceIntelSource),
  };
}

function nominalDiscount(price: number | null, original: number | null): number | null {
  if (price == null || original == null || !(original > price) || price <= 0) return null;
  return Math.round((1 - price / original) * 1000) / 10;
}

/** Inferencia de regla artificial a partir de señales persistidas (mismo umbral que mlPriceEngine). */
function inferArtificialRule(opts: {
  current: number | null;
  list: number | null;
  habitual: number | null;
  historyReady: boolean;
  artificial: boolean;
}): { likelyRule: string | null; listVsCurrent: number | null; listVsHabitual: number | null } {
  const { current, list, habitual, historyReady, artificial } = opts;
  if (!artificial || current == null || list == null || !(list > 0) || !(current > 0)) {
    return { likelyRule: null, listVsCurrent: null, listVsHabitual: null };
  }
  const listVsCurrent = Math.round((list / current) * 100) / 100;
  const listVsHabitual =
    habitual != null && habitual > 0 ? Math.round((list / habitual) * 100) / 100 : null;
  const extremeList = list >= current * 1.8;
  const listVsHabitualHit =
    habitual != null && list >= habitual * 1.35 && list >= current * 1.4;
  if (!historyReady && extremeList) {
    return { likelyRule: 'extremeList_noHistory (list>=1.8x current)', listVsCurrent, listVsHabitual };
  }
  if (listVsHabitualHit) {
    return { likelyRule: 'listVsHabitual (list>=1.35x habitual & >=1.4x current)', listVsCurrent, listVsHabitual };
  }
  if (extremeList) {
    return { likelyRule: 'extremeList_ratio', listVsCurrent, listVsHabitual };
  }
  return { likelyRule: 'unknown_or_listVsRegular', listVsCurrent, listVsHabitual };
}

function classifyGroundTruth(opts: {
  artificial: boolean;
  historyReady: boolean;
  savingsVsHabitual: number | null;
  vsLowest: number | null;
  effective: number | null;
  qualityDecision: string;
}): GroundTruth {
  const { artificial, historyReady, savingsVsHabitual, vsLowest, effective, qualityDecision } = opts;
  const nearLow = vsLowest != null && vsLowest <= 5;
  const atLow = vsLowest != null && vsLowest <= 0;
  const belowHab = savingsVsHabitual != null && savingsVsHabitual >= 12;
  const strongHab = savingsVsHabitual != null && savingsVsHabitual >= 20;

  if (qualityDecision === 'POTENTIAL_DEAL' && !artificial && (belowHab || nearLow)) {
    return strongHab || atLow ? 'REAL_DEAL' : 'PROBABLE_DEAL';
  }
  if (!artificial && historyReady && (strongHab || (atLow && belowHab))) {
    return 'REAL_DEAL';
  }
  if (!artificial && historyReady && (belowHab || nearLow)) {
    return 'PROBABLE_DEAL';
  }
  // Artificial + current near historical low: posible falso positivo del detector
  if (artificial && historyReady && (atLow || (nearLow && (savingsVsHabitual ?? 0) >= 5))) {
    return 'INSUFFICIENT_EVIDENCE';
  }
  if (artificial && (!historyReady || (savingsVsHabitual != null && savingsVsHabitual <= 0 && !nearLow))) {
    return 'FALSE_DISCOUNT';
  }
  if (artificial && historyReady && !nearLow && (savingsVsHabitual == null || savingsVsHabitual < 8)) {
    return 'FALSE_DISCOUNT';
  }
  if (!historyReady && (effective == null || effective <= 0) && !nearLow) {
    return 'CATALOG';
  }
  if (historyReady && !nearLow && !belowHab && !artificial) {
    return 'CATALOG';
  }
  return 'INSUFFICIENT_EVIDENCE';
}

function artificialVerdict(opts: {
  artificial: boolean;
  gt: GroundTruth;
  historyReady: boolean;
  nearLow: boolean;
  belowHab: boolean;
}): ArtificialVerdict {
  if (!opts.artificial) return 'INSUFFICIENT_EVIDENCE';
  if (opts.gt === 'FALSE_DISCOUNT') return 'CORRECT_BLOCK';
  if (opts.nearLow || opts.belowHab) return 'POSSIBLE_FALSE_POSITIVE';
  if (!opts.historyReady) return 'CORRECT_BLOCK';
  return 'INSUFFICIENT_EVIDENCE';
}

function catalogVerdict(opts: {
  qualityDecision: string;
  gt: GroundTruth;
  historyReady: boolean;
  nearLow: boolean;
  artificial: boolean;
}): CatalogVerdict {
  if (opts.qualityDecision !== 'NO_VERIFIED_DEAL') return 'INSUFFICIENT_DATA';
  if (opts.gt === 'CATALOG' || opts.gt === 'FALSE_DISCOUNT') return 'CATALOG_REAL';
  if (opts.gt === 'PROBABLE_DEAL' || opts.gt === 'REAL_DEAL') return 'POTENTIAL_MISSED';
  if (opts.nearLow && opts.artificial) return 'POTENTIAL_MISSED';
  if (opts.nearLow && !opts.artificial) return 'POTENTIAL_MISSED';
  if (!opts.historyReady) return 'INSUFFICIENT_DATA';
  return 'INSUFFICIENT_DATA';
}

function pickSample<T>(
  pools: Record<string, T[]>,
  target = 40,
): T[] {
  const out: T[] = [];
  const used = new Set<string>();
  const idOf = (x: T) => String((x as { id?: string }).id ?? Math.random());

  const take = (key: string, n: number) => {
    const arr = pools[key] ?? [];
    let taken = 0;
    for (const row of arr) {
      if (taken >= n) break;
      const id = idOf(row);
      if (used.has(id)) continue;
      used.add(id);
      out.push(row);
      taken += 1;
    }
  };

  // Deliberado: todos los POTENTIAL, luego artificial, history, near-low, no-image, catalog
  take('potential', 10);
  take('artificial', 12);
  take('historyReady', 8);
  take('nearLow', 8);
  take('noImage', 4);
  take('catalog', 10);

  // Rellenar hasta target
  for (const key of Object.keys(pools)) {
    if (out.length >= target) break;
    take(key, target - out.length);
  }
  return out.slice(0, Math.min(50, Math.max(30, out.length)));
}

async function main() {
  const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('offers')
    .select(
      'id, title, offer_url, original_offer_url, store, price, original_price, image_url, product_fingerprint, status, bot_meta, created_at',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as OfferRow[];
  const mlWorker = rows.filter((r) => {
    const s = signalsOf(r.bot_meta);
    return s.source === 'ml_worker' || s.sourceDetail.includes('worker:');
  });

  type Enriched = {
    row: OfferRow;
    sig: ReturnType<typeof signalsOf>;
    quality: ReturnType<typeof evaluateExistingOfferQuality>;
    nominal: number | null;
    historyReady: boolean;
    nearLow: boolean;
    belowHab: boolean;
    artificial: boolean;
  };

  const enriched: Enriched[] = mlWorker.map((row) => {
    const sig = signalsOf(row.bot_meta);
    const quality = evaluateExistingOfferQuality(row, { source: sig.source });
    const historyReady = quality.positiveSignals.includes('price_history_ready');
    const nearLow =
      quality.positiveSignals.includes('near_historical_low') ||
      quality.positiveSignals.includes('at_or_below_historical_low') ||
      (sig.priceVsLowest90dPct != null && sig.priceVsLowest90dPct <= 5);
    const belowHab = (sig.savingsVsHabitualPct ?? 0) >= 12;
    const artificial =
      sig.suspectedArtificialListPrice === true ||
      quality.negativeSignals.includes('artificial_list_price');
    return {
      row,
      sig,
      quality,
      nominal: nominalDiscount(row.price ?? null, row.original_price ?? null),
      historyReady,
      nearLow,
      belowHab,
      artificial,
    };
  });

  const pools: Record<string, Enriched[]> = {
    potential: enriched.filter((e) => e.quality.decision === 'POTENTIAL_DEAL'),
    artificial: enriched.filter((e) => e.artificial),
    historyReady: enriched.filter((e) => e.historyReady),
    nearLow: enriched.filter((e) => e.nearLow),
    noImage: enriched.filter((e) => !e.quality.positiveSignals.includes('valid_image')),
    catalog: enriched.filter((e) => e.quality.decision === 'NO_VERIFIED_DEAL'),
  };

  const sample = pickSample(enriched.length >= 30 ? pools : { all: enriched }, 40);

  // Ensure all potentials included
  for (const p of pools.potential) {
    if (!sample.find((s) => s.row.id === p.row.id)) sample.unshift(p);
  }
  const finalSample = sample.slice(0, 50);
  while (finalSample.length < 30 && enriched.length > finalSample.length) {
    const next = enriched.find((e) => !finalSample.some((s) => s.row.id === e.row.id));
    if (!next) break;
    finalSample.push(next);
  }

  const cases = finalSample.map((e) => {
    const gt = classifyGroundTruth({
      artificial: e.artificial,
      historyReady: e.historyReady,
      savingsVsHabitual: e.sig.savingsVsHabitualPct,
      vsLowest: e.sig.priceVsLowest90dPct,
      effective: e.sig.effectiveDiscountPercent,
      qualityDecision: e.quality.decision,
    });
    const artInf = inferArtificialRule({
      current: e.row.price ?? null,
      list: e.row.original_price ?? null,
      habitual: e.sig.habitual30d,
      historyReady: e.historyReady,
      artificial: e.artificial,
    });
    const artV = artificialVerdict({
      artificial: e.artificial,
      gt,
      historyReady: e.historyReady,
      nearLow: e.nearLow,
      belowHab: e.belowHab,
    });
    const catV = catalogVerdict({
      qualityDecision: e.quality.decision,
      gt,
      historyReady: e.historyReady,
      nearLow: e.nearLow,
      artificial: e.artificial,
    });

    const qualification =
      e.quality.qualification ??
      (typeof e.sig.dealQuality?.qualification === 'string'
        ? e.sig.dealQuality.qualification
        : null);

    return {
      offerId: e.row.id,
      title: (e.row.title ?? '').slice(0, 80),
      url: e.row.offer_url ?? e.row.original_offer_url,
      store: e.row.store,
      source: e.sig.source,
      sourceDetail: e.sig.sourceDetail,
      price: e.row.price,
      originalPrice: e.row.original_price,
      nominalDiscountPct: e.nominal,
      effectiveDiscountPct: e.sig.effectiveDiscountPercent,
      habitual30d: e.sig.habitual30d,
      lowest90d: e.sig.priceLowest90d,
      priceVsLowest90dPct: e.sig.priceVsLowest90dPct,
      savingsVsHabitualPct: e.sig.savingsVsHabitualPct,
      historyReady: e.historyReady,
      artificial: e.artificial,
      artificialLikelyRule: artInf.likelyRule,
      listVsCurrent: artInf.listVsCurrent,
      listVsHabitual: artInf.listVsHabitual,
      qualification,
      qualityDecision: e.quality.decision,
      qualityAction: e.quality.recommendedAction,
      qualityReasons: e.quality.reasons.slice(0, 6),
      positiveSignals: e.quality.positiveSignals.slice(0, 10),
      negativeSignals: e.quality.negativeSignals.slice(0, 10),
      imageValid: e.quality.positiveSignals.includes('valid_image'),
      imageFromSource: e.sig.imageFromSource,
      fingerprint: e.row.product_fingerprint,
      groundTruth: gt,
      artificialVerdict: e.artificial ? artV : null,
      catalogVerdict: e.quality.decision === 'NO_VERIFIED_DEAL' ? catV : null,
      createdAt: e.row.created_at,
    };
  });

  const N = cases.length;
  const count = (pred: (c: (typeof cases)[0]) => boolean) => cases.filter(pred).length;
  const pct = (n: number) => `${((100 * n) / N).toFixed(1)}%`;

  const gtCounts = {
    REAL_DEAL: count((c) => c.groundTruth === 'REAL_DEAL'),
    PROBABLE_DEAL: count((c) => c.groundTruth === 'PROBABLE_DEAL'),
    CATALOG: count((c) => c.groundTruth === 'CATALOG'),
    FALSE_DISCOUNT: count((c) => c.groundTruth === 'FALSE_DISCOUNT'),
    INSUFFICIENT_EVIDENCE: count((c) => c.groundTruth === 'INSUFFICIENT_EVIDENCE'),
  };

  const artBlocks = {
    CORRECT_BLOCK: count((c) => c.artificialVerdict === 'CORRECT_BLOCK'),
    POSSIBLE_FALSE_POSITIVE: count((c) => c.artificialVerdict === 'POSSIBLE_FALSE_POSITIVE'),
    INSUFFICIENT_EVIDENCE: count(
      (c) => c.artificial && c.artificialVerdict === 'INSUFFICIENT_EVIDENCE',
    ),
  };

  const catalogSplit = {
    CATALOG_REAL: count((c) => c.catalogVerdict === 'CATALOG_REAL'),
    POTENTIAL_MISSED: count((c) => c.catalogVerdict === 'POTENTIAL_MISSED'),
    INSUFFICIENT_DATA: count((c) => c.catalogVerdict === 'INSUFFICIENT_DATA'),
  };

  const nearLowButNotPotential = count(
    (c) => c.priceVsLowest90dPct != null && c.priceVsLowest90dPct <= 5,
  );
  const nearLowBlockedByArtificial = count(
    (c) =>
      c.artificial &&
      c.priceVsLowest90dPct != null &&
      c.priceVsLowest90dPct <= 5 &&
      c.qualityDecision === 'NO_VERIFIED_DEAL',
  );
  const savingsEvidenceMissed = count(
    (c) =>
      c.qualityDecision === 'NO_VERIFIED_DEAL' &&
      ((c.priceVsLowest90dPct != null && c.priceVsLowest90dPct <= 5) ||
        (c.savingsVsHabitualPct != null && c.savingsVsHabitualPct >= 12)),
  );

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY',
      universePending: rows.length,
      universeMlWorkerPending: mlWorker.length,
      sampleSize: N,
      engine: 'evaluateExistingOfferQuality + bot_meta signals',
      groundTruthNote:
        'Clasificación basada solo en señales persistidas en Aventa (bot_meta + precios). Sin scrape externo.',
    },
    sampleStats: {
      REAL_DEAL: { n: gtCounts.REAL_DEAL, pct: pct(gtCounts.REAL_DEAL) },
      PROBABLE_DEAL: { n: gtCounts.PROBABLE_DEAL, pct: pct(gtCounts.PROBABLE_DEAL) },
      CATALOG: { n: gtCounts.CATALOG, pct: pct(gtCounts.CATALOG) },
      FALSE_DISCOUNT: { n: gtCounts.FALSE_DISCOUNT, pct: pct(gtCounts.FALSE_DISCOUNT) },
      INSUFFICIENT_EVIDENCE: {
        n: gtCounts.INSUFFICIENT_EVIDENCE,
        pct: pct(gtCounts.INSUFFICIENT_EVIDENCE),
      },
      artificial_list_price: {
        n: count((c) => c.artificial),
        pct: pct(count((c) => c.artificial)),
      },
      priceMemoryReady: {
        n: count((c) => c.historyReady),
        pct: pct(count((c) => c.historyReady)),
      },
      nearOrBelowHistoricalLow: {
        n: count((c) => c.priceVsLowest90dPct != null && c.priceVsLowest90dPct <= 5),
        pct: pct(count((c) => c.priceVsLowest90dPct != null && c.priceVsLowest90dPct <= 5)),
      },
      effectiveDiscountGt0: {
        n: count((c) => (c.effectiveDiscountPct ?? 0) > 0),
        pct: pct(count((c) => (c.effectiveDiscountPct ?? 0) > 0)),
      },
      nominalDiscountGt0: {
        n: count((c) => (c.nominalDiscountPct ?? 0) > 0),
        pct: pct(count((c) => (c.nominalDiscountPct ?? 0) > 0)),
      },
    },
    artificialAnalysis: artBlocks,
    catalogAnalysis: catalogSplit,
    keyFindings: {
      nearLowInSample: nearLowButNotPotential,
      nearLowBlockedByArtificialStillNoVerified: nearLowBlockedByArtificial,
      noVerifiedWithHistoricalSavingsSignals: savingsEvidenceMissed,
      qualityUpgradesToPotential: count((c) => c.qualityDecision === 'POTENTIAL_DEAL'),
      avgNominalDiscountAmongArtificial: (() => {
        const xs = cases.filter((c) => c.artificial && c.nominalDiscountPct != null);
        if (!xs.length) return null;
        return Math.round(
          (xs.reduce((a, c) => a + (c.nominalDiscountPct ?? 0), 0) / xs.length) * 10,
        ) / 10;
      })(),
      avgListVsCurrentAmongArtificial: (() => {
        const xs = cases.filter((c) => c.listVsCurrent != null);
        if (!xs.length) return null;
        return Math.round((xs.reduce((a, c) => a + (c.listVsCurrent ?? 0), 0) / xs.length) * 100) / 100;
      })(),
    },
    cases,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
