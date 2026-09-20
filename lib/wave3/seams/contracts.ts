/**
 * WAVE 3 seam contracts — thin validation + delegation to canonical authorities.
 * NO second writers. NO new tables. Fail-closed. Safe diagnostics only.
 */

import type { OpportunityCandidate } from '@/lib/supply/intelligence/types';
import type { OpportunityEvaluation } from '@/lib/supply/intelligence/types';
import { evaluateOpportunity } from '@/lib/supply/intelligence/evaluateOpportunity';
import {
  evaluateSupplyPolicy,
  type SupplyDecision,
} from '@/lib/supply/policy';
import {
  buildParsedMetaFromOpportunity,
  writePendingViaS7Bridge,
  type S7BridgeWriteResult,
} from '@/lib/supply/s7Bridge';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import {
  enqueueDistributionForApprovedOffer,
} from '@/lib/distribution/enqueue';
import type { EnqueueDistributionResult } from '@/lib/distribution/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordAttributedClick } from '@/lib/attribution/recordAttributedClick';
import {
  resolveConversionAttributionStrict,
  recordConversion,
} from '@/lib/economy/recordConversion';
import { recordCommission } from '@/lib/economy/recordCommission';
import { settleCommission } from '@/lib/economy/settlement/settleCommission';
import { applyHarnessModerationDecision } from '@/lib/distribution/e2e/moderationAuthority';
import { isDistributionEngineEnabled } from '@/lib/distribution/constants';
import { isSettlementBridgeEnabled } from '@/lib/economy/settlement/isSettlementBridgeEnabled';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';

export type SeamDiagnostic = {
  seam: string;
  ok: boolean;
  code: string;
  identity: Record<string, string | null>;
  /** Never include secrets / tokens / raw HTML */
  notes: string[];
};

function diag(
  seam: string,
  ok: boolean,
  code: string,
  identity: Record<string, string | null>,
  notes: string[] = [],
): SeamDiagnostic {
  return { seam, ok, code, identity, notes };
}

/** S8 → S9: consume evaluation; never re-score. */
export async function seamS8toS9(input: {
  candidate: OpportunityCandidate;
  env?: NodeJS.ProcessEnv;
  mode?: 'dry_run' | 'execute';
  skipAdapterFetch?: boolean;
}): Promise<{
  evaluation: OpportunityEvaluation | null;
  decision: SupplyDecision;
  diagnostic: SeamDiagnostic;
}> {
  const url = (input.candidate.url || '').trim();
  if (!url) {
    const decision = evaluateSupplyPolicy({
      evaluation: null,
      evaluationError: null,
      mode: input.mode ?? 'dry_run',
      env: input.env,
    });
    return {
      evaluation: null,
      decision,
      diagnostic: diag('S8→S9', false, 'MALFORMED_INPUT', { url: null }),
    };
  }

  let evaluation: OpportunityEvaluation | null = null;
  let evaluationError: string | null = null;
  try {
    evaluation = await evaluateOpportunity(input.candidate, {
      skipAdapterFetch: input.skipAdapterFetch ?? true,
      forceDryRun: true,
    });
  } catch (e) {
    evaluationError = e instanceof Error ? e.message : 's8_threw';
  }

  const decision = evaluateSupplyPolicy({
    evaluation,
    evaluationError,
    mode: input.mode ?? 'dry_run',
    env: input.env,
  });

  return {
    evaluation,
    decision,
    diagnostic: diag(
      'S8→S9',
      decision.eligible,
      decision.code,
      {
        url,
        fingerprint: evaluation?.productFingerprint ?? null,
        s8: evaluation?.decision ?? null,
      },
      decision.reasons.slice(0, 5),
    ),
  };
}

/** S9 → S7: only via bridge + insertIngestedOffer. */
export async function seamS9toS7(input: {
  candidate: OpportunityCandidate;
  evaluation: OpportunityEvaluation;
  config: BotIngestConfig;
  decision: SupplyDecision;
  requireDedicatedAuthor?: boolean;
}): Promise<{ write: S7BridgeWriteResult | null; diagnostic: SeamDiagnostic }> {
  if (!input.decision.eligible) {
    return {
      write: null,
      diagnostic: diag(
        'S9→S7',
        false,
        'NOT_ELIGIBLE',
        { url: input.evaluation.candidateUrl },
        [input.decision.code],
      ),
    };
  }
  const meta = buildParsedMetaFromOpportunity({
    candidate: input.candidate,
    evaluation: input.evaluation,
  });
  if (!meta) {
    return {
      write: null,
      diagnostic: diag('S9→S7', false, 'INVALID_PROVENANCE', {
        url: input.evaluation.candidateUrl,
      }),
    };
  }
  const write = await writePendingViaS7Bridge({
    config: input.config,
    meta,
    ingestSource: 'wave3_seam',
    requireDedicatedAuthor: input.requireDedicatedAuthor ?? true,
  });
  const ok = write.ok === true;
  return {
    write,
    diagnostic: diag(
      'S9→S7',
      ok,
      ok ? 'WRITE_OK' : 'code' in write && write.code ? write.code : 'WRITE_FAILED',
      {
        url: meta.canonicalUrl,
        offerId: ok && write.ok ? write.offerId : null,
      },
    ),
  };
}

/** S7 → Moderation: only pending → approved|rejected (CAS). */
export async function seamS7toModeration(
  supabase: SupabaseClient,
  input: { offerId: string; decision: 'approved' | 'rejected' },
): Promise<{ diagnostic: SeamDiagnostic }> {
  const id = input.offerId.trim();
  if (!id) {
    return {
      diagnostic: diag('S7→Moderation', false, 'MISSING_OFFER_ID', { offerId: null }),
    };
  }
  const result = await applyHarnessModerationDecision(supabase, {
    offerId: id,
    decision: input.decision,
  });
  return {
    diagnostic: diag(
      'S7→Moderation',
      result.ok,
      result.ok ? result.status : result.reason,
      { offerId: id },
    ),
  };
}

/** Moderation → Distribution: enqueue only; never Telegram. */
export async function seamModerationToDistribution(
  offerId: string,
  options?: { supabase?: SupabaseClient; env?: NodeJS.ProcessEnv },
): Promise<{ result: EnqueueDistributionResult; diagnostic: SeamDiagnostic }> {
  const env = options?.env ?? process.env;
  if (isRewardsProgramActive()) {
    return {
      result: { ok: false, error: 'rewards_accidentally_enabled' } as EnqueueDistributionResult,
      diagnostic: diag('Mod→Dist', false, 'REWARDS_ENABLED_FORBIDDEN', {
        offerId,
      }),
    };
  }
  if (!isDistributionEngineEnabled(env)) {
    return {
      result: { ok: true, skipped: 'flag_disabled' },
      diagnostic: diag('Mod→Dist', true, 'FLAG_DISABLED', { offerId }),
    };
  }
  const result = await enqueueDistributionForApprovedOffer(offerId, {
    supabase: options?.supabase,
    env,
  });
  const skipped = 'skipped' in result ? result.skipped : null;
  return {
    result,
    diagnostic: diag(
      'Mod→Dist',
      result.ok !== false,
      skipped ? String(skipped) : 'ENQUEUED',
      { offerId },
    ),
  };
}

/** Distribution → Click: canonical recordAttributedClick. */
export async function seamDistributionToClick(
  supabase: SupabaseClient,
  input: {
    offerId: string;
    clickerUserId?: string | null;
    nowMs?: number;
  },
): Promise<{ clickId: string | null; diagnostic: SeamDiagnostic }> {
  const click = await recordAttributedClick(supabase, {
    offerId: input.offerId,
    clickerUserId: input.clickerUserId ?? null,
    nowMs: input.nowMs,
  });
  return {
    clickId: click?.clickId ?? null,
    diagnostic: diag(
      'Dist→Click',
      Boolean(click?.clickId),
      click ? 'CLICK_RECORDED' : 'CLICK_FAILED',
      {
        offerId: input.offerId,
        clickId: click?.clickId ?? null,
      },
    ),
  };
}

/** Click → Attribution → Conversion. */
export async function seamClickToConversion(
  supabase: SupabaseClient,
  input: {
    clickId?: string | null;
    offerId?: string | null;
    externalConversionId: string;
    network?: 'mercadolibre' | 'amazon';
    occurredAt?: Date;
  },
): Promise<{
  conversionId: string | null;
  attributionStatus: string | null;
  diagnostic: SeamDiagnostic;
}> {
  const attr = await resolveConversionAttributionStrict(supabase, {
    clickId: input.clickId ?? null,
    offerId: input.offerId ?? null,
  });
  const conv = await recordConversion(supabase, {
    source: 'manual',
    network: input.network ?? 'mercadolibre',
    externalConversionId: input.externalConversionId,
    occurredAt: input.occurredAt ?? new Date(),
    clickId: input.clickId ?? null,
    offerId: input.offerId ?? attr.offerId ?? null,
    actor: 'wave3_seam',
  });
  return {
    conversionId: conv?.conversionId ?? null,
    attributionStatus: conv?.attributionStatus ?? attr.attributionStatus,
    diagnostic: diag(
      'Click→Conversion',
      Boolean(conv?.conversionId),
      conv ? (conv.reused ? 'CONVERSION_REUSED' : 'CONVERSION_RECORDED') : 'CONVERSION_FAILED',
      {
        clickId: input.clickId ?? null,
        offerId: input.offerId ?? null,
        conversionId: conv?.conversionId ?? null,
        attribution: conv?.attributionStatus ?? attr.attributionStatus,
      },
    ),
  };
}

/** Attribution/Conversion → Commission. */
export async function seamConversionToCommission(
  supabase: SupabaseClient,
  input: {
    conversionId: string;
    externalCommissionId: string;
    grossCommissionCents: number;
    network?: 'mercadolibre' | 'amazon';
    status?: 'pending' | 'approved';
  },
): Promise<{ commissionId: string | null; diagnostic: SeamDiagnostic }> {
  if (isRewardsProgramActive()) {
    return {
      commissionId: null,
      diagnostic: diag('Conv→Comm', false, 'REWARDS_ENABLED_FORBIDDEN', {
        conversionId: input.conversionId,
      }),
    };
  }
  const row = await recordCommission(supabase, {
    conversionId: input.conversionId,
    source: 'manual',
    network: input.network ?? 'mercadolibre',
    externalCommissionId: input.externalCommissionId,
    grossCommissionCents: input.grossCommissionCents,
    occurredAt: new Date(),
    status: input.status ?? 'pending',
    actor: 'wave3_seam',
  });
  return {
    commissionId: row?.commissionId ?? null,
    diagnostic: diag(
      'Conv→Comm',
      Boolean(row?.commissionId),
      row ? (row.reused ? 'COMMISSION_REUSED' : 'COMMISSION_RECORDED') : 'COMMISSION_FAILED',
      {
        conversionId: input.conversionId,
        commissionId: row?.commissionId ?? null,
        ledgerEntryId: null,
      },
    ),
  };
}

/** Commission → Settlement (gated). Never creates rewards. */
export async function seamCommissionToSettlement(
  supabase: SupabaseClient,
  input: { commissionId: string; env?: NodeJS.ProcessEnv },
): Promise<{
  ledgerEntryId: string | null;
  diagnostic: SeamDiagnostic;
}> {
  const env = input.env ?? process.env;
  if (isRewardsProgramActive()) {
    return {
      ledgerEntryId: null,
      diagnostic: diag('Comm→Settle', false, 'REWARDS_ENABLED_FORBIDDEN', {
        commissionId: input.commissionId,
      }),
    };
  }
  if (!isSettlementBridgeEnabled(env)) {
    return {
      ledgerEntryId: null,
      diagnostic: diag('Comm→Settle', false, 'SETTLEMENT_DISABLED', {
        commissionId: input.commissionId,
      }),
    };
  }
  if (isMoneyPathFrozen()) {
    return {
      ledgerEntryId: null,
      diagnostic: diag('Comm→Settle', false, 'MONEY_PATH_FROZEN', {
        commissionId: input.commissionId,
      }),
    };
  }
  const result = await settleCommission(supabase, {
    commissionId: input.commissionId,
    actor: 'wave3_seam',
  });
  return {
    ledgerEntryId: result.ledgerEntryId,
    diagnostic: diag(
      'Comm→Settle',
      result.ok,
      result.ok ? (result.reused ? 'SETTLED_REUSED' : 'SETTLED') : result.reason ?? 'SETTLE_FAILED',
      {
        commissionId: input.commissionId,
        ledgerEntryId: result.ledgerEntryId,
        createdReward: result.createdCreatorReward ? 'true' : 'false',
      },
      result.createdCreatorReward || result.createdPayout
        ? ['FORBIDDEN_REWARD_OR_PAYOUT']
        : [],
    ),
  };
}
