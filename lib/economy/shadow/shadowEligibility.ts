import type { ActorType } from '@/lib/actors/actorType';
import type { RewardsBetaStatus } from '@/lib/rewards/betaCohort';
import { splitCommissionCents } from '@/lib/rewards/config';

export const SHADOW_OBSERVATION_KIND = 'SHADOW_ONLY' as const;

export type ShadowRule = {
  version: string;
  creatorShareBps: number;
};

export type ShadowEligibilityReason =
  | 'eligible'
  | 'missing_commission'
  | 'missing_conversion'
  | 'missing_click'
  | 'missing_creator'
  | 'machine_actor'
  | 'system_actor'
  | 'self_click'
  | 'anonymous_click'
  | 'unattributed'
  | 'unresolved'
  | 'reversed_commission'
  | 'rejected_commission'
  | 'not_enrolled'
  | 'invalid_chain';

export type ShadowChainEvidence = {
  commission: {
    id: string;
    conversionId: string;
    status: string;
    grossCommissionCents: number;
  } | null;
  conversion: {
    id: string;
    clickId: string | null;
    offerId: string | null;
    attributionStatus: 'attributed' | 'unattributed' | 'unresolved';
  } | null;
  click: {
    id: string;
    offerId: string;
    clickerUserId: string | null;
  } | null;
  offer: {
    id: string;
    creatorUserId: string | null;
  } | null;
  actorType: ActorType | null;
  membershipStatus: RewardsBetaStatus | 'none';
  attributionMethod: 'sub_id' | 'product_click_window' | 'manual' | null;
};

export type ShadowObservation = {
  commissionId: string;
  conversionId: string | null;
  clickId: string | null;
  offerId: string | null;
  creatorUserId: string | null;
  ruleVersion: string;
  creatorShareBps: number;
  grossCommissionCents: number;
  projectedCreatorCents: number;
  projectedPlatformCents: number;
  eligibilityStatus: 'eligible' | 'ineligible';
  reason: ShadowEligibilityReason;
  observationKind: typeof SHADOW_OBSERVATION_KIND;
  withdrawable: false;
};

const STRONG_METHODS = new Set(['sub_id', 'manual']);

function invalid(reason: ShadowEligibilityReason, evidence: ShadowChainEvidence, rule: ShadowRule): ShadowObservation {
  return {
    commissionId: evidence.commission?.id ?? '',
    conversionId: evidence.conversion?.id ?? null,
    clickId: evidence.click?.id ?? null,
    offerId: evidence.offer?.id ?? evidence.click?.offerId ?? null,
    creatorUserId: evidence.offer?.creatorUserId ?? null,
    ruleVersion: rule.version,
    creatorShareBps: rule.creatorShareBps,
    grossCommissionCents: Math.max(0, evidence.commission?.grossCommissionCents ?? 0),
    projectedCreatorCents: 0,
    projectedPlatformCents: 0,
    eligibilityStatus: 'ineligible',
    reason,
    observationKind: SHADOW_OBSERVATION_KIND,
    withdrawable: false,
  };
}

/**
 * La regla entra explícita. Una observación inelegible guarda centavos en cero.
 */
export function evaluateShadowEligibility(
  evidence: ShadowChainEvidence,
  rule: ShadowRule,
): ShadowObservation {
  const commission = evidence.commission;
  if (!commission) return invalid('missing_commission', evidence, rule);
  if (commission.status === 'reversed') return invalid('reversed_commission', evidence, rule);
  if (commission.status === 'rejected') return invalid('rejected_commission', evidence, rule);

  const conversion = evidence.conversion;
  if (!conversion || conversion.id !== commission.conversionId) {
    return invalid('missing_conversion', evidence, rule);
  }
  if (conversion.attributionStatus === 'unresolved') return invalid('unresolved', evidence, rule);
  if (conversion.attributionStatus === 'unattributed') return invalid('unattributed', evidence, rule);

  const click = evidence.click;
  if (!click || click.id !== conversion.clickId) return invalid('missing_click', evidence, rule);

  const offer = evidence.offer;
  if (!offer || !conversion.offerId || click.offerId !== offer.id || conversion.offerId !== offer.id) {
    return invalid('invalid_chain', evidence, rule);
  }
  if (!offer.creatorUserId) return invalid('missing_creator', evidence, rule);

  if (evidence.actorType === 'MACHINE_HUNTER') return invalid('machine_actor', evidence, rule);
  if (evidence.actorType !== 'HUMAN') return invalid('system_actor', evidence, rule);

  if (!click.clickerUserId) return invalid('anonymous_click', evidence, rule);
  if (click.clickerUserId === offer.creatorUserId) return invalid('self_click', evidence, rule);
  if (evidence.membershipStatus !== 'enrolled') return invalid('not_enrolled', evidence, rule);
  if (!evidence.attributionMethod || !STRONG_METHODS.has(evidence.attributionMethod)) {
    return invalid('unattributed', evidence, rule);
  }

  const gross = commission.grossCommissionCents;
  if (!Number.isInteger(gross) || gross < 0) return invalid('invalid_chain', evidence, rule);
  const split = splitCommissionCents(gross, rule.creatorShareBps);
  if (split.creatorCents <= 0) return invalid('invalid_chain', evidence, rule);

  return {
    commissionId: commission.id,
    conversionId: conversion.id,
    clickId: click.id,
    offerId: offer.id,
    creatorUserId: offer.creatorUserId,
    ruleVersion: rule.version,
    creatorShareBps: rule.creatorShareBps,
    grossCommissionCents: gross,
    projectedCreatorCents: split.creatorCents,
    projectedPlatformCents: split.platformCents,
    eligibilityStatus: 'eligible',
    reason: 'eligible',
    observationKind: SHADOW_OBSERVATION_KIND,
    withdrawable: false,
  };
}

export function pinShadowRule(
  existing: { ruleVersion: string; creatorShareBps: number } | null,
  incoming: ShadowRule,
): ShadowRule {
  if (existing) {
    return { version: existing.ruleVersion, creatorShareBps: existing.creatorShareBps };
  }
  return { version: incoming.version, creatorShareBps: incoming.creatorShareBps };
}
