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
};

function hashSignal(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return createHash('sha256').update(value.trim()).digest('hex').slice(0, 32);
}

function isMissingClickTable(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes('reward_outbound_clicks') || msg.includes('does not exist');
}

export async function recordOutboundClick(
  supabase: SupabaseClient,
  input: {
    offerId: string;
    offerUrl: string;
    clickerUserId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<OutboundClickRecord | null> {
  const clickId = crypto.randomUUID();
  const network = detectNetworkFromUrl(input.offerUrl);
  const productFingerprint = offerUrlFingerprint(input.offerUrl);

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

  return { clickId, offerId: input.offerId, network, productFingerprint };
}

export function buildTrackedOfferUrl(
  offerUrl: string,
  tracking: OutboundTrackingContext,
): string {
  const tagged = applyPlatformAffiliateTags(offerUrl);
  return applyAdapterOutboundTracking(tagged, tracking);
}
