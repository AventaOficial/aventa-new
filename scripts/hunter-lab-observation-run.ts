/**
 * Hunter Lab observation run — persist Candidate Intelligence without mint.
 * Usage:
 *   npx tsx scripts/hunter-lab-observation-run.ts
 *   npx tsx scripts/hunter-lab-observation-run.ts --env .env.production.local --cycles 3
 *
 * Requires Supabase service role. Never enables writes/mint.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runIngestCycleForProfile } from '../lib/bots/ingest/runIngestCycle';
import { assertZeroSilentDrops } from '../lib/hunter/candidateIntelligence';

function loadEnvFile(path: string) {
  if (!existsSync(path)) {
    throw new Error(`Env file not found: ${path}`);
  }
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val === '[SENSITIVE]') continue;
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1]!;
}

async function runOneCycle(cycleIndex: number) {
  console.info(`[hunter-lab] cycle ${cycleIndex} starting…`);
  const report = await runIngestCycleForProfile('standard');
  const ci = report.summary.candidateIntelligence;
  const recon = ci ? assertZeroSilentDrops(ci) : null;
  const payload = {
    ok: report.ok,
    cycle: cycleIndex,
    runMode: report.runMode,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    results: report.results.length,
    skipReasonCounts: report.summary.skipReasonCounts ?? null,
    stageCounts: report.summary.stageCounts ?? null,
    candidateIntelligence: ci
      ? {
          runId: ci.runId,
          discovered: ci.candidateCount,
          accepted: ci.wouldInsertCount,
          rejected: ci.rejectedCount,
          duplicate: ci.duplicateCount,
          needsReview: ci.needsReviewCount,
          decisionBreakdown: ci.decisionBreakdown,
          rejectionBreakdown: ci.rejectionBreakdown,
          scoreDistribution: ci.scoreDistribution,
          reconciliation: recon,
        }
      : null,
  };
  console.info(JSON.stringify(payload, null, 2));
  return payload;
}

async function main() {
  const envPath = resolve(process.cwd(), argValue('--env') ?? '.env.production.local');
  loadEnvFile(envPath);

  process.env.HUNTER_CANDIDATE_INTELLIGENCE = '1';
  // Observation only — never turn on machine pending writes in this script.
  delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;

  const target = process.env.AVENTA_SUPABASE_TARGET ?? '(unset)';
  const ref = process.env.AVENTA_EXPECTED_SUPABASE_REF ?? '(unset)';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(unset)';
  console.info(
    JSON.stringify(
      {
        phase: 'lab_boot',
        envFile: envPath,
        target,
        ref,
        supabaseHost: url.replace(/^https?:\/\//, '').split('/')[0],
        hunterCi: process.env.HUNTER_CANDIDATE_INTELLIGENCE,
        writes: process.env.BOT_INGEST_MACHINE_PENDING_WRITES ?? '(unset=OFF)',
      },
      null,
      2,
    ),
  );

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL');
  }

  const cycles = Math.max(1, Number(argValue('--cycles') ?? '3') || 3);
  const runs = [];
  for (let i = 1; i <= cycles; i += 1) {
    runs.push(await runOneCycle(i));
  }
  console.info(JSON.stringify({ phase: 'lab_done', cycles: runs.length, runs }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
