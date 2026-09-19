/**
 * S7 — READ-ONLY Supply operations diagnostic.
 *
 * Usage:
 *   npx tsx scripts/s7-supply-ops-diagnose.ts
 *   npx tsx scripts/s7-supply-ops-diagnose.ts --dry-batch   # processExternalWorkerBatch dryRun with discovery JSON if present
 *
 * Does NOT enable BOT_INGEST_MACHINE_PENDING_WRITES.
 * Does NOT touch Distribution / Rewards / Economy / Attribution.
 * Does NOT write offers unless you separately run s67 canary (not this script).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSupplyOpsRunSummary,
  diagnoseSupplyOpsBottleneck,
  formatSupplyOpsRunSummaryLog,
} from '../lib/bots/ingest/supplyOpsRunSummary';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import { isMachinePendingWriteEnabled } from '../lib/bots/ingest/machineLiveInsertEligibility';
import { ingestRunBlockFromConfig } from '../lib/bots/ingest/ingestRunGate';
import type { ExternalWorkerCandidate } from '../lib/bots/ingest/externalWorker';

const ROOT = process.cwd();
const DISCOVERY_PATH = join(ROOT, 'scripts/_smoke-gate-v2-discovery.json');
const OUT_DIR = join(ROOT, 'scripts/_s7_reports');

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
    sourceDetail: typeof r.sourceDetail === 'string' ? r.sourceDetail : 's7-diagnose',
    signals:
      r.signals && typeof r.signals === 'object'
        ? (r.signals as ExternalWorkerCandidate['signals'])
        : undefined,
  };
}

function loadDiscoveryCandidates(): ExternalWorkerCandidate[] {
  if (!existsSync(DISCOVERY_PATH)) return [];
  try {
    const raw = JSON.parse(readFileSync(DISCOVERY_PATH, 'utf8')) as unknown;
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray((raw as { candidates?: unknown }).candidates)
        ? (raw as { candidates: unknown[] }).candidates
        : [];
    return list.map(asCandidate).filter((c): c is ExternalWorkerCandidate => c != null);
  } catch {
    return [];
  }
}

async function main() {
  loadEnvFile(join(ROOT, '.env.local'));
  loadEnvFile(join(ROOT, '.env'));

  const startedAt = new Date().toISOString();
  const runId = `s7-diag-${Date.now()}`;
  const wantDryBatch = process.argv.includes('--dry-batch');

  const cfg = loadBotIngestConfig('standard');
  const writesEnabled = isMachinePendingWriteEnabled();
  // Read-only: do not hit DB for pause; treat as unknown→false for gate preview.
  const block = ingestRunBlockFromConfig(cfg, false);
  const discoveryCandidates = loadDiscoveryCandidates();

  const configSnapshot = {
    BOT_INGEST_ENABLED: cfg.enabled,
    BOT_INGEST_MACHINE_PENDING_WRITES: writesEnabled,
    botUserConfigured: cfg.botUserIdsForQuota.length > 0,
    botAuthorDualMode: cfg.botAuthorDualMode,
    botUserIdsForQuotaCount: cfg.botUserIdsForQuota.length,
    externalWorkerEnabled: cfg.externalWorkerEnabled,
    workerMaxPerRun: cfg.workerMaxPerRun,
    dailyMaxOffers: cfg.dailyMaxOffers,
    discoverMlEnabled: cfg.discoverMlEnabled,
    runGateBlock: block,
    authoritativeScheduler: {
      kind: 'github_actions',
      workflow: '.github/workflows/mercadolibre-worker.yml',
      schedule: '7,37 * * * *',
      ingestPath: '/api/cron/bot-ingest-candidates',
      discoveryOnlyDefault: true,
    },
    discoveryJsonPath: DISCOVERY_PATH,
    discoveryJsonExists: existsSync(DISCOVERY_PATH),
    discoveryCandidateCount: discoveryCandidates.length,
  };

  // Static bottleneck: production ops chain (before any live scrape).
  const staticDiag = diagnoseSupplyOpsBottleneck({
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    profile: 'standard',
    dryRun: true,
    machinePendingWritesEnabled: writesEnabled,
    discovered: discoveryCandidates.length,
    identityValid: discoveryCandidates.length,
    identityInvalid: 0,
    qualityVerified: 0,
    suppressed: 0,
    duplicates: 0,
    liveEligible: discoveryCandidates.length > 0 ? 1 : 0,
    budgetRejected: 0,
    writeAttempts: 0,
    writeSuccess: 0,
    writeDuplicate: 0,
    writeFailed: 0,
    writesDisabled: 0,
    dryRunSimulated: 0,
    runBlock: block,
  });

  let batchOps: ReturnType<typeof buildSupplyOpsRunSummary> | null = null;

  if (wantDryBatch && discoveryCandidates.length > 0) {
    // Preview funnel past run-gate WITHOUT enabling machine writes or mutating deployed env.
    // Restores prior env after the dryRun batch. Never sets BOT_INGEST_MACHINE_PENDING_WRITES.
    const prevEnabled = process.env.BOT_INGEST_ENABLED;
    const prevUser = process.env.BOT_INGEST_USER_ID;
    const prevWrites = process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    process.env.BOT_INGEST_ENABLED = '1';
    if (!process.env.BOT_INGEST_USER_ID?.trim()) {
      process.env.BOT_INGEST_USER_ID = '00000000-0000-4000-8000-0000000000s7';
    }
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;

    try {
      const { processExternalWorkerBatch } = await import('../lib/bots/ingest/externalWorker');
      const report = await processExternalWorkerBatch({
        candidates: discoveryCandidates.slice(0, 12),
        profile: 'standard',
        dryRun: true,
        discovery: {
          cycleIndex: 0,
          seedsAvailable: 1,
          seedsAttempted: 1,
          seedsSuccessful: discoveryCandidates.length > 0 ? 1 : 0,
          seedsZeroResults: discoveryCandidates.length === 0 ? 1 : 0,
          seedsFailed: 0,
          bySeed: [
            {
              id: 's7_diagnose_json',
              status: discoveryCandidates.length > 0 ? 'ok' : 'zero_results',
              rawLinks: discoveryCandidates.length,
              accepted: Math.min(12, discoveryCandidates.length),
            },
          ],
        },
      });
      batchOps = report.summary.ops ?? null;
    } finally {
      if (prevEnabled === undefined) delete process.env.BOT_INGEST_ENABLED;
      else process.env.BOT_INGEST_ENABLED = prevEnabled;
      if (prevUser === undefined) delete process.env.BOT_INGEST_USER_ID;
      else process.env.BOT_INGEST_USER_ID = prevUser;
      if (prevWrites === undefined) delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
      else process.env.BOT_INGEST_MACHINE_PENDING_WRITES = prevWrites;
    }
  }

  const finishedAt = new Date().toISOString();
  const report = {
    campaign: 'S7',
    mode: 'read_only',
    runId,
    startedAt,
    finishedAt,
    configSnapshot,
    staticBottleneck: staticDiag,
    dryBatchOps: batchOps,
    notes: [
      'GHA defaults WORKER_DISCOVERY_ONLY=1 → dryRun on POST (no DB insert).',
      'Server requires BOT_INGEST_MACHINE_PENDING_WRITES=1 for real pending inserts (default OFF).',
      'This script never enables machine writes.',
      'For controlled staging inserts use scripts/s67-machine-insert-canary.ts --execute (cap≤3).',
    ],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `s7-diagnose-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(
    formatSupplyOpsRunSummaryLog(
      buildSupplyOpsRunSummary({
        runId,
        startedAt,
        finishedAt,
        profile: 'standard',
        dryRun: true,
        machinePendingWritesEnabled: writesEnabled,
        discovered: discoveryCandidates.length,
        identityValid: discoveryCandidates.length,
        identityInvalid: 0,
        qualityVerified: batchOps?.qualityVerified ?? 0,
        suppressed: batchOps?.suppressed ?? 0,
        duplicates: batchOps?.duplicates ?? 0,
        liveEligible: batchOps?.liveEligible ?? 0,
        budgetRejected: batchOps?.budgetRejected ?? 0,
        writeAttempts: 0,
        writeSuccess: 0,
        writeDuplicate: 0,
        writeFailed: 0,
        writesDisabled: 0,
        dryRunSimulated: batchOps?.dryRunSimulated ?? 0,
        runBlock: block,
      }),
    ),
  );
  console.log(JSON.stringify({ outPath, staticBottleneck: staticDiag, configSnapshot }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
