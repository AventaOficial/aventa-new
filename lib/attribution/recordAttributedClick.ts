/**
 * Registro de click atribuido — foundation sobre reward_outbound_clicks.
 * Extiende clickTracking sin segundo SoT. No money writes.
 *
 * Contrato reused: la fila persistida es la única fuente de verdad.
 * Nunca rellenar channel/campaign/destination desde el request en colisión idempotente.
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
import { isAttributionChannel, type AttributionChannel } from './channels';

export type AttributedClickRecord = {
  clickId: string;
  offerId: string;
  network: string;
  productFingerprint: string | null;
  /** URL canónica de la oferta en `offers` (contexto). */
  sourceOfferUrl: string;
  /** Destino afiliado persistido (o resuelto en NEW). */
  destinationUrl: string | null;
  originalDestinationUrl: string | null;
  channel: AttributionChannel | null;
  campaignKey: string | null;
  idempotencyKey: string;
  reused: boolean;
  chain: AttributionIdentityChain;
};

const PERSISTED_CLICK_SELECT =
  'id, offer_id, network, product_fingerprint, destination_url, original_destination_url, channel, campaign_key';

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

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

function asNullableChannel(value: unknown): AttributionChannel | null {
  const raw = asNullableString(value);
  if (!raw) return null;
  return isAttributionChannel(raw) ? raw : null;
}

/**
 * Mapea fila DB → dominio canónico.
 * No acepta fallbacks de request: SoT = row.
 */
function canonicalFromPersistedRow(input: {
  row: Record<string, unknown>;
  offerId: string;
  sourceOfferUrl: string;
  idempotencyKey: string;
}): AttributedClickRecord {
  const clickId = String(input.row.id);
  const network = asNullableString(input.row.network) ?? 'other';
  const channel = asNullableChannel(input.row.channel);
  const campaignKey = asNullableString(input.row.campaign_key);
  const destinationUrl = asNullableString(input.row.destination_url);
  const originalDestinationUrl = asNullableString(input.row.original_destination_url);
  const productFingerprint = asNullableString(input.row.product_fingerprint);

  return {
    clickId,
    offerId: input.offerId,
    network,
    productFingerprint,
    sourceOfferUrl: input.sourceOfferUrl,
    destinationUrl,
    originalDestinationUrl,
    channel,
    campaignKey,
    idempotencyKey: input.idempotencyKey,
    reused: true,
    chain: buildAttributionIdentityChain({
      offerId: input.offerId,
      clickId,
      merchantNetwork: network,
      campaignKey,
      channel,
      destinationUrl,
      originalDestinationUrl,
    }),
  };
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

  // Hints solo aplican a NEW. En reuse se ignoran por completo para attribution fields.
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
      .select(PERSISTED_CLICK_SELECT)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (!existing.error && existing.data?.id) {
      return canonicalFromPersistedRow({
        row: existing.data as Record<string, unknown>,
        offerId: input.offerId,
        sourceOfferUrl: dbOfferUrl,
        idempotencyKey,
      });
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
      // Race: UNIQUE parcial ganó — releer canónico. Garantía: un solo registro.
      try {
        const again = await supabase
          .from('reward_outbound_clicks')
          .select(PERSISTED_CLICK_SELECT)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();
        if (again.data?.id) {
          return canonicalFromPersistedRow({
            row: again.data as Record<string, unknown>,
            offerId: input.offerId,
            sourceOfferUrl: dbOfferUrl,
            idempotencyKey,
          });
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
    destinationUrl: destinations.affiliateDestination,
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
