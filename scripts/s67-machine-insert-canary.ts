/**
 * S6.7 — Controlled machine insert canary (staging only).
 *
 * Usage:
 *   npx tsx scripts/s67-machine-insert-canary.ts              # dry-run reconcile only
 *   npx tsx scripts/s67-machine-insert-canary.ts --execute    # live writes (max canaryCap)
 *
 * Safety:
 * - Requires AVENTA_SUPABASE_TARGET=staging + ref match (.env.local)
 * - BOT_INGEST_MACHINE_PENDING_WRITES enabled only inside withMachinePendingWritesEnabled
 * - canaryCap ≤ 5; default 3
 * - Does NOT touch Vercel env / cron
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ExternalWorkerCandidate } from '../lib/bots/ingest/externalWorker';
import { processExternalWorkerBatch } from '../lib/bots/ingest/externalWorker';
import {
  S67_CANARY_DEFAULT_CAP,
  S67_CANARY_HARD_CAP,
  selectCanaryCandidates,
  withMachinePendingWritesEnabled,
  type CanarySelectionRow,
} from '../lib/bots/ingest/machineInsertCanary';
import { isMachinePendingWriteEnabled } from '../lib/bots/ingest/machineLiveInsertEligibility';
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
const OUT_DIR = join(ROOT, 'scripts/_s67_reports');

function loadEnvFile(path: string, { override = false } = {}) {
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
    if (override || process.env[key] == null) process.env[key] = v;
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
  hunterSupplyRuns: number | null;
  distributionPublications: number | null;
  distributionEvents: number | null;
  distributionDestinations: number | null;
  errors: string[];
};

async function countExact(
  sb: SupabaseClient,
  table: string,
): Promise<{ count: number | null; error: string | null }> {
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
    hunterSupplyRuns: await take('hunter_supply_runs', countExact(sb, 'hunter_supply_runs')),
    distributionPublications: await take(
      'distribution_publications',
      countExact(sb, 'distribution_publications'),
    ),
    distributionEvents: await take('distribution_events', countExact(sb, 'distribution_events')),
    distributionDestinations: await take(
      'distribution_destinations',
      countExact(sb, 'distribution_destinations'),
    ),
    errors,
  };
}

function delta(before: SurfaceCounts, after: SurfaceCounts) {
  const keys = [
    'offersTotal',
    'offersPending',
    'hunterSupplyRuns',
    'distributionPublications',
    'distributionEvents',
    'distributionDestinations',
  ] as const;
  const out: Record<string, number | null> = {};
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    out[k] = a != null && b != null ? b - a : null;
  }
  return out;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const canaryCapArg = process.argv.find((a) => a.startsWith('--cap='));
  const canaryCap = Math.min(
    S67_CANARY_HARD_CAP,
    Math.max(
      1,
      canaryCapArg
        ? Number.parseInt(canaryCapArg.slice('--cap='.length), 10) || S67_CANARY_DEFAULT_CAP
        : S67_CANARY_DEFAULT_CAP,
    ),
  );

  loadEnvFile(join(ROOT, '.env.local'));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const ref = url.match(/https:\/\/([^.]+)/)?.[1] ?? null;
  const expected = process.env.AVENTA_EXPECTED_SUPABASE_REF ?? null;
  const target = process.env.AVENTA_SUPABASE_TARGET ?? null;

  const safety = {
    target,
    ref,
    expected,
    refOk: Boolean(expected && ref === expected),
    stagingOnly: target === 'staging',
    writesFlagBefore: isMachinePendingWriteEnabled(),
    execute,
    canaryCap,
  };

  if (!safety.stagingOnly || !safety.refOk) {
    console.error('STOP: canary requires staging target + matching AVENTA_EXPECTED_SUPABASE_REF');
    console.error(JSON.stringify(safety, null, 2));
    process.exit(1);
  }
  if (!url || !key) {
    console.error('STOP: missing Supabase URL/service role');
    process.exit(1);
  }
  if (safety.writesFlagBefore) {
    console.error('STOP: BOT_INGEST_MACHINE_PENDING_WRITES already ON before canary — refuse');
    process.exit(1);
  }

  // Staging canary author: existing seed user (bot UUIDs from prod Vercel are absent on staging).
  const stagingCanaryAuthor =
    process.env.S67_STAGING_CANARY_AUTHOR_ID?.trim() ||
    '6aa733d4-02cb-4c64-92fc-cf45fdcee344';
  process.env.BOT_INGEST_ENABLED = '1';
  process.env.BOT_INGEST_USER_ID = stagingCanaryAuthor;
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
    runId: `s67_dry_${Date.now().toString(36)}`,
  });

  const sb = createClient(url, key, { auth: { persistSession: false } });

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

  const selected = selectCanaryCandidates(selectionRows, canaryCap);
  const selectedCandidates = selected.map((row) => allCandidates[row.index]!);

  mkdirSync(OUT_DIR, { recursive: true });
  const before = await snapshotSurfaces(sb);

  const report: Record<string, unknown> = {
    meta: {
      mode: 'S6.7_MACHINE_INSERT_CANARY',
      generatedAt: new Date().toISOString(),
      safety,
      stagingCanaryAuthorPrefix: stagingCanaryAuthor.slice(0, 8),
      discoveryPath: DISCOVERY_PATH,
      canaryCap,
      hardCap: S67_CANARY_HARD_CAP,
    },
    dryRun: {
      wouldInsertCount: dryRun.wouldInsertCount,
      suppressed: dryRun.lowQualitySuppressions,
      duplicates: dryRun.duplicateSuppressions,
      failed: dryRun.errorCount,
      offerInsertedAlwaysFalse: dryRun.items.every((i) => i.offerInserted === false),
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
    live: null as unknown,
    after: null as unknown,
    deltas: null as unknown,
    idempotency: null as unknown,
    focusClaim: null as unknown,
    equivalence: null as unknown,
    stop: null as unknown,
  };

  if (!execute) {
    report.stop = {
      reason: 'dry_run_only',
      note: 'Re-run with --execute to perform controlled live inserts',
    };
    const outPath = join(OUT_DIR, `s67-report-${Date.now()}.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    writeFileSync(join(OUT_DIR, 's67-report-latest.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, mode: 'reconcile', outPath, selected: selected.length }, null, 2));
    return;
  }

  if (selectedCandidates.length === 0) {
    report.stop = { reason: 'no_eligible_candidates' };
    writeFileSync(join(OUT_DIR, 's67-report-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: no eligible canary candidates');
    process.exit(1);
  }

  // LIVE — process-scoped writes only
  const liveStarted = Date.now();
  const liveReport = await withMachinePendingWritesEnabled(async () => {
    if (!isMachinePendingWriteEnabled()) {
      throw new Error('writes flag failed to enable in-process');
    }
    return processExternalWorkerBatch({
      candidates: selectedCandidates,
      canaryCap,
      dryRun: false,
      discovery: {
        cycleIndex: 0,
        seedsAvailable: 1,
        seedsAttempted: 1,
        seedsSuccessful: 1,
        seedsZeroResults: 0,
        seedsFailed: 0,
        bySeed: [{ id: 's67_canary', status: 'ok', rawLinks: selectedCandidates.length, accepted: selectedCandidates.length }],
      },
    });
  });
  const liveLatencyMs = Date.now() - liveStarted;

  if (isMachinePendingWriteEnabled()) {
    report.stop = { reason: 'flag_leakage', detail: 'writes flag still ON after canary' };
    writeFileSync(join(OUT_DIR, 's67-report-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: feature flag leakage');
    process.exit(1);
  }

  const inserted = liveReport.results.filter((r) => r.status === 'inserted');
  const duplicates = liveReport.results.filter((r) => r.status === 'duplicate');
  const skipped = liveReport.results.filter((r) => r.status === 'skipped');
  const errors = liveReport.results.filter((r) => r.status === 'error');

  if (inserted.length > canaryCap) {
    report.stop = { reason: 'canary_cap_breach', inserted: inserted.length, canaryCap };
    writeFileSync(join(OUT_DIR, 's67-report-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: canary cap breach');
    process.exit(1);
  }

  const after = await snapshotSurfaces(sb);
  const deltas = delta(before, after);

  // Unexpected write surfaces (distribution must not grow)
  const unexpected: string[] = [];
  if ((deltas.distributionPublications ?? 0) > 0) unexpected.push('distribution_publications');
  if ((deltas.distributionEvents ?? 0) > 0) unexpected.push('distribution_events');
  if ((deltas.distributionDestinations ?? 0) > 0) unexpected.push('distribution_destinations');
  if ((deltas.offersTotal ?? 0) > inserted.length) unexpected.push('offers_overshoot');
  if ((deltas.offersPending ?? 0) > inserted.length) unexpected.push('pending_overshoot');

  const offerIds = inserted.map((r) => ('offerId' in r ? r.offerId : null)).filter(Boolean) as string[];
  const offerRows =
    offerIds.length > 0
      ? (
          await sb
            .from('offers')
            .select(
              'id,status,created_by,product_fingerprint,offer_url,original_offer_url,bot_meta,moderator_comment,image_url,created_at',
            )
            .in('id', offerIds)
        ).data
      : [];

  const nonPending = (offerRows || []).filter((o) => o.status !== 'pending');
  if (nonPending.length > 0) {
    report.stop = { reason: 'status_not_pending', rows: nonPending };
    writeFileSync(join(OUT_DIR, 's67-report-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: offer status != pending');
    process.exit(1);
  }

  if (unexpected.length > 0) {
    report.stop = { reason: 'unexpected_writes', unexpected, deltas };
    writeFileSync(join(OUT_DIR, 's67-report-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: unexpected writes', unexpected);
    process.exit(1);
  }

  // Equivalence: each selected row must have been eligible; inserts should match selected URLs
  const equivalence = selected.map((sel) => {
    const liveResult = liveReport.results.find(
      (r) => r.url === sel.url || r.url === sel.canonicalUrl,
    );
    return {
      sourceEventId: sel.sourceEventId,
      dryWouldInsert: sel.wouldInsert,
      dryQuality: sel.qualityDecision,
      dryFingerprint: sel.productFingerprint,
      dryProvenance: sel.originalPriceProvenance,
      liveStatus: liveResult?.status ?? null,
      liveOfferId: liveResult && 'offerId' in liveResult ? liveResult.offerId : null,
      ok:
        sel.wouldInsert === true &&
        sel.qualityDecision === 'VERIFIED_OPPORTUNITY' &&
        (liveResult?.status === 'inserted' || liveResult?.status === 'duplicate'),
    };
  });

  const equivalenceFail = equivalence.filter((e) => !e.ok);
  if (equivalenceFail.length > 0) {
    report.live = {
      latencyMs: liveLatencyMs,
      summary: liveReport.summary,
      results: liveReport.results,
      insertedCount: inserted.length,
      offerIds,
      offerRows,
    };
    report.after = after;
    report.deltas = deltas;
    report.equivalence = equivalence;
    report.stop = {
      reason: 'equivalence_divergence',
      detail:
        'Dry-run WOULD_INSERT candidate(s) did not reach live insert/duplicate. See equivalenceFail.',
      equivalenceFail,
      skipReasonCounts: liveReport.summary.skipReasonCounts ?? null,
    };
    writeFileSync(join(OUT_DIR, 's67-report-latest.json'), JSON.stringify(report, null, 2));
    writeFileSync(
      join(OUT_DIR, `s67-report-${Date.now()}.json`),
      JSON.stringify(report, null, 2),
    );
    console.error('STOP: equivalence divergence', JSON.stringify(equivalenceFail, null, 2));
    process.exit(1);
  }

  // Idempotency: retry first successfully inserted candidate once
  let idempotency: Record<string, unknown> | null = null;
  if (inserted.length > 0 && selectedCandidates[0]) {
    const retryCand = selectedCandidates.find((c) =>
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
      duplicateOrNoop: retryDup.length > 0 || retryReport.results.every((r) => r.status !== 'inserted'),
    };
    if (retryInserted.length > 0) {
      report.stop = { reason: 'idempotency_second_offer', idempotency };
      writeFileSync(join(OUT_DIR, 's67-report-latest.json'), JSON.stringify(report, null, 2));
      console.error('STOP: retry created second offer');
      process.exit(1);
    }
  }

  // Focus claimability: preferOfferId claim then release
  let focusClaim: Record<string, unknown> | null = null;
  if (offerIds[0]) {
    const claim = await claimNextModerationOffer(sb, stagingCanaryAuthor, {
      preferOfferId: offerIds[0],
      sourceTab: 'all',
    });
    const claimedId = claim.claimed && claim.offer ? String(claim.offer.id) : null;
    if (claimedId) {
      await releaseModerationLockIfOwner(sb, claimedId, stagingCanaryAuthor);
    }
    // Also verify row is claim-eligible shape
    const { data: row } = await sb
      .from('offers')
      .select('id,status,product_fingerprint,bot_meta,moderator_comment,locked_by')
      .eq('id', offerIds[0])
      .maybeSingle();
    focusClaim = {
      preferOfferId: offerIds[0],
      claimed: claim.claimed,
      claimedId,
      claimKind: claim.claimKind,
      released: Boolean(claimedId),
      rowStatus: row?.status ?? null,
      hasFingerprint: Boolean(row?.product_fingerprint),
      hasBotMeta: Boolean(row?.bot_meta),
      hasBotIngestComment: String(row?.moderator_comment || '')
        .toLowerCase()
        .includes('[bot-ingest]'),
      claimable:
        claim.claimed === true ||
        (row?.status === 'pending' &&
          Boolean(row?.product_fingerprint) &&
          String(row?.moderator_comment || '')
            .toLowerCase()
            .includes('[bot-ingest]')),
    };
    if (!focusClaim.claimable) {
      report.stop = { reason: 'not_claimable_in_focus', focusClaim };
      writeFileSync(join(OUT_DIR, 's67-report-latest.json'), JSON.stringify(report, null, 2));
      console.error('STOP: not claimable in Focus');
      process.exit(1);
    }
  }

  report.live = {
    latencyMs: liveLatencyMs,
    summary: liveReport.summary,
    results: liveReport.results,
    insertedCount: inserted.length,
    duplicateCount: duplicates.length,
    skippedCount: skipped.length,
    errorCount: errors.length,
    offerIds,
    offerRows,
  };
  report.after = after;
  report.deltas = deltas;
  report.idempotency = idempotency;
  report.focusClaim = focusClaim;
  report.equivalence = equivalence;
  report.observability = {
    canaryCandidates: selected.length,
    eligible: selected.length,
    inserted: inserted.length,
    failed: errors.length,
    duplicate: duplicates.length,
    suppressed: skipped.length,
    writeSuccessRate:
      selected.length > 0 ? inserted.length / selected.length : null,
    liveLatencyMs,
    unexpectedWrites: unexpected,
    dryWouldInsert: dryRun.wouldInsertCount,
    liveEligible: selected.length,
    liveInserted: inserted.length,
  };
  report.stop = { reason: null, completed: true };

  const outPath = join(OUT_DIR, `s67-report-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  writeFileSync(join(OUT_DIR, 's67-report-latest.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'execute',
        outPath,
        inserted: inserted.length,
        offerIds,
        deltas,
        flagAfter: isMachinePendingWriteEnabled(),
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
