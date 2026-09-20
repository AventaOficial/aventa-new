/**
 * CazaOfertasss — FASE 3. Identidad / idempotencia de revenue.
 */

import type { AffiliateRevenueProviderId, NormalizedRevenueEventType } from './types';

/** Sentinel de tracking cuando el reporte no trae identificador. Válido por patrón. */
export const REVENUE_UNKNOWN_TRACKING_LABEL = 'caza_unk_track' as const;

/**
 * Idempotencia lógica (contrato FASE 3):
 *   provider + externalReference + eventType
 */
export function revenueIdempotencyKey(input: {
  readonly provider: AffiliateRevenueProviderId;
  readonly externalReference: string;
  readonly eventType: NormalizedRevenueEventType;
}): string {
  return `${input.provider}:${input.eventType}:${input.externalReference}`;
}

/**
 * Cadena de tracking diseñada para atribución posterior:
 *   publicationIdentity → trackingLabel → provider report → revenue event
 *
 * Esta función NO resuelve atribución; sólo documenta/compone la etiqueta
 * canónica que CazaOfertasss embebe en links afiliados (ya existente).
 */
export function composeTrackingChainHint(input: {
  readonly publicationId: string;
  readonly trackingLabel: string;
  readonly provider: AffiliateRevenueProviderId;
  readonly externalReference: string | null;
}): Readonly<{
  publicationId: string;
  trackingLabel: string;
  provider: AffiliateRevenueProviderId;
  externalReference: string | null;
  chain: string;
}> {
  const external = input.externalReference ?? 'pending_external';
  return {
    publicationId: input.publicationId,
    trackingLabel: input.trackingLabel,
    provider: input.provider,
    externalReference: input.externalReference,
    chain: `${input.publicationId}>${input.trackingLabel}>${input.provider}>${external}`,
  };
}
