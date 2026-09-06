import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyPlatformAffiliateTags } from '@/lib/affiliate/applyPlatformAffiliateTags';
import {
  applyAdapterOutboundTracking,
  detectNetworkFromUrl,
  type OutboundTrackingContext,
} from '@/lib/rewards/adapters/types';
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';

export type OutboundClickRecord = {
  clickId: string;
  offerId: string;
  network: string;
  productFingerprint: string | null;
  /** URL canónica usada (offers.offer_url). */
  sourceOfferUrl: string;
};

function hashSignal(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return createHash('sha256').update(value.trim()).digest('hex').slice(0, 32);
}

function isMissingClickTable(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes('reward_outbound_clicks') || msg.includes('does not exist');
}

/**
 * Registra clic saliente para atribución Rewards.
 * P0-3: network + product_fingerprint salen exclusivamente de offers.offer_url.
 * `clientOfferUrl` se ignora para persistencia (compat UI).
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
  const { data: offerRow, error: offerError } = await supabase
    .from('offers')
    .select('offer_url')
    .eq('id', input.offerId)
    .maybeSingle();

  if (offerError) {
    console.error('[rewards/clickTracking] offer lookup', offerError.message);
    return null;
  }

  const dbOfferUrl = String(
    (offerRow as { offer_url?: string | null } | null)?.offer_url ?? '',
  ).trim();
  if (!dbOfferUrl) {
    // Sin URL canónica: no crear click de rewards (no fallback a URL cliente).
    return null;
  }

  const clickId = crypto.randomUUID();
  const network = detectNetworkFromUrl(dbOfferUrl);
  const productFingerprint = offerUrlFingerprint(dbOfferUrl);

  const { error } = await supabase.from('reward_outbound_clicks').insert({
    id: clickId,
    offer_id: input.offerId,
    network,
    product_fingerprint: productFingerprint,
    clicker_user_id: input.clickerUserId ?? null,
    ip_hash: hashSignal(input.ip),
    user_agent_hash: hashSignal(input.userAgent),
  });

  if (error) {
    if (isMissingClickTable(error)) return null;
    console.error('[rewards/clickTracking] insert', error.message);
    return null;
  }

  return {
    clickId,
    offerId: input.offerId,
    network,
    productFingerprint,
    sourceOfferUrl: dbOfferUrl,
  };
}

export function buildTrackedOfferUrl(
  offerUrl: string,
  tracking: OutboundTrackingContext,
): string {
  const tagged = applyPlatformAffiliateTags(offerUrl);
  return applyAdapterOutboundTracking(tagged, tracking);
}
