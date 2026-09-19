/**
 * S7.2 — Controlled staging supply window (≤5 pending).
 *
 * Usage:
 *   npx tsx scripts/s72-controlled-staging-supply.ts              # reconcile only
 *   npx tsx scripts/s72-controlled-staging-supply.ts --execute     # live writes (cap≤5)
 *
 * Safety:
 * - staging target + ref match
 * - dedicated machine author (NOT S7.1 seed admin)
 * - BOT_INGEST_MACHINE_PENDING_WRITES only inside withMachinePendingWritesEnabled
 * - server-side canaryCap via resolveStagingSupplyWindowCap
 * - Distribution / Rewards / Economy / Attribution / Telegram not activated
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ExternalWorkerCandidate } from '../lib/bots/ingest/externalWorker';
import { processExternalWorkerBatch } from '../lib/bots/ingest/externalWorker';
import {
  selectCanaryCandidates,
  withMachinePendingWritesEnabled,
  type CanarySelectionRow,
} from '../lib/bots/ingest/machineInsertCanary';
import { isMachinePendingWriteEnabled } from '../lib/bots/ingest/machineLiveInsertEligibility';
import {
  S71_SEED_AUTHOR_ID,
  S72_STAGING_WINDOW_DEFAULT_CAP,
  S72_STAGING_WINDOW_HARD_CAP,
  assertDedicatedMachineAuthor,
  resolveStagingSupplyWindowCap,
} from '../lib/bots/ingest/stagingSupplyWindow';
import { isDistributionEngineEnabled } from '../lib/distribution/constants';
import {
  normalizeMlWorkerListing,
  buildMlWorkerSourceEventId,
} from '../lib/supplyIntelligence/adapters/mlWorkerListingAdapter';
import { runMlWorkerListingDryRun } from '../lib/supplyIntelligence/dryRunPipeline';
import { strongProductFingerprintForUrl } from '../lib/offers/findDuplicateOffer';
import { claimNextModerationOffer } from '../lib/moderation/claimNextModerationOffer';
import { releaseModerationLockIfOwner } from '../lib/moderation/atomicModerationLock';

const ROOT = process.cwd();
const DISCOVERY_PATH = join(ROOT, 'scripts/_smoke-gate-v2-discovery.json');
const OUT_DIR = join(ROOT, 'scripts/_s72_reports');
const AUTHOR_PATH = join(OUT_DIR, 's72-author-latest.json');

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const key = m[1].trim();
    if (process.env[key] == null) process.env[key] = v;
  }
}

function asCandidate(raw: unknown): ExternalWorkerCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = typeof r.url === 'string' ? r.url : '';
  const title = typeof r.title === 'string' ? r.title : '';
  const discountPrice = Number(r.discountPrice);
  if (!url || !title || !Number.isFinite(discountPrice)) return null;
  const originalPrice =
    r.originalPrice == null
      ? null
      : Number.isFinite(Number(r.originalPrice))
        ? Number(r.originalPrice)
        : null;
  return {
    url,
    title,
    store: typeof r.store === 'string' ? r.store : null,
    imageUrl: typeof r.imageUrl === 'string' ? r.imageUrl : null,
    discountPrice,
    originalPrice,
    discountPercent:
      r.discountPercent == null
        ? null
        : Number.isFinite(Number(r.discountPercent))
          ? Number(r.discountPercent)
          : null,
    canonicalUrl: typeof r.canonicalUrl === 'string' ? r.canonicalUrl : null,
    sourceDetail: typeof r.sourceDetail === 'string' ? r.sourceDetail : null,
    signals:
      r.signals && typeof r.signals === 'object'
        ? (r.signals as ExternalWorkerCandidate['signals'])
        : null,
    cardDiscountSource:
      typeof r.cardDiscountSource === 'string'
        ? (r.cardDiscountSource as ExternalWorkerCandidate['cardDiscountSource'])
        : null,
    cardBadgePercent:
      r.cardBadgePercent == null
        ? null
        : Number.isFinite(Number(r.cardBadgePercent))
          ? Number(r.cardBadgePercent)
          : null,
    pdpBlocked: r.pdpBlocked === true ? true : r.pdpBlocked === false ? false : null,
  };
}

type SurfaceCounts = {
  offersTotal: number | null;
  offersPending: number | null;
  distributionPublications: number | null;
  distributionEvents: number | null;
  distributionDestinations: number | null;
  rewardOutboundClicks: number | null;
  creatorRewards: number | null;
  affiliateConversions: number | null;
  affiliateCommissions: number | null;
  errors: string[];
};

async function countExact(sb: SupabaseClient, table: string) {
  const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true });
  return { count: count ?? null, error: error?.message ?? null };
}

async function snapshotSurfaces(sb: SupabaseClient): Promise<SurfaceCounts> {
  const errors: string[] = [];
  const take = async (label: string, p: Promise<{ count: number | null; error: string | null }>) => {
    const r = await p;
    if (r.error) errors.push(`${label}:${r.error}`);
    return r.count;
  };
  const pending = await sb
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .is('deleted_at', null);
  if (pending.error) errors.push(`offers_pending:${pending.error.message}`);

  return {
    offersTotal: await take('offers', countExact(sb, 'offers')),
    offersPending: pending.count ?? null,
    distributionPublications: await take(
      'distribution_publications',
      countExact(sb, 'distribution_publications'),
    ),
    distributionEvents: await take('distribution_events', countExact(sb, 'distribution_events')),
    distributionDestinations: await take(
      'distribution_destinations',
      countExact(sb, 'distribution_destinations'),
    ),
    rewardOutboundClicks: await take(
      'reward_outbound_clicks',
      countExact(sb, 'reward_outbound_clicks'),
    ),
    creatorRewards: await take('creator_rewards', countExact(sb, 'creator_rewards')),
    affiliateConversions: await take(
      'affiliate_conversions',
      countExact(sb, 'affiliate_conversions'),
    ),
    affiliateCommissions: await take(
      'affiliate_commissions',
      countExact(sb, 'affiliate_commissions'),
    ),
    errors,
  };
}

function delta(before: SurfaceCounts, after: SurfaceCounts) {
  const keys = [
    'offersTotal',
    'offersPending',
    'distributionPublications',
    'distributionEvents',
    'distributionDestinations',
    'rewardOutboundClicks',
    'creatorRewards',
    'affiliateConversions',
    'affiliateCommissions',
  ] as const;
  const out: Record<string, number | null> = {};
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    out[k] = a != null && b != null ? b - a : null;
  }
  return out;
}

function loadDedicatedAuthorId(): string | null {
  const fromEnv =
    process.env.S72_MACHINE_AUTHOR_ID?.trim() ||
    process.env.BOT_INGEST_USER_ID?.trim() ||
    null;
  if (fromEnv) return fromEnv;
  if (!existsSync(AUTHOR_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(AUTHOR_PATH, 'utf8')) as {
      author?: { id?: string };
    };
    return raw.author?.id?.trim() || null;
  } catch {
    return null;
  }
}

async function main() {
  const execute = process.argv.includes('--execute');
  const capArg = process.argv.find((a) => a.startsWith('--cap='));
  const requestedCap = Math.min(
    S72_STAGING_WINDOW_HARD_CAP,
    Math.max(
      1,
      capArg
        ? Number.parseInt(capArg.slice('--cap='.length), 10) ||
            S72_STAGING_WINDOW_DEFAULT_CAP
        : S72_STAGING_WINDOW_DEFAULT_CAP,
    ),
  );
  const windowCap = resolveStagingSupplyWindowCap(requestedCap, requestedCap);

  loadEnvFile(join(ROOT, '.env.local'));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const ref = url.match(/https:\/\/([^.]+)/)?.[1] ?? null;
  const expected = process.env.AVENTA_EXPECTED_SUPABASE_REF ?? null;
  const target = process.env.AVENTA_SUPABASE_TARGET ?? null;
  const authorId = loadDedicatedAuthorId();

  const authorCheck = authorId
    ? assertDedicatedMachineAuthor(authorId)
    : { ok: false, reason: 'missing_dedicated_author' };

  const safety = {
    target,
    ref,
    expected,
    refOk: Boolean(expected && ref === expected),
    stagingOnly: target === 'staging',
    writesFlagBefore: isMachinePendingWriteEnabled(),
    distributionEnabled: isDistributionEngineEnabled(),
    execute,
    windowCap,
    hardCap: S72_STAGING_WINDOW_HARD_CAP,
    authorIdPrefix: authorId?.slice(0, 8) ?? null,
    authorOk: authorCheck.ok,
    authorReason: authorCheck.reason,
    seedAuthorForbidden: S71_SEED_AUTHOR_ID.slice(0, 8),
  };

  mkdirSync(OUT_DIR, { recursive: true });

  if (!safety.stagingOnly || !safety.refOk) {
    console.error('STOP: staging target + matching ref required');
    console.error(JSON.stringify(safety, null, 2));
    process.exit(1);
  }
  if (!url || !key) {
    console.error('STOP: missing Supabase URL/service role');
    process.exit(1);
  }
  if (safety.writesFlagBefore) {
    console.error('STOP: MACHINE_PENDING_WRITES already ON');
    process.exit(1);
  }
  if (safety.distributionEnabled) {
    console.error('STOP: DISTRIBUTION_ENGINE_ENABLED is ON');
    process.exit(1);
  }
  if (!authorCheck.ok || !authorId) {
    const stop = {
      reason: 'dedicated_machine_author_unavailable',
      detail: authorCheck.reason,
      externalActionRequired: [
        'Staging Auth cannot create users (createUser/invite/generateLink → Database error saving new user).',
        'Likely broken handle_new_user → profiles insert on auth.users insert.',
        'Fix in Supabase Dashboard (staging project oojshofrpbfwsiypcecr):',
        '1) Inspect Auth logs + Postgres logs around handle_new_user / profiles triggers.',
        '2) Repair trigger so new Auth users get a valid profiles row.',
        '3) Re-run: npx tsx scripts/s72-provision-machine-author.ts',
        '4) Confirm author id ≠ S7.1 seed admin 6aa733d4-…',
        '5) Then re-run this script with --execute --cap=5',
      ],
      doNotUseSeedAdmin: true,
    };
    writeFileSync(
      join(OUT_DIR, 's72-supply-latest.json'),
      JSON.stringify({ meta: { safety, stop }, stop }, null, 2),
    );
    console.error('STOP: dedicated machine author required');
    console.error(JSON.stringify(stop, null, 2));
    process.exit(1);
  }

  // Verify author exists and is not seed
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: authUser, error: authErr } = await sb.auth.admin.getUserById(authorId);
  const { data: profile } = await sb
    .from('profiles')
    .select('id,display_name,username,role')
    .eq('id', authorId)
    .maybeSingle();

  if (authErr || !authUser.user || !profile) {
    console.error('STOP: dedicated author missing in Auth/profiles');
    process.exit(1);
  }
  if (profile.role === 'admin' && authorId === S71_SEED_AUTHOR_ID) {
    console.error('STOP: seed admin author forbidden');
    process.exit(1);
  }

  process.env.BOT_INGEST_ENABLED = '1';
  process.env.BOT_INGEST_USER_ID = authorId;
  delete process.env.BOT_INGEST_USER_ID_TECH;
  delete process.env.BOT_INGEST_USER_ID_STAPLES;

  if (!existsSync(DISCOVERY_PATH)) {
    console.error('STOP: missing discovery fixture', DISCOVERY_PATH);
    process.exit(1);
  }

  const discoveryRaw = JSON.parse(readFileSync(DISCOVERY_PATH, 'utf8')) as {
    candidates?: unknown[];
  };
  const allCandidates = (discoveryRaw.candidates ?? [])
    .map(asCandidate)
    .filter((c): c is ExternalWorkerCandidate => c != null);

  const dryRun = await runMlWorkerListingDryRun({
    candidates: allCandidates,
    maxItems: allCandidates.length,
    runId: `s72_dry_${Date.now().toString(36)}`,
  });

  const selectionRows: CanarySelectionRow[] = [];
  for (let i = 0; i < allCandidates.length; i += 1) {
    const c = allCandidates[i]!;
    const norm = normalizeMlWorkerListing(c);
    const expectedEventId = buildMlWorkerSourceEventId(c);
    const item =
      dryRun.items.find((it) => it.sourceEventId === expectedEventId) ?? dryRun.items[i];
    const fp =
      item?.productFingerprint ??
      strongProductFingerprintForUrl(c.canonicalUrl || c.url) ??
      null;
    let duplicate = item?.status === 'DUPLICATE';
    if (fp && !duplicate) {
      const { data } = await sb
        .from('offers')
        .select('id,status')
        .eq('product_fingerprint', fp)
        .is('deleted_at', null)
        .limit(1);
      if (data && data.length > 0) duplicate = true;
    }
    selectionRows.push({
      index: i,
      url: c.url,
      canonicalUrl: c.canonicalUrl || c.url,
      sourceEventId: item?.sourceEventId ?? (norm.ok ? expectedEventId : null),
      idempotencyKey: item?.observationIdempotencyKey ?? null,
      productFingerprint: fp,
      qualityDecision: item?.qualityDecision ?? null,
      wouldInsert: item?.wouldInsert === true,
      reasonCodes: item?.reasonCodes ?? [],
      evidenceLevel: item?.evidenceLevel ?? null,
      confidence: null,
      dealScore: item?.dealScore ?? null,
      verifierScore: null,
      originalPriceProvenance:
        (c.signals?.originalPriceProvenance as string | undefined) ?? null,
      cardDiscountSource:
        c.cardDiscountSource ??
        (c.signals?.cardDiscountSource as string | undefined) ??
        null,
      imageUrl: c.imageUrl ?? null,
      pdpBlocked: c.pdpBlocked ?? null,
      duplicate,
    });
  }

  const selected = selectCanaryCandidates(selectionRows, windowCap);
  const selectedCandidates = selected.map((row) => allCandidates[row.index]!);
  const before = await snapshotSurfaces(sb);

  const report: Record<string, unknown> = {
    meta: {
      mode: 'S7.2_CONTROLLED_STAGING_SUPPLY',
      generatedAt: new Date().toISOString(),
      safety,
      author: {
        id: authorId,
        idPrefix: authorId.slice(0, 8),
        display_name: profile.display_name,
        username: profile.username,
        role: profile.role,
      },
      windowCap,
      hardCap: S72_STAGING_WINDOW_HARD_CAP,
    },
    dryRun: {
      wouldInsertCount: dryRun.wouldInsertCount,
      suppressed: dryRun.lowQualitySuppressions,
      duplicates: dryRun.duplicateSuppressions,
      failed: dryRun.errorCount,
    },
    selection: {
      poolSize: selectionRows.length,
      eligibleCount: selectionRows.filter(
        (r) =>
          r.qualityDecision === 'VERIFIED_OPPORTUNITY' &&
          r.wouldInsert &&
          !r.duplicate,
      ).length,
      selected,
    },
    before,
    live: null,
    after: null,
    deltas: null,
    idempotency: null,
    focusClaim: null,
    capacity: null,
    stop: null as unknown,
  };

  if (!execute) {
    report.stop = {
      reason: 'dry_run_only',
      note: 'Re-run with --execute after dedicated author is provisioned',
    };
    writeFileSync(join(OUT_DIR, 's72-supply-latest.json'), JSON.stringify(report, null, 2));
    writeFileSync(
      join(OUT_DIR, `s72-supply-${Date.now()}.json`),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify(
        { ok: true, mode: 'reconcile', selected: selected.length, windowCap, authorPrefix: authorId.slice(0, 8) },
        null,
        2,
      ),
    );
    return;
  }

  if (selectedCandidates.length === 0) {
    report.stop = { reason: 'no_eligible_candidates' };
    writeFileSync(join(OUT_DIR, 's72-supply-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: no eligible candidates');
    process.exit(1);
  }

  const liveReport = await withMachinePendingWritesEnabled(async () =>
    processExternalWorkerBatch({
      candidates: selectedCandidates,
      canaryCap: windowCap,
      dryRun: false,
      discovery: {
        cycleIndex: 0,
        seedsAvailable: 1,
        seedsAttempted: 1,
        seedsSuccessful: 1,
        seedsZeroResults: 0,
        seedsFailed: 0,
        bySeed: [
          {
            id: 's72_staging_window',
            status: 'ok',
            rawLinks: selectedCandidates.length,
            accepted: selectedCandidates.length,
          },
        ],
      },
    }),
  );

  if (isMachinePendingWriteEnabled()) {
    report.stop = { reason: 'flag_leakage' };
    writeFileSync(join(OUT_DIR, 's72-supply-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: writes flag still ON');
    process.exit(1);
  }

  const inserted = liveReport.results.filter((r) => r.status === 'inserted');
  const duplicates = liveReport.results.filter((r) => r.status === 'duplicate');
  const skipped = liveReport.results.filter((r) => r.status === 'skipped');
  const errors = liveReport.results.filter((r) => r.status === 'error');

  if (inserted.length > windowCap) {
    report.stop = { reason: 'cap_breach', inserted: inserted.length, windowCap };
    writeFileSync(join(OUT_DIR, 's72-supply-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: cap breach');
    process.exit(1);
  }

  const after = await snapshotSurfaces(sb);
  const deltas = delta(before, after);
  const unexpected: string[] = [];
  if ((deltas.distributionPublications ?? 0) > 0) unexpected.push('distribution_publications');
  if ((deltas.distributionEvents ?? 0) > 0) unexpected.push('distribution_events');
  if ((deltas.distributionDestinations ?? 0) > 0) unexpected.push('distribution_destinations');
  if ((deltas.creatorRewards ?? 0) > 0) unexpected.push('creator_rewards');
  if ((deltas.affiliateConversions ?? 0) > 0) unexpected.push('affiliate_conversions');
  if ((deltas.affiliateCommissions ?? 0) > 0) unexpected.push('affiliate_commissions');
  if ((deltas.offersTotal ?? 0) > inserted.length) unexpected.push('offers_overshoot');

  const offerIds = inserted
    .map((r) => ('offerId' in r ? r.offerId : null))
    .filter(Boolean) as string[];
  const { data: offerRows } =
    offerIds.length > 0
      ? await sb
          .from('offers')
          .select(
            'id,status,created_by,product_fingerprint,offer_url,image_url,price,original_price,bot_meta,moderator_comment',
          )
          .in('id', offerIds)
      : { data: [] };

  if ((offerRows || []).some((o) => o.status !== 'pending')) {
    report.stop = { reason: 'status_not_pending' };
    writeFileSync(join(OUT_DIR, 's72-supply-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: non-pending status');
    process.exit(1);
  }
  if ((offerRows || []).some((o) => o.created_by !== authorId)) {
    report.stop = { reason: 'wrong_machine_author' };
    writeFileSync(join(OUT_DIR, 's72-supply-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: created_by ≠ dedicated machine author');
    process.exit(1);
  }
  if (unexpected.length > 0) {
    report.stop = { reason: 'unexpected_writes', unexpected, deltas };
    writeFileSync(join(OUT_DIR, 's72-supply-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: unexpected writes', unexpected);
    process.exit(1);
  }

  // Idempotency
  let idempotency: Record<string, unknown> | null = null;
  if (inserted.length > 0 && selectedCandidates[0]) {
    const retryCand =
      selectedCandidates.find((c) =>
        inserted.some((r) => r.url === c.url || r.url === c.canonicalUrl),
      ) ?? selectedCandidates[0];
    const retryReport = await withMachinePendingWritesEnabled(async () =>
      processExternalWorkerBatch({
        candidates: [retryCand],
        canaryCap: 1,
        dryRun: false,
      }),
    );
    const retryInserted = retryReport.results.filter((r) => r.status === 'inserted');
    const retryDup = retryReport.results.filter((r) => r.status === 'duplicate');
    idempotency = {
      url: retryCand.url,
      retryResults: retryReport.results,
      secondInsertCreated: retryInserted.length > 0,
      duplicateOrNoop:
        retryDup.length > 0 || retryReport.results.every((r) => r.status !== 'inserted'),
    };
    if (retryInserted.length > 0) {
      report.stop = { reason: 'idempotency_second_offer', idempotency };
      writeFileSync(join(OUT_DIR, 's72-supply-latest.json'), JSON.stringify(report, null, 2));
      console.error('STOP: idempotency failed');
      process.exit(1);
    }
  }

  // Focus
  let focusClaim: Record<string, unknown> | null = null;
  if (offerIds[0]) {
    const claim = await claimNextModerationOffer(sb, authorId, {
      preferOfferId: offerIds[0],
      sourceTab: 'all',
    });
    const claimedId = claim.claimed && claim.offer ? String(claim.offer.id) : null;
    if (claimedId) await releaseModerationLockIfOwner(sb, claimedId, authorId);
    focusClaim = {
      preferOfferId: offerIds[0],
      claimed: claim.claimed,
      claimedId,
      claimKind: claim.claimKind,
      released: Boolean(claimedId),
      claimable: claim.claimed === true,
    };
  }

  const ops = liveReport.summary.ops;
  report.live = {
    summary: liveReport.summary,
    results: liveReport.results,
    insertedCount: inserted.length,
    duplicateCount: duplicates.length,
    skippedCount: skipped.length,
    errorCount: errors.length,
    offerIds,
    offerRows,
    funnel: ops
      ? {
          discovered: ops.discovered,
          normalized: ops.normalized,
          identityValid: ops.identityValid,
          qualityVerified: ops.qualityVerified,
          liveEligible: ops.liveEligible,
          budgetRejected: ops.budgetRejected,
          duplicates: ops.duplicates,
          writeAttempted: ops.writeAttempts,
          writeSuccess: ops.writeSuccess,
          writeFailed: ops.writeFailed,
          pendingCreated: inserted.length,
          reasonCodes: ops.reasonCodes,
        }
      : null,
  };
  report.after = after;
  report.deltas = deltas;
  report.idempotency = idempotency;
  report.focusClaim = focusClaim;
  report.capacity = {
    pendingCreated: inserted.length,
    pendingAlreadyExisting: (before.offersPending ?? 0),
    qualityVerificationRate:
      selected.length > 0
        ? selected.filter((s) => s.qualityDecision === 'VERIFIED_OPPORTUNITY').length /
          selected.length
        : null,
    duplicateRate:
      selectedCandidates.length > 0 ? duplicates.length / selectedCandidates.length : null,
    imageAvailability:
      selected.length > 0
        ? selected.filter((s) => Boolean(s.imageUrl)).length / selected.length
        : null,
    provenanceDistribution: selected.reduce<Record<string, number>>((acc, s) => {
      const k = s.originalPriceProvenance || 'unknown';
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    averageDealScore:
      selected.length > 0
        ? selected.reduce((a, s) => a + (s.dealScore ?? 0), 0) / selected.length
        : null,
    moderationReadyCount: inserted.length,
  };
  report.stop = { reason: null, completed: true };

  writeFileSync(join(OUT_DIR, 's72-supply-latest.json'), JSON.stringify(report, null, 2));
  writeFileSync(
    join(OUT_DIR, `s72-supply-${Date.now()}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'execute',
        inserted: inserted.length,
        offerIds,
        deltas,
        flagAfter: isMachinePendingWriteEnabled(),
        authorPrefix: authorId.slice(0, 8),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
