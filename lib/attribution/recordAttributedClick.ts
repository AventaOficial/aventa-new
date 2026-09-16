/**
 * Registro de click atribuido — foundation sobre reward_outbound_clicks.
 * Extiende clickTracking sin segundo SoT. No money writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { detectNetworkFromUrl } from '@/lib/rewards/adapters/types';
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';
import {
  actorKeyFromSignals,
  buildAttributionIdentityChain,
  buildClickIdempotencyKey,
  type AttributionIdentityChain,
} from './clickIdentity';
import { buildDestinationPair } from './destination';
import {
  resolveServerAttributionContext,
  type ClientAttributionHints,
} from './resolveContext';
import type { AttributionChannel } from './channels';

export type AttributedClickRecord = {
  clickId: string;
  offerId: string;
  network: string;
  productFingerprint: string | null;
  sourceOfferUrl: string;
  originalDestinationUrl: string | null;
  channel: AttributionChannel;
  campaignKey: string | null;
  idempotencyKey: string;
  reused: boolean;
  chain: AttributionIdentityChain;
};

function hashSignal(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return createHash('sha256').update(value.trim()).digest('hex').slice(0, 32);
}

function isMissingColumn(error: { message?: string } | null, column: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(column.toLowerCase()) && (msg.includes('column') || msg.includes('schema'));
}

function isMissingClickTable(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes('reward_outbound_clicks') || msg.includes('does not exist');
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return (error.message ?? '').toLowerCase().includes('duplicate');
}

/**
 * Registra click con identity + channel + destination separation + idempotency.
 * Fail-soft a columnas legacy si migración no aplicada.
 */
export async function recordAttributedClick(
  supabase: SupabaseClient,
  input: {
    offerId: string;
    clickerUserId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    hints?: ClientAttributionHints;
    nowMs?: number;
  },
): Promise<AttributedClickRecord | null> {
  const { data: offerRow, error: offerError } = await supabase
    .from('offers')
    .select('offer_url, original_offer_url, store')
    .eq('id', input.offerId)
    .maybeSingle();

  if (offerError) {
    console.error('[attribution/recordAttributedClick] offer lookup', offerError.message);
    return null;
  }

  const dbOfferUrl = String(
    (offerRow as { offer_url?: string | null } | null)?.offer_url ?? '',
  ).trim();
  if (!dbOfferUrl) return null;

  const originalOfferUrl =
    String((offerRow as { original_offer_url?: string | null } | null)?.original_offer_url ?? '').trim() ||
    null;

  const destinations = buildDestinationPair({
    offerUrl: dbOfferUrl,
    originalOfferUrl,
    detectNetwork: detectNetworkFromUrl,
  });

  const ctx = resolveServerAttributionContext(input.hints ?? {});
  const ipHash = hashSignal(input.ip);
  const uaHash = hashSignal(input.userAgent);
  const actorKey = actorKeyFromSignals({ userId: input.clickerUserId, ipHash });
  const idempotencyKey = buildClickIdempotencyKey({
    offerId: input.offerId,
    actorKey,
    nowMs: input.nowMs,
  });

  // Replay: si ya existe key en ventana → devolver click existente (idempotente).
  // Fail-soft: mocks legacy / tabla sin columna no bloquean el insert.
  try {
    const existing = await supabase
      .from('reward_outbound_clicks')
      .select(
        'id, offer_id, network, product_fingerprint, destination_url, original_destination_url, channel, campaign_key',
      )
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (!existing.error && existing.data?.id) {
      const row = existing.data as Record<string, unknown>;
      const clickId = String(row.id);
      const network = String(row.network ?? destinations.merchantNetwork ?? 'other');
      return {
        clickId,
        offerId: input.offerId,
        network,
        productFingerprint: (row.product_fingerprint as string | null) ?? null,
        sourceOfferUrl: dbOfferUrl,
        originalDestinationUrl:
          (row.original_destination_url as string | null) ?? destinations.originalDestination,
        channel: (row.channel as AttributionChannel) ?? ctx.channel,
        campaignKey: (row.campaign_key as string | null) ?? ctx.campaignKey,
        idempotencyKey,
        reused: true,
        chain: buildAttributionIdentityChain({
          offerId: input.offerId,
          clickId,
          merchantNetwork: network,
          campaignKey: (row.campaign_key as string | null) ?? ctx.campaignKey,
          channel: (row.channel as AttributionChannel) ?? ctx.channel,
          destinationUrl: (row.destination_url as string | null) ?? destinations.affiliateDestination,
          originalDestinationUrl:
            (row.original_destination_url as string | null) ?? destinations.originalDestination,
        }),
      };
    }
  } catch {
    // Mock incompleto o driver sin select encadenado — continuar a insert.
  }

  const clickId = crypto.randomUUID();
  const network = destinations.merchantNetwork ?? detectNetworkFromUrl(dbOfferUrl);
  const productFingerprint = offerUrlFingerprint(dbOfferUrl);

  const fullRow = {
    id: clickId,
    offer_id: input.offerId,
    network,
    product_fingerprint: productFingerprint,
    clicker_user_id: input.clickerUserId ?? null,
    ip_hash: ipHash,
    user_agent_hash: uaHash,
    channel: ctx.channel,
    campaign_key: ctx.campaignKey,
    destination_url: destinations.affiliateDestination,
    original_destination_url: destinations.originalDestination,
    idempotency_key: idempotencyKey,
    attribution_meta: {
      source: ctx.source,
      completeness: ctx.completeness,
      store: (offerRow as { store?: string | null } | null)?.store ?? null,
    },
  };

  let { error } = await supabase.from('reward_outbound_clicks').insert(fullRow);

  // Migración no aplicada: fallback legacy (sin columnas nuevas).
  if (error && (isMissingColumn(error, 'idempotency_key') || isMissingColumn(error, 'channel'))) {
    const legacy = {
      id: clickId,
      offer_id: input.offerId,
      network,
      product_fingerprint: productFingerprint,
      clicker_user_id: input.clickerUserId ?? null,
      ip_hash: ipHash,
      user_agent_hash: uaHash,
    };
    const legacyRes = await supabase.from('reward_outbound_clicks').insert(legacy);
    error = legacyRes.error;
  }

  if (error) {
    if (isMissingClickTable(error)) return null;
    if (isUniqueViolation(error)) {
      // Race: otro request ganó el UNIQUE — releer.
      try {
        const again = await supabase
          .from('reward_outbound_clicks')
          .select('id, network, product_fingerprint, channel, campaign_key, destination_url, original_destination_url')
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();
        if (again.data?.id) {
          const row = again.data as Record<string, unknown>;
          const existingId = String(row.id);
          return {
            clickId: existingId,
            offerId: input.offerId,
            network: String(row.network ?? network),
            productFingerprint: (row.product_fingerprint as string | null) ?? productFingerprint,
            sourceOfferUrl: dbOfferUrl,
            originalDestinationUrl:
              (row.original_destination_url as string | null) ?? destinations.originalDestination,
            channel: (row.channel as AttributionChannel) ?? ctx.channel,
            campaignKey: (row.campaign_key as string | null) ?? ctx.campaignKey,
            idempotencyKey,
            reused: true,
            chain: buildAttributionIdentityChain({
              offerId: input.offerId,
              clickId: existingId,
              merchantNetwork: String(row.network ?? network),
              campaignKey: (row.campaign_key as string | null) ?? ctx.campaignKey,
              channel: (row.channel as AttributionChannel) ?? ctx.channel,
              destinationUrl: (row.destination_url as string | null) ?? destinations.affiliateDestination,
              originalDestinationUrl:
                (row.original_destination_url as string | null) ?? destinations.originalDestination,
            }),
          };
        }
      } catch {
        // ignore
      }
    }
    console.error('[attribution/recordAttributedClick] insert', error.message);
    return null;
  }

  return {
    clickId,
    offerId: input.offerId,
    network,
    productFingerprint,
    sourceOfferUrl: dbOfferUrl,
    originalDestinationUrl: destinations.originalDestination,
    channel: ctx.channel,
    campaignKey: ctx.campaignKey,
    idempotencyKey,
    reused: false,
    chain: buildAttributionIdentityChain({
      offerId: input.offerId,
      clickId,
      merchantNetwork: network,
      campaignKey: ctx.campaignKey,
      channel: ctx.channel,
      destinationUrl: destinations.affiliateDestination,
      originalDestinationUrl: destinations.originalDestination,
    }),
  };
}
