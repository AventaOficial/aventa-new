import type { HumanOutcome, MatchConfidence } from './types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(raw: string | null | undefined): boolean {
  return typeof raw === 'string' && UUID_RE.test(raw.trim());
}

/**
 * Identidad para correlacionar shadow ↔ humano.
 * Preferir UNKNOWN / unmatched antes que un match inventado.
 */
export function resolveCorrelationIdentity(input: {
  offerId?: string | null;
  fingerprint?: string | null;
  rowsWithSameOfferId: number;
  rowsWithSameFingerprint: number;
  offersWithSameFingerprint?: number;
}): { matchConfidence: MatchConfidence; reason: string } {
  const offerId = input.offerId?.trim() || null;
  const fingerprint = input.fingerprint?.trim() || null;
  const offers = input.offersWithSameFingerprint ?? 0;

  if (offerId && input.rowsWithSameOfferId > 1) {
    return { matchConfidence: 'ambiguous', reason: 'duplicate_offer_id_rows' };
  }
  if (offerId && input.rowsWithSameOfferId === 1) {
    return { matchConfidence: 'offer_id', reason: 'unique_offer_id' };
  }

  if (fingerprint && (input.rowsWithSameFingerprint > 1 || offers > 1)) {
    return { matchConfidence: 'ambiguous', reason: 'shared_fingerprint' };
  }
  if (fingerprint && input.rowsWithSameFingerprint === 1 && offers === 1) {
    return { matchConfidence: 'fingerprint_unique', reason: 'unique_fingerprint' };
  }

  return { matchConfidence: 'unmatched', reason: 'no_reliable_identity' };
}

const TERMINAL: ReadonlySet<HumanOutcome> = new Set([
  'HUMAN_APPROVED',
  'HUMAN_REJECTED',
  'HUMAN_EXPIRED',
]);

/**
 * El outcome humano terminal no se sobrescribe.
 * Snooze puede avanzar a approve/reject/expired.
 */
export function canApplyHumanOutcome(current: HumanOutcome, next: HumanOutcome): boolean {
  if (current === next) return true;
  if (TERMINAL.has(current)) return false;
  if (current === 'HUMAN_SNOOZED') {
    return (
      next === 'HUMAN_APPROVED' ||
      next === 'HUMAN_REJECTED' ||
      next === 'HUMAN_EXPIRED' ||
      next === 'UNKNOWN'
    );
  }
  return current === 'UNKNOWN' || current === 'HUMAN_PENDING';
}

export function isQualityHumanOutcome(outcome: HumanOutcome): boolean {
  return outcome === 'HUMAN_APPROVED' || outcome === 'HUMAN_REJECTED';
}

export function sourceFamilyForCalibration(
  sourceId: string,
  sourceDetail?: string | null,
): string {
  const id = sourceId.trim();
  const detail = (sourceDetail ?? '').toLowerCase();
  if (id === 'community' || detail.includes('community')) return 'community';
  if (id === 'ml_worker') return 'external_worker';
  if (id === 'ml_api' || id === 'ml_api_legacy') return 'official_api';
  if (id.startsWith('amazon')) return 'official_api';
  if (
    id.includes('chedraui') ||
    id.includes('walmart') ||
    id.includes('bodega') ||
    id.includes('homedepot') ||
    id.includes('soriana')
  ) {
    return 'retailer_public';
  }
  if (id === 'affiliate_feed') return 'affiliate_feed';
  if (id === 'partner') return 'partner';
  return 'core';
}

export function mapModerationActionToHumanOutcome(
  action: string | null | undefined,
): HumanOutcome | null {
  const value = (action ?? '').trim().toLowerCase();
  if (value === 'approved') return 'HUMAN_APPROVED';
  if (value === 'rejected') return 'HUMAN_REJECTED';
  if (value === 'snoozed' || value === 'snooze') return 'HUMAN_SNOOZED';
  if (value === 'expired') return 'HUMAN_EXPIRED';
  return null;
}
