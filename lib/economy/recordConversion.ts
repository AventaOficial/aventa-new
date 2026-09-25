/**
 * recordConversion — ingest server-side de conversiones de red.
 * Nunca inventa click. Nunca escribe ledger/rewards/payouts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveConversionAttributionStrict } from '@/lib/attribution/resolveConversionAttribution';
import { evaluateConversionAttributionFraudSignals } from '@/lib/attribution/fraudSignals';
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

export {
  resolveConversionAttribution,
  resolveConversionAttributionStrict,
} from '@/lib/attribution/resolveConversionAttribution';
export type {
  ConversionAttributionConflict,
  ConversionAttributionStrictResult,
} from '@/lib/attribution/resolveConversionAttribution';

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

  const attribution = await resolveConversionAttributionStrict(supabase, {
    clickId: input.clickId,
    offerId: input.offerId,
    conversionAt: occurredAt,
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
      isAuthenticatedClick: attribution.isAuthenticatedClick,
      fraudSignals: attribution.fraudSignals,
      conflicts: attribution.conflicts,
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
    const audit = await appendEconomicEvent(supabase, {
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
    if (!audit.ok) {
      // Fail-closed: do not leave money row without audit trail.
      await supabase.from('affiliate_conversions').delete().eq('id', data.id);
      console.error(
        '[economy/recordConversion] audit_append_failed — rolled back create',
        audit.error,
      );
      return null;
    }
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
      const reusedRow = again.data as Record<string, unknown>;
      const duplicateSignals = evaluateConversionAttributionFraudSignals({
        isDuplicateConversion: true,
        clickId: (reusedRow.click_id as string | null) ?? null,
      });
      if (duplicateSignals.length > 0) {
        const meta = (reusedRow.attribution_meta as Record<string, unknown> | null) ?? {};
        reusedRow.attribution_meta = {
          ...meta,
          duplicateIngestAttempt: true,
          fraudSignals: [
            ...new Set([
              ...((meta.fraudSignals as string[] | undefined) ?? []),
              ...duplicateSignals,
            ]),
          ],
        };
      }
      return mapRow(reusedRow, true);
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

  const audit = await appendEconomicEvent(supabase, {
    entityType: 'conversion',
    entityId: input.conversionId,
    eventType: 'status_transition',
    fromStatus: from,
    toStatus: input.toStatus,
    actor: input.actor ?? 'system',
    payload: { reason: input.reason ?? null },
  });
  if (!audit.ok) {
    return { ok: false, from, to: input.toStatus, error: 'audit_append_failed' };
  }

  return { ok: true, from, to: input.toStatus };
}
