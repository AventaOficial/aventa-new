/**
 * CazaOfertasss — FASE 4.1. AffiliateAttachmentResolver respaldado por mappings operados.
 *
 * lookup(candidate) → FOUND | NOT_FOUND | EXPIRED | DISABLED | AMBIGUOUS
 *
 * Reglas:
 *   - Nunca inventa affiliate URLs. Sin mapping ⇒ NOT_FOUND (fail-closed).
 *   - No toca scoring ni evidence: sólo devuelve (o no) un AffiliateAttachment.
 *   - Lookup puntual por identidad primaria (store+pid) y fallback (URL). Nunca scan.
 *   - El attachment resultante pasa por `validateAffiliateAttachment` (affiliate.ts).
 */

import { AFFILIATE_NETWORKS, validateAffiliateAttachment } from '../affiliate';
import { AFFILIATE_MAPPING_LOOKUP_MAX_KEYS } from '../constants';
import { canonicalUrlIdentityKey } from '../identity';
import type { AffiliateAttachmentResolver, AffiliateResolveInput } from '../orchestration/affiliateResolver';
import type { AffiliateAttachment, CazaResult, DealCandidate } from '../types';
import { failResult, okResult } from '../types';
import { deriveInternalTrackingLabel } from './mapping';
import type {
  AffiliateMapping,
  AffiliateMappingLookupResult,
  AffiliateMappingRepository,
} from './types';

export interface AffiliateMappingResolver extends AffiliateAttachmentResolver {
  lookup(input: AffiliateResolveInput | DealCandidate): Promise<AffiliateMappingLookupResult>;
}

function isCandidate(input: AffiliateResolveInput | DealCandidate): input is DealCandidate {
  return 'id' in input && 'evidence' in input && 'score' in input;
}

function toResolveInput(input: AffiliateResolveInput | DealCandidate, now: Date): AffiliateResolveInput {
  if (isCandidate(input)) {
    return {
      identity: input.identity,
      dealId: input.id,
      canonicalUrl: input.canonicalUrl,
      now: now.toISOString(),
    };
  }
  return input;
}

/** Claves a consultar: identidad del candidato + fallback por URL cuando la primaria es pid. */
export function affiliateMappingLookupKeys(input: AffiliateResolveInput): readonly string[] {
  const keys = [input.identity.key];
  if (input.identity.strategy === 'external_product_id') {
    keys.push(canonicalUrlIdentityKey(input.identity.store, input.identity.normalizedUrl));
  }
  return keys.slice(0, AFFILIATE_MAPPING_LOOKUP_MAX_KEYS);
}

function result(
  outcome: AffiliateMappingLookupResult['outcome'],
  mapping: AffiliateMapping | null,
  reasons: readonly string[],
  attachment: AffiliateAttachment | null = null,
  trackingLabelSource: AffiliateMappingLookupResult['trackingLabelSource'] = null
): AffiliateMappingLookupResult {
  return { outcome, mapping, attachment, trackingLabelSource, reasons };
}

export function evaluateAffiliateMappingLookup(
  input: AffiliateResolveInput,
  mappings: readonly AffiliateMapping[]
): AffiliateMappingLookupResult {
  if (mappings.length === 0) {
    return result('NOT_FOUND', null, ['affiliate_mapping.not_found']);
  }
  if (mappings.length > 1) {
    return result('AMBIGUOUS', null, [
      `affiliate_mapping.multiple_matches:${mappings.length}`,
    ]);
  }
  const mapping = mappings[0];

  // Conflictos de identidad ⇒ AMBIGUOUS (no se sobreescribe identidad en silencio).
  if (mapping.store !== input.identity.store) {
    return result('AMBIGUOUS', mapping, ['affiliate_mapping.store_mismatch']);
  }
  if (
    input.identity.strategy === 'external_product_id' &&
    mapping.externalProductId !== null &&
    mapping.externalProductId !== input.identity.externalProductId
  ) {
    return result('AMBIGUOUS', mapping, ['affiliate_mapping.external_product_id_conflict']);
  }
  if (mapping.canonicalUrl !== input.identity.normalizedUrl) {
    return result('AMBIGUOUS', mapping, ['affiliate_mapping.canonical_url_conflict']);
  }

  if (mapping.status === 'DISABLED') {
    return result('DISABLED', mapping, ['affiliate_mapping.disabled']);
  }
  if (mapping.status === 'EXPIRED') {
    return result('EXPIRED', mapping, ['affiliate_mapping.expired']);
  }

  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) {
    return result('NOT_FOUND', mapping, ['affiliate_mapping.now_invalid']);
  }
  if (Date.parse(mapping.validFrom) > nowMs) {
    return result('EXPIRED', mapping, ['affiliate_mapping.not_yet_valid']);
  }
  if (mapping.validUntil !== null && Date.parse(mapping.validUntil) <= nowMs) {
    return result('EXPIRED', mapping, ['affiliate_mapping.valid_until_passed']);
  }

  let label = mapping.trackingLabel;
  let labelSource: AffiliateMappingLookupResult['trackingLabelSource'] = 'mapping';
  if (label === null) {
    const derived = deriveInternalTrackingLabel(input.dealId, mapping.network, mapping.validFrom);
    if (!derived.ok) {
      return result('NOT_FOUND', mapping, derived.reasons.map((r) => `affiliate_mapping.${r}`));
    }
    label = derived.value;
    labelSource = 'derived_internal';
  }

  const attachment = validateAffiliateAttachment({
    affiliateNetwork: mapping.network,
    affiliateUrl: mapping.affiliateUrl,
    affiliateTrackingLabel: label,
    affiliateGeneratedAt: mapping.validFrom,
    affiliateCredentialRef: AFFILIATE_NETWORKS[mapping.network].credentialEnvVar,
  });
  if (!attachment.ok) {
    // Mapping corrupto ⇒ fail-closed, nunca un attachment parcial.
    return result(
      'NOT_FOUND',
      mapping,
      attachment.reasons.map((r) => `affiliate_mapping.attachment_invalid:${r}`)
    );
  }

  return result('FOUND', mapping, ['affiliate_mapping.found'], attachment.value, labelSource);
}

export interface AffiliateMappingResolverOptions {
  readonly clock?: () => Date;
}

export function createAffiliateMappingResolver(
  repository: AffiliateMappingRepository,
  options: AffiliateMappingResolverOptions = {}
): AffiliateMappingResolver {
  const clock = options.clock ?? (() => new Date());

  async function lookup(
    raw: AffiliateResolveInput | DealCandidate
  ): Promise<AffiliateMappingLookupResult> {
    const input = toResolveInput(raw, clock());
    const keys = affiliateMappingLookupKeys(input);
    let mappings: readonly AffiliateMapping[];
    try {
      mappings = await repository.findByIdentityKeys(keys);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      return result('NOT_FOUND', null, [`affiliate_mapping.repository_error:${msg.slice(0, 80)}`]);
    }
    return evaluateAffiliateMappingLookup(input, mappings);
  }

  async function resolve(input: AffiliateResolveInput): Promise<CazaResult<AffiliateAttachment>> {
    const outcome = await lookup(input);
    if (outcome.outcome === 'FOUND' && outcome.attachment) {
      return okResult(outcome.attachment);
    }
    return failResult([`affiliate_mapping.${outcome.outcome}`, ...outcome.reasons]);
  }

  return { lookup, resolve };
}
