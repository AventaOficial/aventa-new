/**
 * CazaOfertasss — FASE 3.3. Business event model (ops / measurement).
 *
 * Estos eventos NO son revenue. Revenue solo viene del ledger de provider
 * (FASE 3) con evidencia oficial.
 *
 * Autoridad: observabilidad operativa. Nunca money authority.
 */

import type { CazaResult, IsoTimestamp } from '../types';
import { failResult, okResult } from '../types';

export const CAZA_OPS_SCHEMA_VERSION = 'caza.ops.events.v1' as const;

export type CazaBusinessEventType =
  | 'DEAL_DISCOVERED'
  | 'DEAL_VALIDATED'
  | 'DEAL_REJECTED'
  | 'DEAL_PUBLISHED'
  | 'DEAL_RETRACTED'
  /** Solo si hay evidencia real (Telegram no lo provee vía Bot API sendMessage). */
  | 'TELEGRAM_VIEW'
  | 'CLICK'
  | 'ATTRIBUTION_KNOWN'
  | 'ATTRIBUTION_UNKNOWN'
  | 'ORDER_PENDING'
  | 'ORDER_APPROVED'
  | 'ORDER_CANCELLED'
  | 'COMMISSION'
  /** Señal operativa: revenue provider aún no observable. NO es un monto. */
  | 'REVENUE_UNKNOWN';

export type CazaBusinessEventSource =
  | 'discovery'
  | 'validation'
  | 'publication'
  | 'telegram'
  | 'tracking'
  | 'attribution'
  | 'provider_report'
  | 'ops_derived'
  | 'manual';

export interface CazaBusinessEvent {
  readonly eventId: string;
  readonly eventType: CazaBusinessEventType;
  readonly occurredAt: IsoTimestamp;
  readonly source: CazaBusinessEventSource;
  /** Clave de identidad del sujeto (deal / publication / tracking). */
  readonly identityKey: string;
  readonly publicationId: string | null;
  readonly trackingIdentity: string | null;
  readonly metadata: Readonly<Record<string, string>>;
  readonly schemaVersion: typeof CAZA_OPS_SCHEMA_VERSION;
  readonly recordedAt: IsoTimestamp;
}

export interface BuildBusinessEventInput {
  readonly eventType: CazaBusinessEventType;
  readonly occurredAt: IsoTimestamp;
  readonly source: CazaBusinessEventSource;
  readonly identityKey: string;
  readonly publicationId?: string | null;
  readonly trackingIdentity?: string | null;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly recordedAt: IsoTimestamp;
}

/**
 * Idempotencia determinista:
 * eventType + identityKey + occurredAt(+metadata.dedupe_salt opcional)
 */
export function businessEventIdempotencyKey(input: {
  readonly eventType: CazaBusinessEventType;
  readonly identityKey: string;
  readonly occurredAt: IsoTimestamp;
  readonly dedupeSalt?: string | null;
}): string {
  const salt = input.dedupeSalt ?? '';
  return `ops:${input.eventType}:${input.identityKey}:${input.occurredAt}:${salt}`;
}

export function buildBusinessEvent(
  input: BuildBusinessEventInput
): CazaResult<CazaBusinessEvent> {
  const reasons: string[] = [];
  if (!input.eventType) reasons.push('ops.event_type_required');
  if (typeof input.identityKey !== 'string' || input.identityKey.trim().length < 4) {
    reasons.push('ops.identity_key_invalid');
  }
  if (!Number.isFinite(Date.parse(input.occurredAt))) {
    reasons.push('ops.occurred_at_invalid');
  }
  if (!Number.isFinite(Date.parse(input.recordedAt))) {
    reasons.push('ops.recorded_at_invalid');
  }
  if (input.eventType === 'TELEGRAM_VIEW' && input.source !== 'telegram' && input.source !== 'manual') {
    reasons.push('ops.telegram_view_requires_evidence_source');
  }
  // COMMISSION / ORDER_* en ops son señales de correlación, no montos financieros.
  // Prohibido meter amount en metadata como "revenue real".
  if (input.metadata) {
    for (const key of Object.keys(input.metadata)) {
      if (/^(revenue|payout|reward|settlement)_/i.test(key)) {
        reasons.push(`ops.metadata_forbidden_money_key:${key}`);
      }
    }
  }
  if (reasons.length > 0) return failResult(reasons);

  const metadata = { ...(input.metadata ?? {}) };
  const eventId = businessEventIdempotencyKey({
    eventType: input.eventType,
    identityKey: input.identityKey,
    occurredAt: input.occurredAt,
    dedupeSalt: metadata.dedupe_salt ?? null,
  });

  return okResult({
    eventId,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    source: input.source,
    identityKey: input.identityKey,
    publicationId: input.publicationId ?? null,
    trackingIdentity: input.trackingIdentity ?? null,
    metadata,
    schemaVersion: CAZA_OPS_SCHEMA_VERSION,
    recordedAt: input.recordedAt,
  });
}

export interface CazaBusinessEventStorePort {
  append(event: CazaBusinessEvent): Promise<{ appended: boolean; duplicate: boolean }>;
  findByEventId(eventId: string): Promise<CazaBusinessEvent | null>;
  /**
   * Listado acotado por ventana. Obligatorio limit.
   * No existe listAll().
   */
  listByWindow(input: {
    readonly fromInclusive: IsoTimestamp;
    readonly toExclusive: IsoTimestamp;
    readonly limit: number;
    readonly eventType?: CazaBusinessEventType;
  }): Promise<readonly CazaBusinessEvent[]>;
  listByPublicationId(
    publicationId: string,
    limit: number
  ): Promise<readonly CazaBusinessEvent[]>;
}

export function createInMemoryBusinessEventStore(): CazaBusinessEventStorePort & {
  size(): number;
  tryMutate(): Promise<never>;
} {
  const byId = new Map<string, CazaBusinessEvent>();
  const tails = new Map<string, Promise<unknown>>();

  async function withLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = prev.then(() => gate);
    tails.set(key, next.catch(() => undefined));
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (tails.get(key) === next) tails.delete(key);
    }
  }

  return {
    async append(event) {
      return withLock(event.eventId, async () => {
        if (byId.has(event.eventId)) return { appended: false, duplicate: true };
        byId.set(event.eventId, event);
        return { appended: true, duplicate: false };
      });
    },
    async findByEventId(eventId) {
      return byId.get(eventId) ?? null;
    },
    async listByWindow(input) {
      const limit = assertBound(input.limit, 1000);
      const from = Date.parse(input.fromInclusive);
      const to = Date.parse(input.toExclusive);
      return [...byId.values()]
        .filter((e) => {
          const t = Date.parse(e.occurredAt);
          if (!(t >= from && t < to)) return false;
          if (input.eventType && e.eventType !== input.eventType) return false;
          return true;
        })
        .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1))
        .slice(0, limit);
    },
    async listByPublicationId(publicationId, limit) {
      const safe = assertBound(limit, 500);
      return [...byId.values()]
        .filter((e) => e.publicationId === publicationId)
        .slice(0, safe);
    },
    size() {
      return byId.size;
    },
    async tryMutate() {
      throw new Error('caza.ops.events.append_only:mutate_forbidden');
    },
  };
}

function assertBound(limit: number, max: number): number {
  if (!Number.isFinite(limit) || limit < 1) throw new Error('caza.ops.limit_invalid');
  return Math.min(Math.floor(limit), max);
}
