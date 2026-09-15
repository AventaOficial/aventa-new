/**
 * Contrato canónico de outbound click (no es un segundo analytics system).
 *
 * Fuentes de verdad:
 * - Volumen / CEO / CTR / EPC estimado → `offer_events` (event_type='outbound')
 * - Atribución Rewards (click_id / sub-id) → `reward_outbound_clicks`
 *
 * Ambos se escriben desde `POST /api/track-outbound`.
 * Si falta la tabla de rewards, el click de atribución puede ser null; el evento de volumen puede existir.
 * ESTIMATED (EPC × clicks) ≠ CONFIRMED revenue (ledger productivo).
 */

export const OUTBOUND_VOLUME_SOT = 'offer_events' as const;
export const OUTBOUND_ATTRIBUTION_SOT = 'reward_outbound_clicks' as const;
export const OUTBOUND_EVENT_TYPE = 'outbound' as const;

export type OutboundClickCanonicalFields = {
  offer_id: string;
  /** Usuario autenticado si hay Bearer; null = anónimo (no auto-rewardable). */
  user_id: string | null;
  /** Solo en tabla de atribución Rewards. */
  click_id: string | null;
  /** Timestamp server. */
  created_at?: string;
  source: 'track_outbound';
};

/** Campos que el CEO/EPC deben leer (volumen). */
export function isVolumeOutboundEvent(row: { event_type?: string | null }): boolean {
  return (row.event_type ?? '').toLowerCase() === OUTBOUND_EVENT_TYPE;
}

/**
 * Regla fail-closed de producto: sin click_id no hay atribución automática high-confidence.
 * El volumen (offer_events) puede existir igual.
 */
export function canAutoAttributeFromClick(clickId: string | null | undefined): boolean {
  return Boolean(clickId && String(clickId).trim());
}
