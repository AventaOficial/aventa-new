import type { SupabaseClient } from '@supabase/supabase-js';
import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';
import {
  applyAdapterOutboundTracking,
  type OutboundTrackingContext,
} from '@/lib/rewards/adapters/types';

export type OutboundClickRecord = {
  clickId: string;
  offerId: string;
  network: string;
  productFingerprint: string | null;
  /** URL canónica usada (offers.offer_url). */
  sourceOfferUrl: string;
};

/**
 * Registra clic saliente para atribución Rewards.
 * P0-3: network + product_fingerprint salen exclusivamente de offers.offer_url.
 * `clientOfferUrl` se ignora para persistencia (compat UI).
 *
 * Preferir `recordAttributedClick` (Attribution Foundation) para channel/idempotency.
 * Este wrapper mantiene compat tests/callers legacy.
 */
export async function recordOutboundClick(
  supabase: SupabaseClient,
  input: {
    offerId: string;
    /** @deprecated Ignorado para fingerprint/network; no usar como SoT. */
    clientOfferUrl?: string | null;
    clickerUserId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<OutboundClickRecord | null> {
  const { recordAttributedClick } = await import('@/lib/attribution/recordAttributedClick');
  const attributed = await recordAttributedClick(supabase, {
    offerId: input.offerId,
    clickerUserId: input.clickerUserId,
    ip: input.ip,
    userAgent: input.userAgent,
  });
  if (!attributed) return null;
  return {
    clickId: attributed.clickId,
    offerId: attributed.offerId,
    network: attributed.network,
    productFingerprint: attributed.productFingerprint,
    sourceOfferUrl: attributed.sourceOfferUrl,
  };
}

export function buildTrackedOfferUrl(
  offerUrl: string,
  tracking: OutboundTrackingContext,
): string {
  const tagged = applyPlatformAffiliateTags(offerUrl);
  return applyAdapterOutboundTracking(tagged, tracking);
}
