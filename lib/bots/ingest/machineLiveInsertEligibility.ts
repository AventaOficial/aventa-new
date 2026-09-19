/**
 * S6.6 — Live machine insert eligibility.
 *
 * Single quality authority: evaluateMachineCandidateGate (S6.1).
 * Does NOT reimplement policy. Does NOT fall back to mlWorkerMayInsertPending.
 *
 * Operational write activation (separate from quality):
 *   BOT_INGEST_MACHINE_PENDING_WRITES=1|true → allow insertIngestedOffer after gate
 *   default OFF → no DB offers write (S6.7 canary target)
 */

import type { BotIngestConfig } from './config';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type { ScoreDecision } from './scoreIngestCandidate';
import {
  evaluateMachineCandidateGate,
  type CandidateGateResult,
  type MachineCandidateGateInput,
} from './candidateInsertGate';
import type { DealScore } from '@/lib/dealIntelligence';
import type { DuplicateOfferKind } from '@/lib/offers/findDuplicateOffer';

export type MachineLiveInsertEligibility = {
  /** True iff gate.wouldInsert (VERIFIED_OPPORTUNITY). */
  eligible: boolean;
  wouldInsert: boolean;
  qualityDecision: CandidateGateResult['qualityDecision'];
  reasonCodes: CandidateGateResult['reasonCodes'];
  evidenceLevel: CandidateGateResult['evidenceLevel'];
  gateAction: CandidateGateResult['action'];
  gateReason: string;
  /** Full S6.1 result — no second policy. */
  gate: CandidateGateResult;
  /** True when required live input could not be assembled → fail closed. */
  failClosed: boolean;
  failClosedReason: string | null;
};

/**
 * Production machine pending writes. Default OFF until S6.7 canary.
 * Independent of quality gate (quality may pass while writes stay disabled).
 */
export function isMachinePendingWriteEnabled(): boolean {
  const v = (process.env.BOT_INGEST_MACHINE_PENDING_WRITES ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export type EvaluateMachineLiveInsertEligibilityInput = {
  url: string;
  meta: ParsedOfferMetadata | null;
  config: BotIngestConfig;
  /** From evaluateDealSafe / scoreIngestCandidate — existing thresholds. */
  verifierDecision: ScoreDecision | 'reject';
  verifierReasons?: string[];
  duplicate?: {
    kind: DuplicateOfferKind;
    price: number | null;
  } | null;
  dealScore?: DealScore | null;
  pdpBlocked?: boolean | null;
  requireOriginalPrice?: boolean;
};

/**
 * Live eligibility === S6.1 gate. No alternate policy.
 * Fail closed if meta/url missing (cannot build gate input).
 */
export function evaluateMachineLiveInsertEligibility(
  input: EvaluateMachineLiveInsertEligibilityInput,
): MachineLiveInsertEligibility {
  if (!input.meta) {
    return {
      eligible: false,
      wouldInsert: false,
      qualityDecision: 'SUPPRESSED',
      reasonCodes: ['MISSING_META'],
      evidenceLevel: 'none',
      gateAction: 'suppress',
      gateReason: 'fail_closed_missing_meta',
      gate: {
        action: 'suppress',
        reason: 'fail_closed_missing_meta',
        processingStatus: 'failed',
        qualityDecision: 'SUPPRESSED',
        wouldInsert: false,
        reasonCodes: ['MISSING_META'],
        evidenceLevel: 'none',
        confidence: 0,
      },
      failClosed: true,
      failClosedReason: 'missing_meta',
    };
  }

  const url = (input.url || input.meta.canonicalUrl || '').trim();
  if (!url) {
    return {
      eligible: false,
      wouldInsert: false,
      qualityDecision: 'INVALID',
      reasonCodes: ['INVALID_URL'],
      evidenceLevel: 'none',
      gateAction: 'invalid',
      gateReason: 'fail_closed_missing_url',
      gate: {
        action: 'invalid',
        reason: 'fail_closed_missing_url',
        processingStatus: 'failed',
        qualityDecision: 'INVALID',
        wouldInsert: false,
        reasonCodes: ['INVALID_URL'],
        evidenceLevel: 'none',
        confidence: 0,
      },
      failClosed: true,
      failClosedReason: 'missing_url',
    };
  }

  const gateInput: MachineCandidateGateInput = {
    url,
    meta: input.meta,
    config: input.config,
    verifierDecision: input.verifierDecision,
    verifierReasons: input.verifierReasons,
    duplicate: input.duplicate,
    dealScore: input.dealScore,
    pdpBlocked: input.pdpBlocked,
    requireOriginalPrice: input.requireOriginalPrice,
  };

  let gate: CandidateGateResult;
  try {
    gate = evaluateMachineCandidateGate(gateInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      eligible: false,
      wouldInsert: false,
      qualityDecision: 'SUPPRESSED',
      reasonCodes: ['MISSING_META'],
      evidenceLevel: 'none',
      gateAction: 'suppress',
      gateReason: `fail_closed_gate_error:${message.slice(0, 120)}`,
      gate: {
        action: 'suppress',
        reason: 'fail_closed_gate_error',
        processingStatus: 'failed',
        qualityDecision: 'SUPPRESSED',
        wouldInsert: false,
        reasonCodes: ['MISSING_META'],
        evidenceLevel: 'none',
        confidence: 0,
      },
      failClosed: true,
      failClosedReason: 'gate_threw',
    };
  }

  // LIVE_INSERT_ELIGIBLE iff VERIFIED_OPPORTUNITY ∧ wouldInsert (S6.1 invariant).
  const eligible =
    gate.qualityDecision === 'VERIFIED_OPPORTUNITY' && gate.wouldInsert === true;

  return {
    eligible,
    wouldInsert: gate.wouldInsert,
    qualityDecision: gate.qualityDecision,
    reasonCodes: gate.reasonCodes,
    evidenceLevel: gate.evidenceLevel,
    gateAction: gate.action,
    gateReason: gate.reason,
    gate,
    failClosed: false,
    failClosedReason: null,
  };
}

/** Skip reason prefix for live path telemetry (structured, no secrets). */
export function machineGateSkipReason(el: MachineLiveInsertEligibility): string {
  if (el.failClosed) {
    return `s61_fail_closed:${el.failClosedReason ?? 'unknown'}`;
  }
  const code = el.reasonCodes[0] ?? el.qualityDecision;
  return `s61_gate:${el.qualityDecision}:${code}`;
}
