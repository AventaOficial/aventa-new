/**
 * CazaOfertasss — FASE 3. Atribución (capa separada del ledger financiero).
 *
 * Regla dura: UNKNOWN permanece UNKNOWN. Nunca inventar publication/deal.
 */

import type { CazaResult } from '../types';
import { failResult, okResult } from '../types';
import { REVENUE_UNKNOWN_TRACKING_LABEL } from './identity';
import type { AffiliateRevenueEvent } from './ledger';
import type {
  RevenueAttributionDecision,
  RevenueAttributionRecord,
} from './types';

export interface PublicationAttributionIndex {
  /**
   * Resuelve tracking label → publicación conocida.
   * null / miss ⇒ no atribuir.
   */
  findByTrackingLabel(
    trackingLabel: string
  ): Promise<{ publicationId: string; dealId: string } | null>;
}

export interface RevenueAttributionPort {
  append(
    record: RevenueAttributionRecord
  ): Promise<{ appended: boolean; duplicate: boolean }>;
  findByEventId(eventId: string): Promise<RevenueAttributionRecord | null>;
  listByPublicationId(
    publicationId: string,
    limit: number
  ): Promise<readonly RevenueAttributionRecord[]>;
}

export function attributionIdempotencyKey(eventId: string): string {
  return `attr:${eventId}`;
}

/**
 * Decide atribución. Sin match explícito ⇒ UNKNOWN.
 * No escribe dealId en el evento financiero.
 */
export async function decideRevenueAttribution(input: {
  readonly event: AffiliateRevenueEvent;
  readonly index: PublicationAttributionIndex;
  readonly decidedAt: string;
}): Promise<CazaResult<RevenueAttributionRecord>> {
  const { event, index, decidedAt } = input;
  const tracking = event.trackingLabel;

  if (!tracking || tracking === REVENUE_UNKNOWN_TRACKING_LABEL) {
    return okResult({
      attributionId: attributionIdempotencyKey(event.eventId),
      eventId: event.eventId,
      decision: 'UNKNOWN',
      publicationId: null,
      dealId: null,
      trackingIdentifier: tracking === REVENUE_UNKNOWN_TRACKING_LABEL ? null : tracking,
      reason: 'attribution.no_tracking_identifier',
      decidedAt,
    });
  }

  const match = await index.findByTrackingLabel(tracking);
  if (!match) {
    return okResult({
      attributionId: attributionIdempotencyKey(event.eventId),
      eventId: event.eventId,
      decision: 'UNMATCHED_TRACKING',
      publicationId: null,
      dealId: null,
      trackingIdentifier: tracking,
      reason: 'attribution.tracking_not_found_in_publications',
      decidedAt,
    });
  }

  return okResult({
    attributionId: attributionIdempotencyKey(event.eventId),
    eventId: event.eventId,
    decision: 'ATTRIBUTED',
    publicationId: match.publicationId,
    dealId: match.dealId,
    trackingIdentifier: tracking,
    reason: 'attribution.tracking_matched_publication',
    decidedAt,
  });
}

/** Guardrail: nunca promover UNKNOWN/UNMATCHED a ATTRIBUTED sin evidencia. */
export function assertAttributionNotInvented(
  decision: RevenueAttributionDecision,
  publicationId: string | null
): CazaResult<true> {
  if (decision === 'ATTRIBUTED' && !publicationId) {
    return failResult(['attribution.invented_without_publication']);
  }
  if (decision !== 'ATTRIBUTED' && publicationId) {
    return failResult(['attribution.publication_without_attributed_decision']);
  }
  return okResult(true);
}

export function createInMemoryPublicationAttributionIndex(
  entries: ReadonlyArray<{ trackingLabel: string; publicationId: string; dealId: string }>
): PublicationAttributionIndex {
  const map = new Map(entries.map((e) => [e.trackingLabel, e]));
  return {
    async findByTrackingLabel(trackingLabel: string) {
      const hit = map.get(trackingLabel);
      return hit ? { publicationId: hit.publicationId, dealId: hit.dealId } : null;
    },
  };
}

export function createInMemoryRevenueAttributionStore(): RevenueAttributionPort & {
  tryUpdate(record: RevenueAttributionRecord): Promise<never>;
  size(): number;
} {
  const byEvent = new Map<string, RevenueAttributionRecord>();
  return {
    async append(record) {
      if (byEvent.has(record.eventId)) return { appended: false, duplicate: true };
      byEvent.set(record.eventId, record);
      return { appended: true, duplicate: false };
    },
    async findByEventId(eventId) {
      return byEvent.get(eventId) ?? null;
    },
    async listByPublicationId(publicationId, limit) {
      const safe = Math.max(1, Math.min(limit, 500));
      return [...byEvent.values()]
        .filter((r) => r.publicationId === publicationId)
        .slice(0, safe);
    },
    async tryUpdate() {
      throw new Error('caza.attribution.append_only:UPDATE_forbidden');
    },
    size() {
      return byEvent.size;
    },
  };
}
