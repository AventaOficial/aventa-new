import { INTEREST_LIMITS } from '@/lib/interests/normalize';
import { matchInterestsToOffers, type InterestMatch, type MatchableOffer } from '@/lib/interests/match';
import type { NormalizedInterest } from '@/lib/interests/normalize';

export type DigestKind = 'daily' | 'weekly';

export function canIncludeInterestInDigest(input: { digestEnabled: boolean; interestNotify: boolean }): boolean {
  return input.digestEnabled === true && input.interestNotify === true;
}

export function deliveryKey(input: { kind: DigestKind; userId: string; offerId: string; windowKey: string }): string {
  return `${input.kind}:${input.userId}:${input.offerId}:${input.windowKey}`;
}

/** Una sola reserva gana. La segunda ejecución, aunque sea concurrente sobre el mismo conjunto, se omite. */
export function claimDeliveryKeys(reserved: Set<string>, keys: readonly string[]): { claimed: string[]; skipped: string[] } {
  const claimed: string[] = [];
  const skipped: string[] = [];
  for (const key of keys) {
    if (reserved.has(key)) {
      skipped.push(key);
      continue;
    }
    reserved.add(key);
    claimed.push(key);
  }
  return { claimed, skipped };
}

export function settleDeliveries(input: { reserved: readonly string[]; sent: boolean }): {
  markSent: string[];
  release: string[];
  feedBlocked: false;
} {
  if (input.sent) return { markSent: [...input.reserved], release: [], feedBlocked: false };
  return { markSent: [], release: [...input.reserved], feedBlocked: false };
}

/**
 * No existe una señal de oferta excepcional distinta del ranking que ya usan los digestos.
 * La alerta inmediata queda apagada: coincidir con un producto no basta para escribir un correo aparte.
 */
export function exceptionalInterestAlertsEnabled(): false {
  return false;
}

export function planExceptionalInterestAlerts(): never[] {
  return [];
}

export function selectDigestMatches(input: {
  interests: readonly NormalizedInterest[];
  offers: readonly MatchableOffer[];
  now: Date;
  limit?: number;
}): InterestMatch[] {
  const notifying = input.interests.filter((interest) => interest.notify);
  return matchInterestsToOffers(notifying, input.offers, input.now).slice(0, input.limit ?? INTEREST_LIMITS.personalPerDigest);
}
