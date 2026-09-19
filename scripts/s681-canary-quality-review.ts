/**
 * S6.8.1 — Read-only canary quality review (staging).
 * NO inserts. NO machine writes. Optional Focus claim+release probe only.
 *
 *   npx tsx scripts/s681-canary-quality-review.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { claimNextModerationOffer } from '../lib/moderation/claimNextModerationOffer';
import { releaseModerationLockIfOwner } from '../lib/moderation/atomicModerationLock';

const ROOT = process.cwd();

function loadEnvLocal() {
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1].trim()] ??= v;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ref = url.match(/https:\/\/([^.]+)/)?.[1] ?? null;
const expected = process.env.AVENTA_EXPECTED_SUPABASE_REF ?? null;
if (process.env.AVENTA_SUPABASE_TARGET !== 'staging' || ref !== expected) {
  console.error('STOP: staging required');
  process.exit(1);
}
if ((process.env.BOT_INGEST_MACHINE_PENDING_WRITES ?? '').trim()) {
  console.error('STOP: machine writes env must be unset for review');
  process.exit(1);
}

const KNOWN_IDS = [
  'e29c4f66-7dc4-4658-9620-63efc78775f7',
  'c7ba9c00-fb7b-4b8a-b655-4609f992b129',
  'b0efafbc-444c-4c33-8e9b-ef67924b706e',
  '4c2e82af-0e8f-4efa-b38f-a293e7066dea',
  '6a0304a5-6194-4484-9090-62b636c660f2',
];

const KNOWN_FPS = [
  'ml:MLM48434598',
  'ml:MLM51558214',
  'ml:MLMU3097285590',
  'ml:MLMU488803900',
  'ml:MLM53177027',
];

const WAVE: Record<string, string> = {
  'e29c4f66-7dc4-4658-9620-63efc78775f7': 'S6.7',
  'c7ba9c00-fb7b-4b8a-b655-4609f992b129': 'S6.7',
  'b0efafbc-444c-4c33-8e9b-ef67924b706e': 'S6.8',
  '4c2e82af-0e8f-4efa-b38f-a293e7066dea': 'S6.8',
  '6a0304a5-6194-4484-9090-62b636c660f2': 'S6.8',
};

const sb = createClient(url, key, { auth: { persistSession: false } });
const stagingAuthor = '6aa733d4-02cb-4c64-92fc-cf45fdcee344';

async function main() {
const byId = await sb
  .from('offers')
  .select(
    'id,status,title,price,original_price,store,offer_url,original_offer_url,image_url,product_fingerprint,bot_meta,moderator_comment,created_by,created_at,deleted_at,locked_by,locked_at',
  )
  .in('id', KNOWN_IDS);

const byFp = await sb
  .from('offers')
  .select(
    'id,status,title,price,original_price,store,offer_url,original_offer_url,image_url,product_fingerprint,bot_meta,moderator_comment,created_by,created_at,deleted_at,locked_by,locked_at',
  )
  .in('product_fingerprint', KNOWN_FPS)
  .is('deleted_at', null);

type OfferRow = {
  id: string;
  status: string | null;
  title: string | null;
  price: number | null;
  original_price: number | null;
  store: string | null;
  offer_url: string | null;
  original_offer_url: string | null;
  image_url: string | null;
  product_fingerprint: string | null;
  bot_meta: Record<string, unknown> | null;
  moderator_comment: string | null;
  created_by: string | null;
  created_at: string | null;
  deleted_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
};

const map = new Map<string, OfferRow>();
for (const row of [...((byId.data || []) as OfferRow[]), ...((byFp.data || []) as OfferRow[])]) {
  map.set(row.id, row);
}
const offers = [...map.values()].sort((a, b) =>
  String(a.created_at).localeCompare(String(b.created_at)),
);

function discountPct(sale: number | null, original: number | null): number | null {
  if (sale == null || original == null || original <= 0 || sale <= 0) return null;
  if (original <= sale) return 0;
  return Math.round((1 - sale / original) * 100);
}

function reviewOne(row: OfferRow) {
  const bm = (row.bot_meta && typeof row.bot_meta === 'object' ? row.bot_meta : {}) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const signals = (bm.signals && typeof bm.signals === 'object' ? bm.signals : {}) as Record<
    string,
    unknown
  >;
  const raw = (bm.rawObservation && typeof bm.rawObservation === 'object'
    ? bm.rawObservation
    : {}) as Record<string, unknown>;
  const dealScore = bm.dealScore && typeof bm.dealScore === 'object' ? bm.dealScore : null;
  const score = bm.score && typeof bm.score === 'object' ? bm.score : null;
  const sale = row.price;
  const original = row.original_price;
  const disc = discountPct(sale, original);
  const imageUrl = (row.image_url || '').trim();
  const fp = row.product_fingerprint || null;
  const issues: string[] = [];
  const classifications: string[] = [];

  if (row.status !== 'pending') issues.push('status_not_pending');
  if (row.deleted_at) issues.push('deleted');
  if (!row.title || String(row.title).trim().length < 12) issues.push('title_weak');
  if (!row.offer_url) issues.push('missing_url');
  if (!(row.store || '').toLowerCase().includes('mercado')) issues.push('store_unexpected');
  if (!(Number.isFinite(Number(sale)) && Number(sale) > 0)) issues.push('sale_price_invalid');
  if (!(Number.isFinite(Number(original)) && Number(original) > Number(sale))) {
    issues.push('original_price_invalid');
  }
  if (disc == null || disc < 20) issues.push('discount_weak_or_missing');
  if (!fp || !String(fp).startsWith('ml:')) issues.push('fingerprint_invalid');
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) issues.push('image_invalid');
  if (!signals.originalPriceProvenance) issues.push('missing_original_provenance');
  if (
    signals.originalPriceProvenance &&
    !['listing_card', 'source_explicit'].includes(String(signals.originalPriceProvenance))
  ) {
    issues.push('untrusted_original_provenance');
  }
  if (!signals.cardDiscountSource) issues.push('missing_card_discount_source');
  if (!row.bot_meta) issues.push('missing_bot_meta');
  if (fp && raw.productFingerprint && raw.productFingerprint !== fp) {
    issues.push('fingerprint_bot_meta_mismatch');
  }

  if (signals.suspectedArtificialListPrice === true) {
    classifications.push('expected_advisory_limitation:suspected_artificial_list_price');
  }
  if (dealScore && Number(dealScore.score) === 0) {
    classifications.push('expected_advisory_limitation:dealscore_zero_no_history');
  }
  if (bm.dealQuality?.decision === 'NO_VERIFIED_DEAL') {
    classifications.push('expected_advisory_limitation:dqe_no_verified_deal_vs_s61_verified');
  }
  if (signals.effectiveDiscountPercent === 0 && disc != null && disc > 0) {
    classifications.push('scoring_issue:effective_discount_zeroed_by_price_intel');
  }

  const externalId = fp ? String(fp).replace(/^ml:/, '') : null;
  return {
    wave: WAVE[row.id] ?? 'unknown',
    offer_id: row.id,
    external_id: externalId,
    sourceEventId: (raw.sourceEventId as string | undefined) ?? null,
    fingerprint: fp,
    created_at: row.created_at,
    status: row.status,
    title: row.title,
    sale_price: sale,
    original_price: original,
    discount_percent_computed: disc,
    store: row.store,
    offer_url: row.offer_url,
    image_url: imageUrl || null,
    image_present: Boolean(imageUrl),
    imageProvenance: (signals.imageProvenance as string | undefined) ?? null,
    originalPriceProvenance: (signals.originalPriceProvenance as string | undefined) ?? null,
    cardDiscountSource: (signals.cardDiscountSource as string | undefined) ?? null,
    DealScore: dealScore
      ? {
          score: dealScore.score,
          confidence: dealScore.confidence,
          reasons: dealScore.reasons,
        }
      : null,
    verifier_score_total: score?.total ?? null,
    gateAction: bm.gateAction ?? null,
    gateReason: bm.gateReason ?? null,
    dqe_decision: bm.dealQuality?.decision ?? null,
    dqe_recommendedAction: bm.dealQuality?.recommendedAction ?? null,
    s61_gate_in_bot_meta: bm.gateAction === 'insert_pending',
    issues,
    classifications,
    quality_pass: issues.length === 0,
  };
}

const inventory = offers.map(reviewOne);

const focusResults: Array<Record<string, unknown>> = [];
for (const row of offers) {
  if (row.status !== 'pending') {
    focusResults.push({ offer_id: row.id, claimable: false, reason: 'not_pending' });
    continue;
  }
  const claim = await claimNextModerationOffer(sb, stagingAuthor, {
    preferOfferId: row.id,
    sourceTab: 'all',
  });
  const claimedId = claim.claimed && claim.offer ? String(claim.offer.id) : null;
  if (claimedId) {
    await releaseModerationLockIfOwner(sb, claimedId, stagingAuthor);
  }
  focusResults.push({
    offer_id: row.id,
    claimed: claim.claimed,
    claimedId,
    claimKind: claim.claimKind,
    released: Boolean(claimedId),
    claimable: claim.claimed === true && claimedId === row.id,
  });
}

const pendingCount = await sb
  .from('offers')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'pending')
  .is('deleted_at', null);
const distPubs = await sb
  .from('distribution_publications')
  .select('id', { count: 'exact', head: true });
const distEvents = await sb
  .from('distribution_events')
  .select('id', { count: 'exact', head: true });

async function probeTable(table: string) {
  try {
    const r = await sb.from(table).select('id', { count: 'exact', head: true });
    return { ok: !r.error, err: r.error?.message ?? null, count: r.count };
  } catch (e) {
    return { ok: false, err: String(e), count: null };
  }
}

const rewards = await probeTable('rewards_ledger');
const economy = await probeTable('economy_ledger');
const attribution = await probeTable('attribution_events');

const missingIds = KNOWN_IDS.filter((id) => !offers.some((o) => o.id === id));
const missingFps = KNOWN_FPS.filter(
  (fp) => !offers.some((o) => o.product_fingerprint === fp),
);

const report = {
  meta: {
    mode: 'S6.8.1_CANARY_QUALITY_REVIEW',
    generatedAt: new Date().toISOString(),
    stagingRef: ref,
    machineWritesEnv: process.env.BOT_INGEST_MACHINE_PENDING_WRITES ?? '(unset)',
    readOnly: true,
  },
  inventory,
  focusResults,
  writeAudit: {
    note: 'Historical Δ (+5) evidenced by S6.7/S6.8 reports; this review confirms current presence of the 5 canary rows and zero Distribution growth claims from those reports.',
    canaryOffersFound: offers.length,
    canaryPending: inventory.filter((i) => i.status === 'pending').length,
    expectedCanaryCount: 5,
    missingIds,
    missingFps,
    currentPendingTotal: pendingCount.count,
    distribution_publications: distPubs.count,
    distribution_events: distEvents.count,
    rewards,
    economy,
    attribution,
    prior_report_deltas: {
      s67: { offersPending: 2, distributionPublications: 0 },
      s68: { pendingDelta: 3, distDelta: 0 },
    },
  },
  stop: {
    allPending: inventory.every((i) => i.status === 'pending'),
    allQualityPass: inventory.every((i) => i.quality_pass),
    allFocusClaimable: focusResults.every((f) => f.claimable === true),
    missing: missingIds.length + missingFps.length,
  },
};

const outDir = join(ROOT, 'scripts/_s681_reports');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 's681-report-latest.json'), JSON.stringify(report, null, 2));

console.log(
  JSON.stringify(
    {
      ok: true,
      found: offers.length,
      pending: inventory.filter((i) => i.status === 'pending').length,
      qualityPass: inventory.filter((i) => i.quality_pass).length,
      focusClaimable: focusResults.filter((f) => f.claimable === true).length,
      missingIds,
      missingFps,
      inventory: inventory.map((i) => ({
        wave: i.wave,
        id: i.offer_id,
        fp: i.fingerprint,
        status: i.status,
        disc: i.discount_percent_computed,
        prov: i.originalPriceProvenance,
        img: i.image_present,
        dqe: i.dqe_decision,
        dealScore: i.DealScore?.score ?? null,
        verifier: i.verifier_score_total,
        issues: i.issues,
        classifications: i.classifications,
        quality_pass: i.quality_pass,
      })),
      focusResults,
      stop: report.stop,
    },
    null,
    2,
  ),
);

if (report.stop.missing > 0 || !report.stop.allPending || !report.stop.allFocusClaimable) {
  process.exit(1);
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
