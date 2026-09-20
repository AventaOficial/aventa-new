/**
 * CazaOfertasss — FASE 3.2. Attribution candidate (readiness).
 *
 * KNOWN | UNKNOWN | AMBIGUOUS | CONFLICT
 *
 * Nunca inferir KNOWN por proximidad temporal, título o producto.
 * Separado del ledger financiero y del historial de publication.
 */

import type { CazaResult } from '../types';
import { failResult, okResult } from '../types';
import { REVENUE_UNKNOWN_TRACKING_LABEL } from '../revenue/identity';
import type { TrackingIdentity } from './identity';
import type { TrackingRegistryPort } from './registry';

export type AttributionCandidateStatus =
  | 'KNOWN'
  | 'UNKNOWN'
  | 'AMBIGUOUS'
  | 'CONFLICT';

export interface AttributionCandidate {
  readonly status: AttributionCandidateStatus;
  readonly trackingLabel: string | null;
  readonly publicationId: string | null;
  readonly publicationRevision: number | null;
  readonly dealId: string | null;
  readonly identityKeys: readonly string[];
  readonly reason: string;
  /**
   * Si CONFLICT: publicationId ya atribuida a providerExternalReference
   * vs publicationId resuelta por tracking.
   */
  readonly conflictPublicationIds: readonly string[];
}

export interface PriorProviderAttribution {
  readonly providerExternalReference: string;
  readonly publicationId: string;
}

/**
 * Resuelve candidato de atribución desde el registry únicamente.
 * Sin heurísticas de tiempo/producto.
 */
export async function resolveAttributionCandidate(input: {
  readonly trackingLabel: string | null;
  readonly registry: TrackingRegistryPort;
  /** dealId opcional del índice de publicaciones (no inventado). */
  readonly dealIdByPublicationId?: ReadonlyMap<string, string>;
  /**
   * Si el mismo providerExternalReference ya fue atribuido a otra publication,
   * y el tracking apunta a una distinta ⇒ CONFLICT.
   */
  readonly priorAttribution?: PriorProviderAttribution | null;
}): Promise<AttributionCandidate> {
  const label = input.trackingLabel;

  if (!label || label === REVENUE_UNKNOWN_TRACKING_LABEL) {
    return {
      status: 'UNKNOWN',
      trackingLabel: label === REVENUE_UNKNOWN_TRACKING_LABEL ? null : label,
      publicationId: null,
      publicationRevision: null,
      dealId: null,
      identityKeys: [],
      reason: 'attribution_candidate.no_tracking_label',
      conflictPublicationIds: [],
    };
  }

  const resolved = await input.registry.resolveByTrackingLabel(label);
  const matches = resolved.matches;

  if (matches.length === 0) {
    return {
      status: 'UNKNOWN',
      trackingLabel: label,
      publicationId: null,
      publicationRevision: null,
      dealId: null,
      identityKeys: [],
      reason: 'attribution_candidate.tracking_not_registered',
      conflictPublicationIds: [],
    };
  }

  const distinctPublicationIds = unique(matches.map((m) => m.publicationId));

  if (distinctPublicationIds.length > 1) {
    return {
      status: 'AMBIGUOUS',
      trackingLabel: label,
      publicationId: null,
      publicationRevision: null,
      dealId: null,
      identityKeys: matches.map((m) => m.identityKey),
      reason: 'attribution_candidate.multiple_publications_for_label',
      conflictPublicationIds: distinctPublicationIds,
    };
  }

  const chosen = pickCanonicalMatch(matches);
  const publicationId = chosen.publicationId;

  if (
    input.priorAttribution &&
    input.priorAttribution.publicationId !== publicationId
  ) {
    return {
      status: 'CONFLICT',
      trackingLabel: label,
      publicationId: null,
      publicationRevision: null,
      dealId: null,
      identityKeys: matches.map((m) => m.identityKey),
      reason: 'attribution_candidate.provider_ref_conflicts_with_tracking',
      conflictPublicationIds: [
        input.priorAttribution.publicationId,
        publicationId,
      ].sort(),
    };
  }

  return {
    status: 'KNOWN',
    trackingLabel: label,
    publicationId,
    publicationRevision: chosen.publicationRevision,
    dealId: input.dealIdByPublicationId?.get(publicationId) ?? null,
    identityKeys: matches.map((m) => m.identityKey),
    reason: 'attribution_candidate.exact_tracking_match',
    conflictPublicationIds: [],
  };
}

/** Entre varias observations de la MISMA publication, elige la de mayor revision. */
function pickCanonicalMatch(matches: readonly TrackingIdentity[]): TrackingIdentity {
  return [...matches].sort((a, b) => {
    if (b.publicationRevision !== a.publicationRevision) {
      return b.publicationRevision - a.publicationRevision;
    }
    return a.identityKey < b.identityKey ? -1 : 1;
  })[0];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function assertAttributionCandidateNotInvented(
  candidate: AttributionCandidate
): CazaResult<true> {
  if (candidate.status === 'KNOWN' && !candidate.publicationId) {
    return failResult(['attribution_candidate.known_without_publication']);
  }
  if (candidate.status !== 'KNOWN' && candidate.publicationId) {
    return failResult(['attribution_candidate.publication_without_known']);
  }
  if (candidate.status === 'AMBIGUOUS' && candidate.conflictPublicationIds.length < 2) {
    return failResult(['attribution_candidate.ambiguous_requires_multiple']);
  }
  if (candidate.status === 'CONFLICT' && candidate.conflictPublicationIds.length < 2) {
    return failResult(['attribution_candidate.conflict_requires_pair']);
  }
  return okResult(true);
}
