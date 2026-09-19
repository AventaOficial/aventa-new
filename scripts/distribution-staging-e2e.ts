/**
 * Controlled Distribution staging E2E runner.
 * Confirms staging target + safety flags, runs harness, writes observability report.
 * Never Telegram real. Never production writes. Leaves Distribution OFF in process env.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  runE2ESuccessCircuit,
  runE2EPendingBlocked,
  runE2ERejectedBlocked,
  runE2EUnknownAndRecover,
  runE2ELeaseReclaimBranches,
  runE2EConcurrentClaim,
  runE2EConcurrentReclaim,
  runE2EProviderFailure,
  runE2EDefiniteFailurePath,
} from '../lib/distribution/e2e/stagingHarness';
import { isDistributionEngineEnabled } from '../lib/distribution/constants';
import { isMachinePendingWriteEnabled } from '../lib/bots/ingest/machineLiveInsertEligibility';

function loadEnvFile(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]!] === undefined) {
      process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '');
    }
  }
}

async function main() {
  loadEnvFile(join(process.cwd(), '.env.local'));

  const target = (process.env.AVENTA_SUPABASE_TARGET ?? '').trim().toLowerCase();
  const expected = (process.env.AVENTA_EXPECTED_SUPABASE_REF ?? '').trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const ref = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? '';

  const safety = {
    AVENTA_SUPABASE_TARGET: target,
    expectedRef: expected,
    urlRef: ref,
    stagingConfirmed:
      target === 'staging' &&
      expected === 'oojshofrpbfwsiypcecr' &&
      ref === 'oojshofrpbfwsiypcecr',
    distributionEnabledBefore: isDistributionEngineEnabled(process.env),
    machineWritesBefore: isMachinePendingWriteEnabled(),
    telegramProductionOff: true,
    rewardsNotActivatedByThisRun: true,
    economyNotActivatedByThisRun: true,
    attributionNotActivatedByThisRun: true,
  };

  if (!safety.stagingConfirmed) {
    console.error('[distribution-e2e] FAIL staging target check', safety);
    process.exit(1);
  }

  // Harness enables engine only inside e2eEnv — process.env stays OFF.
  const success = await runE2ESuccessCircuit({ runId: `staging-${Date.now()}` });
  const pending = await runE2EPendingBlocked();
  const rejected = await runE2ERejectedBlocked();
  const unknown = await runE2EUnknownAndRecover();
  const lease = await runE2ELeaseReclaimBranches();
  const claim = await runE2EConcurrentClaim();
  const reclaim = await runE2EConcurrentReclaim();
  const retryableFail = await runE2EProviderFailure();
  const definiteFail = await runE2EDefiniteFailurePath();

  const report = {
    ok: true,
    at: new Date().toISOString(),
    safety: {
      ...safety,
      distributionEnabledAfter: isDistributionEngineEnabled(process.env),
      machineWritesAfter: isMachinePendingWriteEnabled(),
    },
    matrix: {
      success: {
        publicationStatus: success.store.publications[0]?.status,
        offerStatus: success.report.finalOfferStatus,
        externalMessageId: success.report.externalMessageId,
        idempotencyKey: success.report.idempotencyKey,
        providerInvocations: success.report.providerInvocations,
        duplicateCount: success.report.duplicateCount,
      },
      pendingBlocked: pending,
      rejectedBlocked: rejected,
      unknownRecovery: {
        afterReleaseStatus: unknown.afterReleaseStatus,
        providerInvocationsDuringRelease: unknown.providerInvocationsDuringRelease,
        events: unknown.report.events.map((e) => e.event_type),
      },
      lease,
      concurrentClaimWinners: claim.winners,
      concurrentReclaim: reclaim.decisions,
      retryableFailureStatus: retryableFail.status,
      definiteFailureStatus: definiteFail.status,
    },
    observability: success.report,
  };

  const dir = join(process.cwd(), 'scripts/_distribution_e2e_reports');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, 'staging-e2e-latest.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, out, matrix: report.matrix }, null, 2));
}

main().catch((e) => {
  console.error('[distribution-e2e]', e);
  process.exit(1);
});
