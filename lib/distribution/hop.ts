import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { recordAttributedClick } from '@/lib/attribution/recordAttributedClick';
import { isValidUuid } from '@/lib/server/validateUuid';
import { appendDistributionEvent } from './events';
import { assertSafeRedirectUrl } from './security/urls';
import { buildDistributionTrackingContext } from './trackingContext';

export type DistributionHopResult =
  | { ok: true; redirectUrl: string; offerId: string; publicationId: string; clickId: string | null }
  | { ok: false; status: number; error: string };

/**
 * Server-authoritative CTA hop for Distribution.
 * Reuses recordAttributedClick — no second attribution SoT.
 * Destination URL always from offers.offer_url (never client-supplied).
 */
export async function resolveDistributionHop(input: {
  publicationId: string;
  supabase?: SupabaseClient;
  ip?: string | null;
  userAgent?: string | null;
  clickerUserId?: string | null;
  nowMs?: number;
}): Promise<DistributionHopResult> {
  const publicationId = input.publicationId.trim();
  if (!isValidUuid(publicationId)) {
    return { ok: false, status: 400, error: 'invalid_publication_id' };
  }

  const supabase = input.supabase ?? createServerClient();
  const nowMs = input.nowMs ?? Date.now();

  const { data: pub, error: pubErr } = await supabase
    .from('distribution_publications')
    .select(
      'id, offer_id, destination_id, provider, status, tracking_campaign_key, published_at',
    )
    .eq('id', publicationId)
    .maybeSingle();

  if (pubErr || !pub) {
    return { ok: false, status: 404, error: 'publication_not_found' };
  }

  const status = String(pub.status ?? '');
  if (status === 'cancelled' || status === 'failed') {
    return { ok: false, status: 410, error: 'publication_inactive' };
  }
  // Allow published (primary) and publishing/pending only if message already had CTA
  // (pending CTA before send is unusual — still require offer live).
  if (!['published', 'publishing', 'pending', 'retryable'].includes(status)) {
    return { ok: false, status: 410, error: 'publication_inactive' };
  }

  const { data: offer, error: offerErr } = await supabase
    .from('offers')
    .select('id, status, expires_at, offer_url')
    .eq('id', pub.offer_id)
    .maybeSingle();

  if (offerErr || !offer) {
    return { ok: false, status: 404, error: 'offer_not_found' };
  }

  const offerStatus = String(offer.status ?? '').toLowerCase();
  if (offerStatus !== 'approved' && offerStatus !== 'published') {
    return { ok: false, status: 410, error: 'offer_not_live' };
  }
  if (offer.expires_at) {
    const exp = Date.parse(String(offer.expires_at));
    if (Number.isFinite(exp) && exp < nowMs) {
      return { ok: false, status: 410, error: 'offer_expired' };
    }
  }

  const redirectCheck = assertSafeRedirectUrl(offer.offer_url);
  if (!redirectCheck.ok) {
    return { ok: false, status: 422, error: `unsafe_offer_url:${redirectCheck.reason}` };
  }

  const campaignKey =
    (typeof pub.tracking_campaign_key === 'string' && pub.tracking_campaign_key.trim()) ||
    null;

  const click = await recordAttributedClick(supabase, {
    offerId: String(pub.offer_id),
    clickerUserId: input.clickerUserId ?? null,
    ip: input.ip,
    userAgent: input.userAgent,
    nowMs,
    hints: {
      channel: 'telegram',
      campaign: campaignKey,
      utmSource: 'telegram',
    },
  });

  // Tracking context for observability only — does not fork attribution
  const _ctx = buildDistributionTrackingContext({
    publicationId: String(pub.id),
    offerId: String(pub.offer_id),
    destinationId: String(pub.destination_id),
    provider: (pub.provider as 'telegram') ?? 'telegram',
    campaignKey,
  });
  void _ctx;

  await appendDistributionEvent(supabase, {
    publicationId: String(pub.id),
    eventType: 'publication_attempted',
    meta: {
      phase: 'cta_hop',
      click_id: click?.clickId ?? null,
      campaign_key: campaignKey,
    },
  });

  return {
    ok: true,
    redirectUrl: redirectCheck.url,
    offerId: String(pub.offer_id),
    publicationId: String(pub.id),
    clickId: click?.clickId ?? null,
  };
}
