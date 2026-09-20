/**
 * CazaOfertasss — FASE 3.2. TrackingIdentity.
 *
 * Identifica de forma determinista el vínculo publicación ↔ tracking label
 * sin usar títulos ni proximidad temporal/producto.
 */

import { isValidTrackingLabel } from '../affiliate';
import type { AffiliateNetworkId, CazaResult, IsoTimestamp } from '../types';
import { failResult, okResult } from '../types';
import { TELEGRAM_CHANNEL_PATTERN } from './publication';

export type TrackingProviderId = AffiliateNetworkId;

/** Campaña opaca (slug). No es identidad primaria. */
export const TRACKING_CAMPAIGN_PATTERN = /^[a-z0-9_]{2,64}$/;
/** Experimento opcional. */
export const TRACKING_EXPERIMENT_PATTERN = /^[a-z0-9_]{2,64}$/;

/**
 * Identidad de tracking. Determinista.
 * No incluye título ni product id como identidad.
 */
export interface TrackingIdentity {
  readonly provider: TrackingProviderId;
  readonly trackingLabel: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly channel: string;
  readonly campaign: string;
  readonly experiment: string | null;
  /** Clave canónica estable (replay-safe). */
  readonly identityKey: string;
  readonly registeredAt: IsoTimestamp;
}

export interface BuildTrackingIdentityInput {
  readonly provider: TrackingProviderId;
  readonly trackingLabel: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly channel: string;
  readonly campaign: string;
  readonly experiment?: string | null;
  readonly registeredAt: IsoTimestamp;
}

/**
 * Clave determinista:
 * provider|trackingLabel|publicationId|revision|channel|campaign|experiment
 */
export function trackingIdentityKey(input: {
  readonly provider: TrackingProviderId;
  readonly trackingLabel: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly channel: string;
  readonly campaign: string;
  readonly experiment?: string | null;
}): string {
  const experiment = input.experiment ?? '';
  return [
    input.provider,
    input.trackingLabel,
    input.publicationId,
    String(input.publicationRevision),
    input.channel,
    input.campaign,
    experiment,
  ].join('|');
}

export function buildTrackingIdentity(
  input: BuildTrackingIdentityInput
): CazaResult<TrackingIdentity> {
  const reasons: string[] = [];

  if (input.provider !== 'amazon_associates_mx' && input.provider !== 'mercadolibre_affiliates') {
    reasons.push('tracking.provider_invalid');
  }
  if (!isValidTrackingLabel(input.trackingLabel)) {
    reasons.push('tracking.label_invalid');
  }
  if (typeof input.publicationId !== 'string' || input.publicationId.trim().length < 8) {
    reasons.push('tracking.publication_id_invalid');
  }
  if (
    typeof input.publicationRevision !== 'number' ||
    !Number.isInteger(input.publicationRevision) ||
    input.publicationRevision < 1
  ) {
    reasons.push('tracking.publication_revision_invalid');
  }
  if (!TELEGRAM_CHANNEL_PATTERN.test(input.channel)) {
    reasons.push('tracking.channel_invalid');
  }
  if (!TRACKING_CAMPAIGN_PATTERN.test(input.campaign)) {
    reasons.push('tracking.campaign_invalid');
  }
  if (
    input.experiment !== null &&
    input.experiment !== undefined &&
    !TRACKING_EXPERIMENT_PATTERN.test(input.experiment)
  ) {
    reasons.push('tracking.experiment_invalid');
  }
  if (!Number.isFinite(Date.parse(input.registeredAt))) {
    reasons.push('tracking.registered_at_invalid');
  }

  if (reasons.length > 0) return failResult(reasons);

  const experiment = input.experiment ?? null;
  const identityKey = trackingIdentityKey({
    provider: input.provider,
    trackingLabel: input.trackingLabel,
    publicationId: input.publicationId,
    publicationRevision: input.publicationRevision,
    channel: input.channel,
    campaign: input.campaign,
    experiment,
  });

  return okResult({
    provider: input.provider,
    trackingLabel: input.trackingLabel,
    publicationId: input.publicationId,
    publicationRevision: input.publicationRevision,
    channel: input.channel,
    campaign: input.campaign,
    experiment,
    identityKey,
    registeredAt: input.registeredAt,
  });
}
