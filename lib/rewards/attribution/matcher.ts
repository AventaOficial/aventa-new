import type { SupabaseClient } from '@supabase/supabase-js';
import {
  REWARDS_CLICK_ATTRIBUTION_WINDOW_DAYS,
  type AttributionConfidence,
  type AttributionMethod,
} from '@/lib/rewards/config';
import {
  decodeAventaSubId,
  getAdapterById,
  type AffiliateNetworkId,
} from '@/lib/rewards/adapters/types';
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';
import { extractAmazonAsin, extractMercadoLibreItemId } from '@/lib/offers/offerUrlFingerprint';

export type LedgerAttributionInput = {
  id: string;
  network: AffiliateNetworkId;
  amount_cents: number;
  status: string;
  external_ref?: string | null;
  notes?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string | null;
  click_id?: string | null;
  offer_id?: string | null;
  creator_id?: string | null;
  /** Sub-id crudo del reporte (ascsubtag, etc.) */
  sub_id_raw?: string | null;
  /** URL o ASIN/MLM del producto vendido si viene en el reporte */
  product_hint?: string | null;
};

export type AttributionMatch = {
  offerId: string;
  creatorId: string;
  clickId: string | null;
  method: AttributionMethod;
  confidence: AttributionConfidence;
};

export type AttributionResult =
  | { matched: true; match: AttributionMatch }
  | { matched: false; reason: string; confidence: AttributionConfidence };

function commissionTimestamp(input: LedgerAttributionInput): number {
  const raw = input.created_at ?? new Date().toISOString();
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : Date.now();
}

function productFingerprintFromHint(network: AffiliateNetworkId, hint: string | null | undefined): string | null {
  if (!hint?.trim()) return null;
  const trimmed = hint.trim();
  if (trimmed.includes('://')) {
    return offerUrlFingerprint(trimmed);
  }
  if (network === 'amazon') {
    const asin = extractAmazonAsin(`https://amazon.com/dp/${trimmed}`) ?? trimmed.toUpperCase();
    return asin ? `amz:${asin}` : null;
  }
  if (network === 'mercadolibre') {
    const id = extractMercadoLibreItemId(`https://mercadolibre.com/${trimmed}`) ?? trimmed.toUpperCase();
    return id ? `ml:${id}` : null;
  }
  return null;
}

async function resolveOfferCreator(
  supabase: SupabaseClient,
  offerId: string,
): Promise<{ offerId: string; creatorId: string } | null> {
  const { data, error } = await supabase
    .from('offers')
    .select('id, created_by')
    .eq('id', offerId)
    .maybeSingle();
  if (error || !data) return null;
  const creatorId = (data as { created_by?: string }).created_by;
  if (!creatorId) return null;
  return { offerId, creatorId };
}

async function matchByClickId(
  supabase: SupabaseClient,
  clickId: string,
): Promise<{ offerId: string; creatorId: string } | null> {
  const { data: click, error } = await supabase
    .from('reward_outbound_clicks')
    .select('id, offer_id')
    .eq('id', clickId)
    .maybeSingle();
  if (error || !click) return null;
  const offerId = (click as { offer_id?: string }).offer_id;
  if (!offerId) return null;
  return resolveOfferCreator(supabase, offerId);
}

async function matchByProductClickWindow(
  supabase: SupabaseClient,
  network: AffiliateNetworkId,
  productFingerprint: string,
  commissionAtMs: number,
): Promise<{ offerId: string; creatorId: string; clickId: string } | null> {
  const windowMs = REWARDS_CLICK_ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const since = new Date(commissionAtMs - windowMs).toISOString();

  const { data: clicks, error } = await supabase
    .from('reward_outbound_clicks')
    .select('id, offer_id, created_at')
    .eq('network', network)
    .eq('product_fingerprint', productFingerprint)
    .gte('created_at', since)
    .lte('created_at', new Date(commissionAtMs).toISOString())
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !clicks?.length) return null;
  if (clicks.length !== 1) return null;

  const click = clicks[0] as { id: string; offer_id: string };
  const resolved = await resolveOfferCreator(supabase, click.offer_id);
  if (!resolved) return null;
  return { ...resolved, clickId: click.id };
}

/** Resuelve atribución venta → oferta → creador. Nunca inventa creador. */
export async function resolveCommissionAttribution(
  supabase: SupabaseClient,
  input: LedgerAttributionInput,
): Promise<AttributionResult> {
  if (input.status === 'void') {
    return { matched: false, reason: 'commission_void', confidence: 'none' };
  }

  const adapter = getAdapterById(input.network);

  // 1) SUB-ID / click_id explícito
  const subRaw =
    input.sub_id_raw ??
    (typeof input.meta?.ascsubtag === 'string' ? input.meta.ascsubtag : null) ??
    (typeof input.meta?.sub_id === 'string' ? input.meta.sub_id : null);

  let clickId = input.click_id ?? adapter.parseSubIdFromReport(subRaw);
  const decoded = decodeAventaSubId(subRaw ?? '');
  if (decoded?.clickId) clickId = decoded.clickId;

  if (clickId) {
    const byClick = await matchByClickId(supabase, clickId);
    if (byClick) {
      return {
        matched: true,
        match: {
          offerId: byClick.offerId,
          creatorId: byClick.creatorId,
          clickId,
          method: 'sub_id',
          confidence: 'high',
        },
      };
    }
  }

  // offer_id manual en ledger (staff) — creator_id debe coincidir con offers.created_by
  if (input.offer_id && input.creator_id) {
    const resolved = await resolveOfferCreator(supabase, input.offer_id);
    if (!resolved || resolved.creatorId !== input.creator_id) {
      return { matched: false, reason: 'creator_offer_mismatch', confidence: 'none' };
    }
    return {
      matched: true,
      match: {
        offerId: resolved.offerId,
        creatorId: resolved.creatorId,
        clickId: clickId ?? null,
        method: 'manual',
        confidence: 'high',
      },
    };
  }

  if (input.offer_id) {
    const resolved = await resolveOfferCreator(supabase, input.offer_id);
    if (resolved) {
      return {
        matched: true,
        match: {
          offerId: resolved.offerId,
          creatorId: resolved.creatorId,
          clickId: clickId ?? null,
          method: 'manual',
          confidence: 'high',
        },
      };
    }
  }

  // 2) Producto + ventana de clic (solo si un clic único)
  const productFp =
    productFingerprintFromHint(input.network, input.product_hint) ??
    productFingerprintFromHint(input.network, input.external_ref);

  if (productFp && adapter.capabilities.supportsProductFingerprint) {
    const productMatch = await matchByProductClickWindow(
      supabase,
      input.network,
      productFp,
      commissionTimestamp(input),
    );
    if (productMatch) {
      return {
        matched: true,
        match: {
          offerId: productMatch.offerId,
          creatorId: productMatch.creatorId,
          clickId: productMatch.clickId,
          method: 'product_click_window',
          confidence: 'medium',
        },
      };
    }
    if (productFp) {
      return { matched: false, reason: 'ambiguous_or_no_click', confidence: 'low' };
    }
  }

  return { matched: false, reason: 'no_evidence', confidence: 'none' };
}
