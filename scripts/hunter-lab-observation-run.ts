/**
 * Hunter Lab observation run — persist Candidate Intelligence without mint.
 * Usage: npx tsx scripts/hunter-lab-observation-run.ts
 *
 * Requires env with Supabase service role (same as app). Never enables writes/mint.
 */
import { runIngestCycleForProfile } from '../lib/bots/ingest/runIngestCycle';
import { assertZeroSilentDrops } from '../lib/hunter/candidateIntelligence';

async function main() {
  process.env.HUNTER_CANDIDATE_INTELLIGENCE = process.env.HUNTER_CANDIDATE_INTELLIGENCE ?? '1';
  // Observation only — never turn on machine pending writes in this script.
  delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;

  console.info('[hunter-lab] starting observation cycle…');
  const report = await runIngestCycleForProfile('standard');
  const ci = report.summary.candidateIntelligence;
  console.info(
    JSON.stringify(
      {
        ok: report.ok,
        runMode: report.runMode,
        startedAt: report.startedAt,
        finishedAt: report.finishedAt,
        results: report.results.length,
        skipReasonCounts: report.summary.skipReasonCounts ?? null,
        stageCounts: report.summary.stageCounts ?? null,
        candidateIntelligence: ci
          ? {
              runId: ci.runId,
              candidateCount: ci.candidateCount,
              rejectedCount: ci.rejectedCount,
              wouldInsertCount: ci.wouldInsertCount,
              needsReviewCount: ci.needsReviewCount,
              duplicateCount: ci.duplicateCount,
              decisionBreakdown: ci.decisionBreakdown,
              rejectionBreakdown: ci.rejectionBreakdown,
              reconciliation: assertZeroSilentDrops(ci),
            }
          : null,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
