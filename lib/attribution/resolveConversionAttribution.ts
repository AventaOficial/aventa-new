/**
 * Resolución de atribución conversión → click (SoT: reward_outbound_clicks).
 * Nunca inventa click. Click offer gana sobre client offerId.
 * Fail-closed en ambigüedad (ventana expirada, click ausente).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AttributionLinkStatus } from '@/lib/economy/types';
import { isClickWithinAttributionWindow } from './attributionWindow';
import {
  evaluateConversionAttributionFraudSignals,
  isAuthenticatedClickEvidence,
  type AttributionFraudSignal,
} from './fraudSignals';

export type ConversionAttributionConflict = {
  kind: 'conflicting_offer' | 'attribution_window_expired';
  clientOfferId: string | null;
  clickOfferId: string | null;
  clickCreatedAt: string | null;
  conversionAt: string | null;
};

export type ConversionAttributionStrictResult = {
  attributionStatus: AttributionLinkStatus;
  clickId: string | null;
  offerId: string | null;
  /** Solo desde fila click — nunca desde cliente. */
  clickerUserId: string | null;
  isAuthenticatedClick: boolean;
  fraudSignals: AttributionFraudSignal[];
  conflicts: ConversionAttributionConflict[];
};

const CLICK_SELECT = 'id, offer_id, clicker_user_id, created_at';

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

async function resolveOfferCreatorId(
  supabase: SupabaseClient,
  offerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('offers')
    .select('created_by')
    .eq('id', offerId)
    .maybeSingle();
  if (error || !data) return null;
  const creatorId = (data as { created_by?: string | null }).created_by;
  return trimOrNull(creatorId ?? null);
}

/**
 * Resolución estricta con evidencia de conflicto y señales de fraude.
 * `conversionAt` requerido cuando hay clickId (ventana de atribución).
 */
export async function resolveConversionAttributionStrict(
  supabase: SupabaseClient,
  input: {
    clickId?: string | null;
    offerId?: string | null;
    conversionAt?: string | Date | null;
    isDuplicateConversion?: boolean;
  },
): Promise<ConversionAttributionStrictResult> {
  const clientOfferId = trimOrNull(input.offerId);
  const clickId = trimOrNull(input.clickId);
  const conversionAt =
    input.conversionAt instanceof Date
      ? input.conversionAt.toISOString()
      : trimOrNull(input.conversionAt ?? null);

  const baseUnattributed: ConversionAttributionStrictResult = {
    attributionStatus: 'unattributed',
    clickId: null,
    offerId: clientOfferId,
    clickerUserId: null,
    isAuthenticatedClick: false,
    fraudSignals: evaluateConversionAttributionFraudSignals({
      clientOfferId,
      isDuplicateConversion: input.isDuplicateConversion,
    }),
    conflicts: [],
  };

  if (!clickId) {
    return baseUnattributed;
  }

  const { data, error } = await supabase
    .from('reward_outbound_clicks')
    .select(CLICK_SELECT)
    .eq('id', clickId)
    .maybeSingle();

  if (error || !data?.id) {
    return {
      attributionStatus: 'unresolved',
      clickId,
      offerId: clientOfferId,
      clickerUserId: null,
      isAuthenticatedClick: false,
      fraudSignals: evaluateConversionAttributionFraudSignals({
        clickId,
        clientOfferId,
        isDuplicateConversion: input.isDuplicateConversion,
      }),
      conflicts: [],
    };
  }

  const clickOfferId = trimOrNull((data as { offer_id?: string | null }).offer_id);
  const clickerUserId = trimOrNull((data as { clicker_user_id?: string | null }).clicker_user_id);
  const clickCreatedAt = trimOrNull((data as { created_at?: string | null }).created_at);
  const resolvedClickId = String(data.id);

  const conflicts: ConversionAttributionConflict[] = [];
  if (clientOfferId && clickOfferId && clientOfferId !== clickOfferId) {
    conflicts.push({
      kind: 'conflicting_offer',
      clientOfferId,
      clickOfferId,
      clickCreatedAt,
      conversionAt,
    });
  }

  const withinWindow =
    conversionAt != null
      ? isClickWithinAttributionWindow(clickCreatedAt, conversionAt)
      : isClickWithinAttributionWindow(clickCreatedAt, new Date().toISOString());

  if (!withinWindow) {
    conflicts.push({
      kind: 'attribution_window_expired',
      clientOfferId,
      clickOfferId,
      clickCreatedAt,
      conversionAt,
    });
    const creatorId = clickOfferId ? await resolveOfferCreatorId(supabase, clickOfferId) : null;
    return {
      attributionStatus: 'unresolved',
      clickId: resolvedClickId,
      offerId: clickOfferId ?? clientOfferId,
      clickerUserId,
      isAuthenticatedClick: isAuthenticatedClickEvidence(clickerUserId),
      fraudSignals: evaluateConversionAttributionFraudSignals({
        clickId: resolvedClickId,
        clickerUserId,
        creatorId,
        clientOfferId,
        clickOfferId,
        withinAttributionWindow: false,
        isDuplicateConversion: input.isDuplicateConversion,
      }),
      conflicts,
    };
  }

  const offerId = clickOfferId ?? clientOfferId;
  const creatorId = offerId ? await resolveOfferCreatorId(supabase, offerId) : null;

  return {
    attributionStatus: 'attributed',
    clickId: resolvedClickId,
    offerId,
    clickerUserId,
    isAuthenticatedClick: isAuthenticatedClickEvidence(clickerUserId),
    fraudSignals: evaluateConversionAttributionFraudSignals({
      clickId: resolvedClickId,
      clickerUserId,
      creatorId,
      clientOfferId,
      clickOfferId,
      withinAttributionWindow: true,
      isDuplicateConversion: input.isDuplicateConversion,
    }),
    conflicts,
  };
}

/** Compat economy — resultado reducido sin romper imports existentes. */
export async function resolveConversionAttribution(
  supabase: SupabaseClient,
  input: { clickId?: string | null; offerId?: string | null; conversionAt?: string | Date | null },
): Promise<{
  attributionStatus: AttributionLinkStatus;
  clickId: string | null;
  offerId: string | null;
}> {
  const strict = await resolveConversionAttributionStrict(supabase, input);
  return {
    attributionStatus: strict.attributionStatus,
    clickId: strict.clickId,
    offerId: strict.offerId,
  };
}
