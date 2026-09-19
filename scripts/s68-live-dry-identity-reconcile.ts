/**
 * S6.8 — Dry/live identity + gate reconciliation (no writes unless --execute).
 *
 *   npx tsx scripts/s68-live-dry-identity-reconcile.ts
 *   npx tsx scripts/s68-live-dry-identity-reconcile.ts --execute --cap=3
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  toParsedMeta,
  processExternalWorkerBatch,
  type ExternalWorkerCandidate,
} from '../lib/bots/ingest/externalWorker';
import {
  S67_CANARY_DEFAULT_CAP,
  S67_CANARY_HARD_CAP,
  withMachinePendingWritesEnabled,
} from '../lib/bots/ingest/machineInsertCanary';
import { isMachinePendingWriteEnabled } from '../lib/bots/ingest/machineLiveInsertEligibility';
import { evaluateMachineCandidateGate } from '../lib/bots/ingest/candidateInsertGate';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import {
  buildMlWorkerSourceEventId,
  normalizeMlWorkerListing,
} from '../lib/supplyIntelligence/adapters/mlWorkerListingAdapter';
import { resolveMercadoLibreListingExternalId } from '../lib/offers/resolveMercadoLibreItem';
import { strongProductFingerprintForUrl } from '../lib/offers/findDuplicateOffer';
import { claimNextModerationOffer } from '../lib/moderation/claimNextModerationOffer';
import { releaseModerationLockIfOwner } from '../lib/moderation/atomicModerationLock';
import { scoreIngestCandidate } from '../lib/bots/ingest/scoreIngestCandidate';

const ROOT = process.cwd();
const DISCOVERY = join(ROOT, 'scripts/_smoke-gate-v2-discovery.json');
const OUT_DIR = join(ROOT, 'scripts/_s68_reports');

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

function asCandidate(raw: unknown): ExternalWorkerCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = typeof r.url === 'string' ? r.url : '';
  const title = typeof r.title === 'string' ? r.title : '';
  const discountPrice = Number(r.discountPrice);
  if (!url || !title || !Number.isFinite(discountPrice)) return null;
  return {
    url,
    title,
    store: typeof r.store === 'string' ? r.store : 'Mercado Libre',
    imageUrl: typeof r.imageUrl === 'string' ? r.imageUrl : null,
    discountPrice,
    originalPrice:
      r.originalPrice == null
        ? null
        : Number.isFinite(Number(r.originalPrice))
          ? Number(r.originalPrice)
          : null,
    discountPercent:
      r.discountPercent == null
        ? null
        : Number.isFinite(Number(r.discountPercent))
          ? Number(r.discountPercent)
          : null,
    canonicalUrl: typeof r.canonicalUrl === 'string' ? r.canonicalUrl : url,
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
  };
}

type RowCompare = {
  index: number;
  url: string;
  dryOk: boolean;
  liveOk: boolean;
  dryExternalId: string | null;
  liveExternalId: string | null;
  dryFingerprint: string | null;
  liveFingerprint: string | null;
  drySourceEventId: string | null;
  liveSourceEventId: string | null;
  dryQuality: string | null;
  liveQuality: string | null;
  dryWouldInsert: boolean;
  liveEligible: boolean;
  identitySame: boolean;
  gateSame: boolean;
  equivalent: boolean;
  dbDuplicate: boolean;
  divergenceReason: string | null;
};

async function main() {
  const execute = process.argv.includes('--execute');
  const capArg = process.argv.find((a) => a.startsWith('--cap='));
  const cap = Math.min(
    S67_CANARY_HARD_CAP,
    Math.max(
      1,
      capArg
        ? Number.parseInt(capArg.slice(5), 10) || S67_CANARY_DEFAULT_CAP
        : S67_CANARY_DEFAULT_CAP,
    ),
  );

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const ref = url.match(/https:\/\/([^.]+)/)?.[1] ?? null;
  const expected = process.env.AVENTA_EXPECTED_SUPABASE_REF ?? null;
  if (process.env.AVENTA_SUPABASE_TARGET !== 'staging' || ref !== expected) {
    console.error('STOP: staging ref required');
    process.exit(1);
  }
  if (isMachinePendingWriteEnabled()) {
    console.error('STOP: writes flag already ON');
    process.exit(1);
  }

  const stagingAuthor =
    process.env.S67_STAGING_CANARY_AUTHOR_ID?.trim() ||
    '6aa733d4-02cb-4c64-92fc-cf45fdcee344';
  process.env.BOT_INGEST_ENABLED = '1';
  process.env.BOT_INGEST_USER_ID = stagingAuthor;
  delete process.env.BOT_INGEST_USER_ID_TECH;
  delete process.env.BOT_INGEST_USER_ID_STAPLES;

  const raw = JSON.parse(readFileSync(DISCOVERY, 'utf8')) as { candidates?: unknown[] };
  const all = (raw.candidates ?? []).map(asCandidate).filter((c): c is ExternalWorkerCandidate => !!c);
  const config = loadBotIngestConfig('standard');
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const rows: RowCompare[] = [];
  for (let i = 0; i < all.length; i += 1) {
    const c = all[i]!;
    const dry = normalizeMlWorkerListing(c);
    const liveMeta = toParsedMeta(c);
    const dryExt = dry.ok
      ? dry.value.externalListingId
      : resolveMercadoLibreListingExternalId(c.url, c.canonicalUrl);
    const liveExt = liveMeta
      ? resolveMercadoLibreListingExternalId(liveMeta.canonicalUrl, c.url)
      : resolveMercadoLibreListingExternalId(c.url, c.canonicalUrl);
    const dryFp = dry.ok
      ? strongProductFingerprintForUrl(dry.value.meta.canonicalUrl)
      : null;
    const liveFp = liveMeta
      ? strongProductFingerprintForUrl(liveMeta.canonicalUrl)
      : null;
    const drySeid = dry.ok
      ? dry.value.sourceEventId
      : buildMlWorkerSourceEventId({ url: c.url, canonicalUrl: c.canonicalUrl });
    const liveSeid = liveMeta
      ? buildMlWorkerSourceEventId({
          url: liveMeta.canonicalUrl,
          canonicalUrl: liveMeta.canonicalUrl,
        })
      : null;

    let dryQuality: string | null = null;
    let dryWouldInsert = false;
    let liveQuality: string | null = null;
    let liveEligible = false;

    if (dry.ok) {
      const scored = scoreIngestCandidate(dry.value.meta, dry.value.meta.signals, config);
      const gate = evaluateMachineCandidateGate({
        url: dry.value.meta.canonicalUrl,
        meta: dry.value.meta,
        config,
        verifierDecision: scored.decision,
      });
      dryQuality = gate.qualityDecision;
      dryWouldInsert = gate.wouldInsert;
    }
    if (liveMeta) {
      const scored = scoreIngestCandidate(liveMeta, liveMeta.signals, config);
      const gate = evaluateMachineCandidateGate({
        url: liveMeta.canonicalUrl,
        meta: liveMeta,
        config,
        verifierDecision: scored.decision,
      });
      liveQuality = gate.qualityDecision;
      liveEligible = gate.wouldInsert && gate.qualityDecision === 'VERIFIED_OPPORTUNITY';
    }

    const identitySame =
      Boolean(dry.ok && liveMeta) &&
      dryExt === liveExt &&
      dryFp === liveFp &&
      drySeid === liveSeid;
    const gateSame =
      dryQuality === liveQuality && dryWouldInsert === liveEligible;
    let divergenceReason: string | null = null;
    if (!dry.ok && !liveMeta) divergenceReason = 'both_reject';
    else if (dry.ok && !liveMeta) divergenceReason = 'live_toParsedMeta_null';
    else if (!dry.ok && liveMeta) divergenceReason = 'dry_normalize_fail';
    else if (!identitySame) divergenceReason = 'identity_mismatch';
    else if (!gateSame) divergenceReason = 'gate_mismatch';

    let dbDuplicate = false;
    if (dryFp) {
      const { data } = await sb
        .from('offers')
        .select('id')
        .eq('product_fingerprint', dryFp)
        .is('deleted_at', null)
        .limit(1);
      dbDuplicate = Boolean(data && data.length > 0);
    }

    rows.push({
      index: i,
      url: c.url,
      dryOk: dry.ok,
      liveOk: liveMeta != null,
      dryExternalId: dryExt,
      liveExternalId: liveExt,
      dryFingerprint: dryFp,
      liveFingerprint: liveFp,
      drySourceEventId: drySeid,
      liveSourceEventId: liveSeid,
      dryQuality,
      liveQuality,
      dryWouldInsert,
      liveEligible,
      identitySame,
      gateSame,
      equivalent: identitySame && gateSame && dry.ok && liveMeta != null,
      dbDuplicate,
      divergenceReason,
    });
  }

  const divergences = rows.filter((r) => r.dryOk && (!r.liveOk || !r.equivalent));
  // Prefer previously divergent /up/MLMU first, then other VERIFIED non-dupes
  const selectable = rows
    .filter(
      (r) =>
        r.equivalent &&
        r.dryWouldInsert &&
        r.liveEligible &&
        !r.dbDuplicate,
    )
    .sort((a, b) => {
      const aUp = a.dryExternalId?.startsWith('MLMU') ? 0 : 1;
      const bUp = b.dryExternalId?.startsWith('MLMU') ? 0 : 1;
      return aUp - bUp || a.index - b.index;
    })
    .slice(0, cap);

  const beforePending = await sb
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .is('deleted_at', null);
  const beforeDist = await sb
    .from('distribution_publications')
    .select('id', { count: 'exact', head: true });

  mkdirSync(OUT_DIR, { recursive: true });
  const report: Record<string, unknown> = {
    meta: {
      mode: 'S6.8_LIVE_DRY_IDENTITY',
      generatedAt: new Date().toISOString(),
      execute,
      cap,
      writesFlagBefore: false,
    },
    summary: {
      total: rows.length,
      equivalent: rows.filter((r) => r.equivalent).length,
      divergences: divergences.length,
      selectable: selectable.length,
    },
    divergences,
    selectable,
    rows,
  };

  if (divergences.length > 0) {
    report.stop = {
      reason: 'dry_live_divergence_remaining',
      count: divergences.length,
      samples: divergences.slice(0, 5),
    };
    writeFileSync(join(OUT_DIR, 's68-report-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: dry/live still divergent', divergences.length);
    console.log(JSON.stringify({ ok: false, divergences: divergences.length }, null, 2));
    process.exit(1);
  }

  if (!execute) {
    report.stop = { reason: 'reconcile_only', note: '100% equivalent — re-run with --execute' };
    writeFileSync(join(OUT_DIR, 's68-report-latest.json'), JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify(
        { ok: true, mode: 'reconcile', equivalent: rows.length, selectable: selectable.length },
        null,
        2,
      ),
    );
    return;
  }

  if (selectable.length === 0) {
    report.stop = { reason: 'no_selectable_non_duplicate' };
    writeFileSync(join(OUT_DIR, 's68-report-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: no selectable candidates');
    process.exit(1);
  }

  const selectedCandidates = selectable.map((s) => all[s.index]!);
  const live = await withMachinePendingWritesEnabled(() =>
    processExternalWorkerBatch({
      candidates: selectedCandidates,
      canaryCap: cap,
      dryRun: false,
    }),
  );

  if (isMachinePendingWriteEnabled()) {
    console.error('STOP: flag leakage');
    process.exit(1);
  }

  const inserted = live.results.filter((r) => r.status === 'inserted');
  const offerIds = inserted
    .map((r) => ('offerId' in r ? r.offerId : null))
    .filter(Boolean) as string[];

  const afterPending = await sb
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .is('deleted_at', null);
  const afterDist = await sb
    .from('distribution_publications')
    .select('id', { count: 'exact', head: true });

  const pendingDelta = (afterPending.count ?? 0) - (beforePending.count ?? 0);
  const distDelta = (afterDist.count ?? 0) - (beforeDist.count ?? 0);

  if (distDelta !== 0) {
    report.stop = { reason: 'unexpected_distribution_write', distDelta };
    writeFileSync(join(OUT_DIR, 's68-report-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: distribution write');
    process.exit(1);
  }
  if (pendingDelta !== inserted.length) {
    report.stop = {
      reason: 'pending_delta_mismatch',
      pendingDelta,
      inserted: inserted.length,
    };
    writeFileSync(join(OUT_DIR, 's68-report-latest.json'), JSON.stringify(report, null, 2));
    console.error('STOP: pending delta mismatch');
    process.exit(1);
  }

  // Idempotency retry
  let idempotency = null;
  if (selectedCandidates[0] && inserted.length > 0) {
    const retry = await withMachinePendingWritesEnabled(() =>
      processExternalWorkerBatch({
        candidates: [selectedCandidates[0]!],
        canaryCap: 1,
        dryRun: false,
      }),
    );
    const second = retry.results.filter((r) => r.status === 'inserted');
    idempotency = {
      results: retry.results,
      secondInsert: second.length > 0,
    };
    if (second.length > 0) {
      report.stop = { reason: 'idempotency_second_offer', idempotency };
      writeFileSync(join(OUT_DIR, 's68-report-latest.json'), JSON.stringify(report, null, 2));
      console.error('STOP: second offer');
      process.exit(1);
    }
  }

  // Focus claim
  let focus = null;
  if (offerIds[0]) {
    const claim = await claimNextModerationOffer(sb, stagingAuthor, {
      preferOfferId: offerIds[0],
    });
    if (claim.claimed && claim.offer) {
      await releaseModerationLockIfOwner(sb, String(claim.offer.id), stagingAuthor);
    }
    const { data: row } = await sb
      .from('offers')
      .select('id,status,product_fingerprint,bot_meta')
      .eq('id', offerIds[0])
      .maybeSingle();
    focus = {
      claimed: claim.claimed,
      status: row?.status,
      fingerprint: row?.product_fingerprint,
      hasBotMeta: Boolean(row?.bot_meta),
    };
    if (!claim.claimed || row?.status !== 'pending') {
      report.stop = { reason: 'focus_not_claimable', focus };
      writeFileSync(join(OUT_DIR, 's68-report-latest.json'), JSON.stringify(report, null, 2));
      console.error('STOP: focus');
      process.exit(1);
    }
  }

  report.canary = {
    selected: selectable,
    results: live.results,
    offerIds,
    pendingDelta,
    distDelta,
    idempotency,
    focus,
    flagAfter: isMachinePendingWriteEnabled(),
  };
  report.stop = { reason: null, completed: true };
  writeFileSync(join(OUT_DIR, 's68-report-latest.json'), JSON.stringify(report, null, 2));
  writeFileSync(
    join(OUT_DIR, `s68-report-${Date.now()}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'execute',
        inserted: inserted.length,
        offerIds,
        pendingDelta,
        distDelta,
        flagAfter: false,
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
