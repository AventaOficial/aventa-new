/**
 * Composición pura del snapshot a partir de datos normalizados + runtime.
 * Testeable sin Supabase.
 */

import {
  REWARDS_CREATOR_SHARE_BPS,
  REWARDS_HOLD_DAYS,
  REWARDS_MIN_PAYOUT_CENTS,
  REWARDS_TERMS_VERSION,
} from '@/lib/rewards/config';
import { evaluateAutoRelease } from './autoRelease';
import { computeAutomationScore } from './automationScore';
import { buildPayoutBatchPreview } from './batchPreview';
import { buildExceptionQueue } from './exceptions';
import { buildRunbook } from './runbook';
import { buildPipelineStages } from './stages';
import type { PayoutOpsData, PayoutOpsRuntime, PayoutOpsSnapshot } from './types';

export function composePayoutOpsSnapshot(
  data: PayoutOpsData,
  runtime: PayoutOpsRuntime,
  role: string,
  env: NodeJS.ProcessEnv = process.env,
): PayoutOpsSnapshot {
  const config = {
    creatorShareBps: REWARDS_CREATOR_SHARE_BPS,
    minPayoutCents: REWARDS_MIN_PAYOUT_CENTS,
    holdDays: REWARDS_HOLD_DAYS,
    termsVersion: REWARDS_TERMS_VERSION,
  };

  const batch = buildPayoutBatchPreview(data, runtime, {
    minPayoutCents: config.minPayoutCents,
    requiredTermsVersion: config.termsVersion,
  });
  const stages = buildPipelineStages(data, runtime, config, {
    payableCents: batch.totals.payableCents,
    payableCount: batch.totals.payableCount,
    reviewCount: batch.totals.reviewCount,
    blockedCount: batch.totals.blockedCount,
    carryCount: batch.totals.carryCount,
  });
  const score = computeAutomationScore(stages);
  const runbook = buildRunbook(data, runtime, batch);
  const exceptions = buildExceptionQueue(data, batch);
  const autoRelease = evaluateAutoRelease(runtime, batch, stages, env);

  return {
    generatedAt: data.now,
    role,
    runtime,
    config,
    stages,
    score,
    runbook,
    batch,
    exceptions,
    autoRelease,
    tables: data.tables,
  };
}
