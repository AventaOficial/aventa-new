import type { DealQualification, DealQualificationReasonCode } from '@/lib/hunter/dealQualification/types';
import type { RetailerDiscoveryStatus } from './types';

export function evidenceYield(offerEvidenceCount: number, candidateCount: number): number {
  if (candidateCount <= 0) return 0;
  return Math.round((offerEvidenceCount / candidateCount) * 1000) / 1000;
}

export function isOfferEvidence(qualification: DealQualification | string): boolean {
  return qualification === 'VERIFIED_DEAL' || qualification === 'PROMOTION';
}

/**
 * Sugerencia de status. Nunca auto-READY:
 * READY exige canal sostenible + pilot + compliance, no un hit suelto.
 */
export function suggestSurfaceStatus(input: {
  robotsAllowed: boolean;
  challenged: boolean;
  timedOut: boolean;
  httpStatus: number | null;
  candidateCount: number;
  offerEvidenceCount: number;
  errorCode: string | null;
}): RetailerDiscoveryStatus {
  if (!input.robotsAllowed) return 'BLOCKED_PENDING_POLICY_REVIEW';
  if (input.errorCode === 'not_configured') return 'NOT_CONFIGURED';
  if (input.errorCode === 'disabled') return 'DISABLED';
  if (input.challenged || input.httpStatus === 401 || input.httpStatus === 403) return 'DEGRADED';
  if (input.httpStatus === 429) return 'DEGRADED';
  if (input.timedOut) return 'DEGRADED';
  if (input.candidateCount === 0) return 'DEGRADED';
  if (input.offerEvidenceCount === 0) return 'CATALOG_ONLY';
  return 'DEGRADED';
}

export function isInvalidPriceReason(reasons: Array<DealQualificationReasonCode | string>): boolean {
  return reasons.includes('invalid_price_evidence');
}

/**
 * Veredicto de CANAL, no de un PDP suelto.
 * READY nunca se asigna aquí.
 */
export function classifyDiscoveryChannel(input: {
  robotsAllowed: boolean;
  challenged: boolean;
  pdpInspected: number;
  offerEvidenceCount: number;
  catalogOnly: number;
  sustainable: boolean;
}): import('./types').DiscoveryChannelVerdict {
  if (!input.robotsAllowed) return 'BLOCKED_PENDING_POLICY_REVIEW';
  if (input.challenged) return 'DEGRADED';
  if (input.offerEvidenceCount > 0) return 'PROMISING';
  if (input.pdpInspected > 0 && input.catalogOnly === input.pdpInspected) return 'CATALOG_ONLY';
  if (input.pdpInspected === 0) return 'DEGRADED';
  if (!input.sustainable) return 'NO_SUSTAINABLE_DISCOVERY_CHANNEL';
  return 'DEGRADED';
}
