/**
 * READ-ONLY: requalifica offers status=pending con Deal Quality Engine V1.
 * No escribe DB. No cambia status. No publica.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/audit-pending-deal-quality.ts
 */
import { createClient } from '@supabase/supabase-js';
import {
  evaluateExistingOfferQuality,
  type ExistingOfferQualityRow,
} from '../lib/hunter/dealQuality';

type OfferRow = ExistingOfferQualityRow & {
  created_at?: string | null;
  bot_meta?: unknown;
};

function env(name: string): string {
  const v = process.env[name]?.trim() ?? '';
  if (!v) throw new Error(`Falta ${name}`);
  return v;
}

function pct(n: number, total: number): string {
  if (total <= 0) return '0.0%';
  return `${((100 * n) / total).toFixed(1)}%`;
}

function bump(map: Map<string, number>, key: string, by = 1): void {
  const k = (key || '(vacío)').slice(0, 160);
  map.set(k, (map.get(k) ?? 0) + by);
}

function top(map: Map<string, number>, n: number): Array<{ key: string; count: number }> {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

function ageBucket(createdAt: string | null | undefined, now: number): '<24h' | '24-72h' | '>72h' | 'unknown' {
  if (!createdAt) return 'unknown';
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return 'unknown';
  const hours = (now - ts) / 3_600_000;
  if (hours < 24) return '<24h';
  if (hours < 72) return '24-72h';
  return '>72h';
}

function sourceFromBotMeta(botMeta: unknown): { source: string; sourceDetail: string } {
  if (!botMeta || typeof botMeta !== 'object' || Array.isArray(botMeta)) {
    return { source: '(sin bot_meta)', sourceDetail: '(n/a)' };
  }
  const m = botMeta as Record<string, unknown>;
  const source = typeof m.source === 'string' && m.source.trim() ? m.source.trim() : '(sin source)';
  const sourceDetail =
    typeof m.sourceDetail === 'string' && m.sourceDetail.trim()
      ? m.sourceDetail.trim()
      : '(sin sourceDetail)';
  return { source, sourceDetail };
}

function imageFlags(row: OfferRow): {
  validImage: boolean;
  imageFromSource: boolean | null;
} {
  const url = typeof row.image_url === 'string' ? row.image_url.trim() : '';
  const validImage = Boolean(url) && /^https:\/\//i.test(url) && !/placeholder/i.test(url);
  let imageFromSource: boolean | null = null;
  if (row.bot_meta && typeof row.bot_meta === 'object' && !Array.isArray(row.bot_meta)) {
    const v = (row.bot_meta as Record<string, unknown>).imageFromSource;
    if (typeof v === 'boolean') imageFromSource = v;
  }
  return { validImage, imageFromSource };
}

async function fetchAllPending(supabase: ReturnType<typeof createClient>): Promise<OfferRow[]> {
  const pageSize = 200;
  let from = 0;
  const all: OfferRow[] = [];
  for (;;) {
    const { data, error, count } = await supabase
      .from('offers')
      .select(
        'id, title, offer_url, original_offer_url, store, price, original_price, image_url, product_fingerprint, status, bot_meta, created_at',
        { count: from === 0 ? 'exact' : undefined },
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`SELECT pending failed: ${error.message}`);
    const batch = (data ?? []) as OfferRow[];
    all.push(...batch);
    if (from === 0 && typeof count === 'number') {
      console.error(`[audit] pending count exact=${count}`);
    }
    if (batch.length < pageSize) break;
    from += pageSize;
    if (all.length > 20_000) {
      console.error(`[audit] safety stop at ${all.length} rows`);
      break;
    }
  }
  return all;
}

async function main() {
  const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  const now = Date.now();
  const rows = await fetchAllPending(supabase);
  const total = rows.length;

  const byDecision = new Map<string, number>();
  const byAction = new Map<string, number>();
  const positive = new Map<string, number>();
  const negative = new Map<string, number>();
  const missing = new Map<string, number>();
  const reasonsNoVerified = new Map<string, number>();
  const reasonsReject = new Map<string, number>();
  const reasonsDuplicate = new Map<string, number>();

  const bySourceDecision = new Map<string, Map<string, number>>();
  const ageQuality = new Map<string, Map<string, number>>();

  let priceMemoryUsable = 0;
  let priceBelowHabitual = 0;
  let historicalEvidence = 0;
  let artificialList = 0;
  let insufficientHistory = 0;
  let validImage = 0;
  let noImage = 0;
  let imageFromSourceTrue = 0;
  let imageFromSourceFalse = 0;
  let imageFromSourceUnknown = 0;

  for (const row of rows) {
    const { source, sourceDetail } = sourceFromBotMeta(row.bot_meta);
    const quality = evaluateExistingOfferQuality(row, { source });
    const decision = quality.decision;
    const action = quality.recommendedAction;

    bump(byDecision, decision);
    bump(byAction, action);

    for (const s of quality.positiveSignals) bump(positive, s);
    for (const s of quality.negativeSignals) bump(negative, s);
    for (const s of quality.missingEvidence) bump(missing, s);

    if (decision === 'NO_VERIFIED_DEAL') {
      for (const r of quality.reasons) bump(reasonsNoVerified, r);
    }
    if (decision === 'REJECT') {
      for (const r of quality.reasons) bump(reasonsReject, r);
    }
    if (decision === 'DUPLICATE') {
      for (const r of quality.reasons) bump(reasonsDuplicate, r);
    }

    const srcKey = `${source} | ${sourceDetail}`;
    if (!bySourceDecision.has(srcKey)) bySourceDecision.set(srcKey, new Map());
    bump(bySourceDecision.get(srcKey)!, decision);

    const age = ageBucket(row.created_at, now);
    if (!ageQuality.has(age)) ageQuality.set(age, new Map());
    bump(ageQuality.get(age)!, decision);

    // Price memory / images from engine signals (no inventar)
    if (quality.positiveSignals.includes('price_history_ready')) priceMemoryUsable += 1;
    if (quality.positiveSignals.includes('price_below_habitual')) priceBelowHabitual += 1;
    if (
      quality.positiveSignals.includes('price_history_ready') ||
      quality.positiveSignals.includes('near_historical_low') ||
      quality.positiveSignals.includes('at_or_below_historical_low') ||
      quality.positiveSignals.includes('price_below_habitual')
    ) {
      historicalEvidence += 1;
    }
    if (quality.negativeSignals.includes('artificial_list_price')) artificialList += 1;
    if (
      quality.negativeSignals.includes('insufficient_price_history') ||
      quality.missingEvidence.includes('price_history')
    ) {
      insufficientHistory += 1;
    }

    const img = imageFlags(row);
    if (quality.positiveSignals.includes('valid_image') || img.validImage) validImage += 1;
    else noImage += 1;
    if (img.imageFromSource === true) imageFromSourceTrue += 1;
    else if (img.imageFromSource === false) imageFromSourceFalse += 1;
    else imageFromSourceUnknown += 1;
  }

  const decisions = [
    'VERIFIED_DEAL',
    'PROMOTION',
    'POTENTIAL_DEAL',
    'NO_VERIFIED_DEAL',
    'DUPLICATE',
    'REJECT',
  ] as const;

  const n = (k: string) => byDecision.get(k) ?? 0;

  // Best/worst sources
  const sourceRows = [...bySourceDecision.entries()].map(([src, m]) => {
    const totalSrc = [...m.values()].reduce((a, b) => a + b, 0);
    return {
      src,
      total: totalSrc,
      VERIFIED_DEAL: m.get('VERIFIED_DEAL') ?? 0,
      POTENTIAL_DEAL: m.get('POTENTIAL_DEAL') ?? 0,
      NO_VERIFIED_DEAL: m.get('NO_VERIFIED_DEAL') ?? 0,
      DUPLICATE: m.get('DUPLICATE') ?? 0,
      REJECT: m.get('REJECT') ?? 0,
      PROMOTION: m.get('PROMOTION') ?? 0,
    };
  });

  const maxBy = (field: keyof (typeof sourceRows)[0]) =>
    [...sourceRows].sort((a, b) => Number(b[field]) - Number(a[field]) || b.total - a.total)[0] ??
    null;

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      universe: 'offers.status = pending (all pages)',
      evaluated: total,
      engine: 'Deal Quality Engine V1 / evaluateExistingOfferQuality',
      mode: 'READ_ONLY',
      dbWrites: 0,
    },
    summary: Object.fromEntries(
      decisions.map((d) => [
        d,
        { count: n(d), pct: pct(n(d), total) },
      ]),
    ),
    recommendedAction: {
      PUBLISH_CANDIDATE: byAction.get('PUBLISH_CANDIDATE') ?? 0,
      HUMAN_REVIEW: byAction.get('HUMAN_REVIEW') ?? 0,
      DISCARD: byAction.get('DISCARD') ?? 0,
      DUPLICATE: byAction.get('DUPLICATE') ?? 0,
    },
    reasons: {
      topPositiveSignals: top(positive, 10),
      topNegativeSignals: top(negative, 10),
      topMissingEvidence: top(missing, 10),
      topNoVerifiedReasons: top(reasonsNoVerified, 10),
      topRejectReasons: top(reasonsReject, 10),
      topDuplicateReasons: top(reasonsDuplicate, 10),
    },
    bySource: sourceRows.sort((a, b) => b.total - a.total),
    sourceLeaders: {
      mostVerified: maxBy('VERIFIED_DEAL'),
      mostPotential: maxBy('POTENTIAL_DEAL'),
      mostCatalogOnly: maxBy('NO_VERIFIED_DEAL'),
      mostDuplicates: maxBy('DUPLICATE'),
      mostRejects: maxBy('REJECT'),
    },
    priceMemory: {
      usableHistoryReady: priceMemoryUsable,
      priceBelowHabitual: priceBelowHabitual,
      historicalEvidence: historicalEvidence,
      artificialListPrice: artificialList,
      insufficientHistory: insufficientHistory,
    },
    images: {
      validImage,
      noImage,
      imageFromSourceTrue,
      imageFromSourceFalse,
      imageFromSourceUnknown,
    },
    age: Object.fromEntries(
      (['<24h', '24-72h', '>72h', 'unknown'] as const).map((bucket) => {
        const m = ageQuality.get(bucket) ?? new Map();
        const bucketTotal = [...m.values()].reduce((a, b) => a + b, 0);
        return [
          bucket,
          {
            total: bucketTotal,
            ...Object.fromEntries(decisions.map((d) => [d, m.get(d) ?? 0])),
          },
        ];
      }),
    ),
    interpretation: {
      deserveHumanAttention:
        (byAction.get('PUBLISH_CANDIDATE') ?? 0) + (byAction.get('HUMAN_REVIEW') ?? 0),
      catalogOrJunk: n('NO_VERIFIED_DEAL') + n('REJECT'),
      duplicates: n('DUPLICATE'),
      realDealSignals: n('VERIFIED_DEAL') + n('PROMOTION') + n('POTENTIAL_DEAL'),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
