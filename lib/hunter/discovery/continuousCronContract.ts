/**
 * Day 8 closure — scheduled Continuous Discovery contract.
 *
 * cronSafe is fail-closed: dry-run always, mint never, even if a caller
 * passes allowStagingMint. Does not read or log secrets.
 */

import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';
import { ML_PRICE_TZ } from '@/lib/bots/ingest/mlPriceEngine';

/**
 * Vercel Hobby accepts at most one cron trigger per day, and vercel.json
 * rejects query strings. The scheduler entry is therefore
 * GET /api/cron/continuous-discovery at 17:00 UTC, which calls the same
 * runContinuousDiscoveryCycle as GET /api/cron/bot-ingest?mode=continuous.
 * Sub-daily cadence needs Vercel Pro (or an external scheduler).
 */
export const CONTINUOUS_DISCOVERY_CRON_PATH = '/api/cron/continuous-discovery';
export const CONTINUOUS_DISCOVERY_CRON_SCHEDULE = '0 17 * * *';

/** Cap candidates so cronSafe finishes inside Vercel maxDuration (300s). */
export const SCHEDULED_CONTINUOUS_MAX_PRIORITIZED = 8;

/** Soft stop before hard kill so truth/snapshot can still persist. */
export const SCHEDULED_CONTINUOUS_DEADLINE_MS = 180_000;

export type ContinuousExecutionMode = {
  dryRun: boolean;
  allowMint: boolean;
};

/**
 * Scheduled cron invocations cannot mint. Manual staging canaries may still
 * pass allowStagingMint only when cronSafe is not set.
 */
export function resolveContinuousExecutionMode(options: {
  dryRun?: boolean;
  allowStagingMint?: boolean;
  cronSafe?: boolean;
}): ContinuousExecutionMode {
  if (options.cronSafe === true) {
    return { dryRun: true, allowMint: false };
  }
  const dryRun = options.dryRun !== false;
  return {
    dryRun,
    allowMint: options.allowStagingMint === true && !dryRun,
  };
}

/** One cycle identity per Mexico hour. Retries upsert the same cycle_id. */
export function scheduledContinuousCycleId(now: Date = new Date()): string {
  const ymd = formatYmdInTz(now, ML_PRICE_TZ);
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: ML_PRICE_TZ,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const hh = hour.padStart(2, '0').slice(0, 2);
  return `continuous-${ymd}-${hh}`;
}
