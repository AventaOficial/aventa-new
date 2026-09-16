/**
 * recordConversion — ingest server-side de conversiones de red.
 * Nunca inventa click. Nunca escribe ledger/rewards/payouts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { appendEconomicEvent } from './appendEconomicEvent';
import {
  canTransitionConversion,
  isAffiliateNetwork,
  isEconomicIngestSource,
  type AffiliateNetwork,
  type AttributionLinkStatus,
  type ConversionStatus,
  type EconomicIngestSource,
} from './types';

export type ConversionRecord = {
  conversionId: string;
  externalConversionId: string;
  source: EconomicIngestSource;
  network: AffiliateNetwork;
  clickId: string | null;
  offerId: string | null;
  attributionStatus: AttributionLinkStatus;
  status: ConversionStatus;
  occurredAt: string;
  reused: boolean;
};

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return (error.message ?? '').toLowerCase().includes('duplicate');
}

function mapRow(row: Record<string, unknown>, reused: boolean): ConversionRecord {
  return {
    conversionId: String(row.id),
    externalConversionId: String(row.external_conversion_id),
    source: row.source as EconomicIngestSource,
    network: row.network as AffiliateNetwork,
    clickId: (row.click_id as string | null) ?? null,
    offerId: (row.offer_id as string | null) ?? null,
    attributionStatus: row.attribution_status as AttributionLinkStatus,
    status: row.status as ConversionStatus,
    occurredAt: String(row.occurred_at),
    reused,
  };
}

/**
 * Resuelve attribution sin inventar click.
 * - sin clickId → unattributed
 * - clickId presente pero no en DB → unresolved
 * - clickId válido → attributed (+ offer_id desde click si falta)
 */
export async function resolveConversionAttribution(
  supabase: SupabaseClient,
  input: { clickId?: string | null; offerId?: string | null },
): Promise<{
  attributionStatus: AttributionLinkStatus;
  clickId: string | null;
  offerId: string | null;
}> {
  const clickId = input.clickId?.trim() || null;
  if (!clickId) {
    return {
      attributionStatus: 'unattributed',
      clickId: null,
      offerId: input.offerId?.trim() || null,
    };
  }

  const { data, error } = await supabase
    .from('reward_outbound_clicks')
    .select('id, offer_id')
    .eq('id', clickId)
    .maybeSingle();

  if (error || !data?.id) {
    return {
      attributionStatus: 'unresolved',
      clickId,
      offerId: input.offerId?.trim() || null,
    };
  }

  const offerFromClick =
    typeof data.offer_id === 'string' && data.offer_id.trim() ? data.offer_id.trim() : null;

  return {
    attributionStatus: 'attributed',
    clickId: String(data.id),
    offerId: input.offerId?.trim() || offerFromClick,
  };
}

export async function recordConversion(
  supabase: SupabaseClient,
  input: {
    source: EconomicIngestSource;
    network: AffiliateNetwork;
    externalConversionId: string;
    occurredAt: string | Date;
    clickId?: string | null;
    offerId?: string | null;
    status?: ConversionStatus;
    orderAmountCents?: number | null;
    currency?: string | null;
    rawReference?: Record<string, unknown>;
    actor?: string;
  },
): Promise<ConversionRecord | null> {
  if (!isEconomicIngestSource(input.source) || !isAffiliateNetwork(input.network)) {
    return null;
  }
  const externalConversionId = input.externalConversionId.trim();
  if (!externalConversionId) return null;

  const occurredAt =
    typeof input.occurredAt === 'string'
      ? input.occurredAt
      : input.occurredAt.toISOString();

  const attribution = await resolveConversionAttribution(supabase, {
    clickId: input.clickId,
    offerId: input.offerId,
  });

  const status: ConversionStatus = input.status ?? 'received';
  const row = {
    source: input.source,
    network: input.network,
    external_conversion_id: externalConversionId,
    click_id: attribution.clickId,
    offer_id: attribution.offerId,
    attribution_status: attribution.attributionStatus,
    status,
    occurred_at: occurredAt,
    order_amount_cents:
      typeof input.orderAmountCents === 'number' && input.orderAmountCents >= 0
        ? Math.floor(input.orderAmountCents)
        : null,
    currency: input.currency?.trim() || null,
    raw_reference: input.rawReference ?? {},
    attribution_meta: {
      resolvedAt: new Date().toISOString(),
      attributionStatus: attribution.attributionStatus,
    },
  };

  const { data, error } = await supabase
    .from('affiliate_conversions')
    .insert(row)
    .select(
      'id, source, network, external_conversion_id, click_id, offer_id, attribution_status, status, occurred_at',
    )
    .maybeSingle();

  if (!error && data?.id) {
    await appendEconomicEvent(supabase, {
      entityType: 'conversion',
      entityId: String(data.id),
      eventType: 'created',
      toStatus: status,
      actor: input.actor ?? 'system',
      payload: {
        source: input.source,
        network: input.network,
        externalConversionId,
        attributionStatus: attribution.attributionStatus,
      },
    });
    return mapRow(data as Record<string, unknown>, false);
  }

  if (isUniqueViolation(error)) {
    const again = await supabase
      .from('affiliate_conversions')
      .select(
        'id, source, network, external_conversion_id, click_id, offer_id, attribution_status, status, occurred_at',
      )
      .eq('source', input.source)
      .eq('network', input.network)
      .eq('external_conversion_id', externalConversionId)
      .maybeSingle();
    if (again.data?.id) {
      return mapRow(again.data as Record<string, unknown>, true);
    }
  }

  if (error) {
    console.error('[economy/recordConversion]', error.message);
  }
  return null;
}

export async function transitionConversionStatus(
  supabase: SupabaseClient,
  input: {
    conversionId: string;
    toStatus: ConversionStatus;
    actor?: string;
    reason?: string;
  },
): Promise<{ ok: boolean; from?: ConversionStatus; to?: ConversionStatus; error?: string }> {
  const { data: existing, error } = await supabase
    .from('affiliate_conversions')
    .select('id, status')
    .eq('id', input.conversionId)
    .maybeSingle();
  if (error || !existing?.id) {
    return { ok: false, error: 'conversion_not_found' };
  }
  const from = existing.status as ConversionStatus;
  if (!canTransitionConversion(from, input.toStatus)) {
    return { ok: false, from, to: input.toStatus, error: 'invalid_transition' };
  }

  const { error: upErr } = await supabase
    .from('affiliate_conversions')
    .update({ status: input.toStatus, updated_at: new Date().toISOString() })
    .eq('id', input.conversionId)
    .eq('status', from);

  if (upErr) {
    return { ok: false, from, to: input.toStatus, error: upErr.message };
  }

  await appendEconomicEvent(supabase, {
    entityType: 'conversion',
    entityId: input.conversionId,
    eventType: 'status_transition',
    fromStatus: from,
    toStatus: input.toStatus,
    actor: input.actor ?? 'system',
    payload: { reason: input.reason ?? null },
  });

  return { ok: true, from, to: input.toStatus };
}
