/**
 * S6.1 — Build DealAlertsDealDetected from S8 evaluation.
 * Reuses lib/dealIntelligence/dealDetectedEvent — minimal backwards-compatible extension.
 */

import {
  buildDealDetectedEvent,
  assertDealDetectedDoesNotPublish,
} from '@/lib/dealIntelligence';
import { resolveIdentityFromUrl, buildExactIdentity } from '@/lib/dealIntelligence/identity';
import { buildPriceObservation } from '@/lib/dealIntelligence/priceObservation';
import type { OpportunityEvaluation } from '@/lib/supply/intelligence/types';
import type { DealEvidenceStrength } from '@/lib/hunter/dealEvidence/contract';
import { DEAL_ALERTS_CONTRACT_VERSION } from './constants';
import { evaluateAlertabilityFromOpportunity } from './alertability';
import { buildDealAlertsIdempotencyKey } from './idempotency';
import type { DealAlertsDealDetected } from './types';

export type BuildDealAlertsDealDetectedInput = {
  evaluation: OpportunityEvaluation;
  sourceId?: string;
  merchant?: string | null;
  store?: string | null;
  evidenceStrength?: DealEvidenceStrength | null;
  dqeEligible?: boolean | null;
  now?: Date;
  maxAgeSeconds?: number;
};

/**
 * Compose DI DealDetectedEvent + AlertabilityEvidence.
 * publicationAllowed remains false. No userId. No persistence.
 */
export function buildDealAlertsDealDetected(
  input: BuildDealAlertsDealDetectedInput,
): DealAlertsDealDetected {
  const evaluation = input.evaluation;
  const sourceId = input.sourceId ?? evaluation.candidateUrl;
  const url = evaluation.candidateUrl;

  let identity = resolveIdentityFromUrl({
    url,
    merchant: input.merchant ?? input.store ?? null,
  });
  if (
    evaluation.productFingerprint &&
    (identity.identityStatus === 'unknown' || !identity.productFingerprint)
  ) {
    const fp = evaluation.productFingerprint;
    if (fp.startsWith('amz:') || fp.startsWith('ml:')) {
      identity = buildExactIdentity({
        merchant: input.merchant ?? input.store ?? identity.merchant,
        asin: fp.startsWith('amz:') ? fp.slice(4) : null,
        mlItemId: fp.startsWith('ml:') ? fp.slice(4) : null,
        canonicalUrl: url,
        productFingerprint: fp,
      });
    }
  }

  const salePrice = evaluation.evidence.salePrice.amount;
  const observedAt = evaluation.evaluatedAt;

  const priceBuilt =
    salePrice != null && Number.isFinite(salePrice)
      ? buildPriceObservation({
          identity,
          merchant: identity.merchant,
          currency: 'MXN',
          salePrice,
          listPrice: evaluation.evidence.referencePrice?.amount ?? null,
          observedAt,
          sourceId,
          url,
          captureMethod: 'derived',
          extractionConfidence: evaluation.score.confidence,
          evidence: [
            {
              kind: 's8_opportunity',
              ref: evaluation.evidence.evidenceLevel,
              note: `decision=${evaluation.decision}`,
            },
          ],
          backendHint: 'product_price_snapshots',
        })
      : null;

  const priceObservation =
    priceBuilt != null && !('ok' in priceBuilt) ? priceBuilt : null;

  const baseEvent = buildDealDetectedEvent({
    productIdentity: identity,
    sourceId,
    observedAt,
    priceObservation,
    evidence: [
      {
        kind: 'opportunity_evidence_level',
        ref: evaluation.evidence.evidenceLevel,
      },
      {
        kind: 'history_ready',
        ref: String(evaluation.evidence.historyReady),
      },
    ],
    confidence: evaluation.score.confidence,
  });

  assertDealDetectedDoesNotPublish(baseEvent);

  const alertability = evaluateAlertabilityFromOpportunity(evaluation, {
    identityStatus: identity.identityStatus,
    merchant: identity.merchant,
    store: input.store ?? null,
    sourceId,
    evidenceStrength: input.evidenceStrength ?? null,
    dqeEligible: input.dqeEligible ?? null,
    now: input.now,
    maxAgeSeconds: input.maxAgeSeconds,
  });

  // Prefer Deal Alerts idempotency (window-versioned) while keeping DI event fields.
  const dealAlertsKey = buildDealAlertsIdempotencyKey({
    sourceId,
    identity,
    observedAt,
    salePrice,
    scoreVersion: null,
  });

  return {
    ...baseEvent,
    idempotencyKey: dealAlertsKey,
    dealAlertsContractVersion: DEAL_ALERTS_CONTRACT_VERSION,
    alertability,
    userScoped: false,
  };
}
