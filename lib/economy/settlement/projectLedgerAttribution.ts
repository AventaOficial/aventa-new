/**
 * Settlement → ledger attribution projection.
 *
 * Single authority chain: commission → conversion → click/offer → offers.created_by.
 * Never invents attribution. Never runs Rewards matcher algorithms.
 * Uncertain / incomplete evidence → empty projection (attributable=false).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { encodeAventaSubId } from '@/lib/rewards/adapters/types';

export type LedgerAttributionProjection = {
  click_id: string | null;
  offer_id: string | null;
  creator_id: string | null;
  tracking_tag: string | null;
  attributable: boolean;
  attribution_method: 'sub_id' | null;
  attribution_confidence: 'high' | null;
  /** Diagnostic only — never written as monetary truth. */
  source: 'conversion_attributed' | 'conversion_unattributed' | 'conversion_incomplete';
};

export const EMPTY_LEDGER_ATTRIBUTION: LedgerAttributionProjection = {
  click_id: null,
  offer_id: null,
  creator_id: null,
  tracking_tag: null,
  attributable: false,
  attribution_method: null,
  attribution_confidence: null,
  source: 'conversion_unattributed',
};

type ConversionRow = {
  id: string;
  click_id: string | null;
  offer_id: string | null;
  attribution_status: string;
};

/**
 * Pure projection from already-loaded conversion + verified offer creator + optional click offer.
 * Fail-closed: any mismatch / missing creator → empty (not attributable).
 */
export function projectLedgerAttributionFromEvidence(input: {
  conversion: ConversionRow;
  /** offers.created_by for conversion.offer_id — null if offer missing. */
  offerCreatorId: string | null;
  /** reward_outbound_clicks.offer_id for conversion.click_id — null if click missing. */
  clickOfferId: string | null;
}): LedgerAttributionProjection {
  const { conversion, offerCreatorId, clickOfferId } = input;

  if (conversion.attribution_status !== 'attributed') {
    return { ...EMPTY_LEDGER_ATTRIBUTION, source: 'conversion_unattributed' };
  }

  const clickId = conversion.click_id?.trim() || null;
  const offerId = conversion.offer_id?.trim() || null;
  const creatorId = offerCreatorId?.trim() || null;
  const clickOffer = clickOfferId?.trim() || null;

  if (!clickId || !offerId || !creatorId || !clickOffer) {
    return { ...EMPTY_LEDGER_ATTRIBUTION, source: 'conversion_incomplete' };
  }

  // Click SoT wins: click must point at the same offer as the attributed conversion.
  if (clickOffer !== offerId) {
    return { ...EMPTY_LEDGER_ATTRIBUTION, source: 'conversion_incomplete' };
  }

  return {
    click_id: clickId,
    offer_id: offerId,
    creator_id: creatorId,
    tracking_tag: encodeAventaSubId(offerId, clickId),
    attributable: true,
    attribution_method: 'sub_id',
    attribution_confidence: 'high',
    source: 'conversion_attributed',
  };
}

export async function loadConversionForSettlement(
  supabase: SupabaseClient,
  conversionId: string,
): Promise<ConversionRow | null> {
  const { data, error } = await supabase
    .from('affiliate_conversions')
    .select('id, click_id, offer_id, attribution_status')
    .eq('id', conversionId)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data as ConversionRow;
}

async function loadOfferCreatorId(
  supabase: SupabaseClient,
  offerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('offers')
    .select('id, created_by')
    .eq('id', offerId)
    .maybeSingle();
  if (error || !data) return null;
  const creatorId = (data as { created_by?: string | null }).created_by;
  return creatorId?.trim() || null;
}

async function loadClickOfferId(
  supabase: SupabaseClient,
  clickId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('reward_outbound_clicks')
    .select('id, offer_id')
    .eq('id', clickId)
    .maybeSingle();
  if (error || !data) return null;
  const offerId = (data as { offer_id?: string | null }).offer_id;
  return offerId?.trim() || null;
}

/**
 * Resolve conversion and project verified ledger attribution fields.
 * Returns null conversion → caller must fail-closed (conversion_not_found).
 */
export async function resolveSettlementLedgerAttribution(
  supabase: SupabaseClient,
  conversionId: string,
): Promise<
  | { ok: false; reason: 'conversion_not_found' }
  | { ok: true; conversion: ConversionRow; attribution: LedgerAttributionProjection }
> {
  const conversion = await loadConversionForSettlement(supabase, conversionId);
  if (!conversion) {
    return { ok: false, reason: 'conversion_not_found' };
  }

  let offerCreatorId: string | null = null;
  let clickOfferId: string | null = null;

  if (conversion.offer_id) {
    offerCreatorId = await loadOfferCreatorId(supabase, conversion.offer_id);
  }
  if (conversion.click_id) {
    clickOfferId = await loadClickOfferId(supabase, conversion.click_id);
  }

  const attribution = projectLedgerAttributionFromEvidence({
    conversion,
    offerCreatorId,
    clickOfferId,
  });

  return { ok: true, conversion, attribution };
}
