/**
 * CazaOfertasss — FASE 4.1. Construcción y validación de un mapping.
 *
 * Compone identity.ts + affiliate.ts. No decide nada por su cuenta.
 */

import { z } from 'zod';

import {
  AFFILIATE_NETWORKS,
  affiliateUrlCarriesNetworkMarkers,
  buildTrackingLabel,
  isValidTrackingLabel,
  networkForStore,
  validateAffiliateAttachment,
} from '../affiliate';
import { AFFILIATE_MAPPING_STATUSES, CAZAOFERTAS_STORES } from '../constants';
import {
  buildDealIdentity,
  dealCandidateIdFromIdentity,
  normalizeProductUrl,
  stableHash,
} from '../identity';
import type { AffiliateNetworkId, CazaResult } from '../types';
import { failResult, okResult } from '../types';
import {
  externalProductIdSchema,
  externalUrlSchema,
  isoTimestampSchema,
  parseWithSchema,
} from '../validation';
import type { AffiliateMapping, AffiliateMappingDraft } from './types';

const NETWORK_IDS = Object.keys(AFFILIATE_NETWORKS) as [AffiliateNetworkId, ...AffiliateNetworkId[]];

export const affiliateMappingDraftSchema = z.object({
  store: z.enum(CAZAOFERTAS_STORES),
  externalProductId: externalProductIdSchema.nullable().optional(),
  canonicalUrl: externalUrlSchema,
  affiliateUrl: externalUrlSchema,
  network: z.enum(NETWORK_IDS).nullable().optional(),
  trackingLabel: z.string().trim().max(64).nullable().optional(),
  status: z.enum(AFFILIATE_MAPPING_STATUSES).nullable().optional(),
  validFrom: isoTimestampSchema.nullable().optional(),
  validUntil: isoTimestampSchema.nullable().optional(),
});

/** Patrones que jamás pueden vivir en un mapping (secretos). */
const SECRET_LIKE = [
  /\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/, // bot token
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/, // JWT
  /service_role/i,
];

function looksLikeSecret(value: string): boolean {
  return SECRET_LIKE.some((re) => re.test(value));
}

export function affiliateMappingIdFromIdentityKey(identityKey: string): string {
  return `caza_map_${stableHash(identityKey)}`;
}

/**
 * Deriva el tracking label interno de publicación para un mapping sin label
 * declarado. Estable por (deal, red, validFrom): no cambia entre ciclos.
 * Delegado a affiliate.ts (misma autoridad que FASE 0-4).
 */
export function deriveInternalTrackingLabel(
  dealId: string,
  network: AffiliateNetworkId,
  validFrom: string
): CazaResult<string> {
  return buildTrackingLabel(dealId, network, validFrom);
}

export interface BuildAffiliateMappingOptions {
  readonly now: Date;
  /** Preserva createdAt en updates. */
  readonly createdAt?: string | null;
}

export function buildAffiliateMapping(
  raw: AffiliateMappingDraft | unknown,
  options: BuildAffiliateMappingOptions
): CazaResult<AffiliateMapping> {
  const parsed = parseWithSchema(affiliateMappingDraftSchema, raw);
  if (!parsed.ok) return failResult(parsed.reasons.map((r) => `affiliate_mapping.${r}`));
  const draft = parsed.value;

  if (looksLikeSecret(draft.affiliateUrl) || looksLikeSecret(draft.canonicalUrl)) {
    return failResult(['affiliate_mapping.secret_like_content']);
  }
  if (draft.trackingLabel && looksLikeSecret(draft.trackingLabel)) {
    return failResult(['affiliate_mapping.secret_like_content']);
  }

  // Identidad: misma autoridad que el DealCandidate.
  const identity = buildDealIdentity({
    store: draft.store,
    url: draft.canonicalUrl,
    externalProductId: draft.externalProductId ?? null,
  });
  if (!identity.ok) return failResult(identity.reasons.map((r) => `affiliate_mapping.${r}`));

  const expectedNetwork = networkForStore(draft.store);
  const network = draft.network ?? expectedNetwork;
  if (network !== expectedNetwork) {
    return failResult([`affiliate_mapping.network_store_mismatch:${network}!=${expectedNetwork}`]);
  }

  if (!affiliateUrlCarriesNetworkMarkers(network, draft.affiliateUrl)) {
    return failResult([`affiliate_mapping.affiliate_url_missing_network_markers:${network}`]);
  }
  const affiliateNormalized = normalizeProductUrl(draft.affiliateUrl);
  if (!affiliateNormalized.ok) {
    return failResult(affiliateNormalized.reasons.map((r) => `affiliate_mapping.affiliate_${r}`));
  }
  const canonicalHost = normalizeProductUrl(identity.value.normalizedUrl);
  if (!canonicalHost.ok || affiliateNormalized.value.host !== canonicalHost.value.host) {
    return failResult(['affiliate_mapping.affiliate_host_mismatch']);
  }
  if (draft.affiliateUrl.trim() === identity.value.normalizedUrl) {
    return failResult(['affiliate_mapping.affiliate_url_equals_canonical']);
  }

  // Tracking label: si existe, se valida con las reglas existentes. Nunca se inventa.
  let trackingLabel: string | null = null;
  if (typeof draft.trackingLabel === 'string' && draft.trackingLabel.length > 0) {
    if (!isValidTrackingLabel(draft.trackingLabel)) {
      return failResult(['affiliate_mapping.tracking_label_invalid']);
    }
    trackingLabel = draft.trackingLabel;
  }

  const nowIso = options.now.toISOString();
  const validFrom = draft.validFrom ? new Date(Date.parse(draft.validFrom)).toISOString() : nowIso;
  const validUntil = draft.validUntil
    ? new Date(Date.parse(draft.validUntil)).toISOString()
    : null;
  if (validUntil !== null && Date.parse(validUntil) <= Date.parse(validFrom)) {
    return failResult(['affiliate_mapping.valid_until_not_after_valid_from']);
  }

  // Garantía: un mapping ACTIVE debe producir un attachment válido para el dominio.
  const probeDealId = dealCandidateIdFromIdentity(identity.value);
  let labelValue: string | null = trackingLabel;
  if (labelValue === null) {
    const derived = deriveInternalTrackingLabel(probeDealId, network, validFrom);
    if (!derived.ok) return failResult(derived.reasons.map((r) => `affiliate_mapping.${r}`));
    labelValue = derived.value;
  }
  const attachment = validateAffiliateAttachment({
    affiliateNetwork: network,
    affiliateUrl: draft.affiliateUrl.trim(),
    affiliateTrackingLabel: labelValue,
    affiliateGeneratedAt: validFrom,
    affiliateCredentialRef: AFFILIATE_NETWORKS[network].credentialEnvVar,
  });
  if (!attachment.ok) return failResult(attachment.reasons.map((r) => `affiliate_mapping.${r}`));

  const createdAt =
    options.createdAt && Number.isFinite(Date.parse(options.createdAt))
      ? new Date(Date.parse(options.createdAt)).toISOString()
      : nowIso;

  return okResult({
    id: affiliateMappingIdFromIdentityKey(identity.value.key),
    identityKey: identity.value.key,
    identityStrategy: identity.value.strategy,
    store: identity.value.store,
    externalProductId: identity.value.externalProductId,
    canonicalUrl: identity.value.normalizedUrl,
    affiliateUrl: draft.affiliateUrl.trim(),
    network,
    trackingLabel,
    status: draft.status ?? 'ACTIVE',
    validFrom,
    validUntil,
    createdAt,
    updatedAt: nowIso,
  });
}

/** Diferencia material entre dos mappings de la misma identidad. */
export function affiliateMappingMaterialFields(
  existing: AffiliateMapping,
  incoming: AffiliateMapping
): readonly string[] {
  const fields: (keyof AffiliateMapping)[] = [
    'affiliateUrl',
    'network',
    'trackingLabel',
    'status',
    'validFrom',
    'validUntil',
    'canonicalUrl',
  ];
  return fields.filter((f) => existing[f] !== incoming[f]);
}
