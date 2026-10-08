import { createHash } from 'node:crypto';
import type { WritableProductEvent } from '@/lib/analytics/funnelTaxonomy';
import { sanitizeSearchQuery } from '@/lib/offers/searchQuery';

const REPEAT_EMIT_MS = 10_000;

const BLOCKED_PREFIXES = ['/admin', '/equipo', '/team', '/operaciones', '/mi-panel', '/contexto', '/api'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONG_DIGITS_RE = /\d{12,}/;

type Meta = Record<string, string | number | boolean | null>;

export function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function productActorKey(userId?: string | null, anonymousId?: string | null): string {
  return userId?.trim() || anonymousId?.trim() || 'anon';
}

export function normalizeProductPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return null;
  const noQuery = trimmed.split('?')[0]?.split('#')[0] ?? '';
  if (!noQuery.startsWith('/') || noQuery.includes('//') || noQuery.includes('..')) return null;
  const collapsed = noQuery.length > 1 && noQuery.endsWith('/') ? noQuery.slice(0, -1) : noQuery;
  if (!collapsed || collapsed.length > 120) return collapsed ? collapsed.slice(0, 120) : null;
  return collapsed;
}

export function isPublicProductPath(pathname: string | null | undefined): boolean {
  const path = normalizeProductPath(pathname);
  if (!path) return false;
  return !BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isPrefetchRequest(headerStore: { get(name: string): string | null }): boolean {
  const purpose = `${headerStore.get('purpose') ?? ''} ${headerStore.get('sec-purpose') ?? ''}`.toLowerCase();
  if (purpose.includes('prefetch')) return true;
  if (headerStore.get('next-router-prefetch') === '1') return true;
  if (headerStore.get('next-router-segment-prefetch') === '1') return true;
  return false;
}

function repeatBucket(nowMs: number): string {
  return String(Math.floor(nowMs / REPEAT_EMIT_MS));
}

function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function metaString(metadata: Meta, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Dedupe por evento. No hay una regla horaria única.
 * page_view y feed_view colapsan solo el doble disparo del mismo request (~10s).
 * search distingue queries. load_more distingue cursores.
 */
export function phase1DedupeKey(input: {
  event: 'page_view' | 'feed_view' | 'search' | 'load_more';
  actor: string;
  metadata: Meta;
  nowMs: number;
}): string | null {
  const actor = input.actor || 'anon';
  if (input.event === 'page_view') {
    const path = normalizeProductPath(metaString(input.metadata, 'path'));
    if (!path) return null;
    return `page_view:${actor}:${path}:${repeatBucket(input.nowMs)}`.slice(0, 200);
  }
  if (input.event === 'feed_view') {
    const logical = [
      metaString(input.metadata, 'feed_type'),
      metaString(input.metadata, 'view'),
      metaString(input.metadata, 'period'),
      metaString(input.metadata, 'category'),
      metaString(input.metadata, 'store'),
    ].join('|');
    if (!logical.startsWith('home') && !logical.startsWith('for_you')) return null;
    return `feed_view:${actor}:${fingerprint(logical)}:${repeatBucket(input.nowMs)}`.slice(0, 200);
  }
  if (input.event === 'search') {
    const queryHash = metaString(input.metadata, 'query_hash');
    if (!queryHash) return null;
    return `search:${actor}:${queryHash}:${repeatBucket(input.nowMs)}`.slice(0, 200);
  }
  const cursorFp = metaString(input.metadata, 'cursor_fp');
  const feedType = metaString(input.metadata, 'feed_type');
  if (!cursorFp || !feedType) return null;
  return `load_more:${actor}:${feedType}:${cursorFp}:${utcDay(input.nowMs)}`.slice(0, 200);
}

export function isSensitiveSearchText(query: string): boolean {
  return EMAIL_RE.test(query) || LONG_DIGITS_RE.test(query);
}

/** Metadata mínima de búsqueda. El texto sensible no se guarda; el hash sí, para no colapsar queries distintas. */
export function buildSearchMetadata(
  rawQuery: string,
  resultCount: number,
): Record<string, string | number> | null {
  const query = sanitizeSearchQuery(rawQuery);
  if (query.length < 2) return null;
  const boundedCount = Number.isFinite(resultCount) ? Math.max(0, Math.min(100, Math.floor(resultCount))) : 0;
  const queryHash = fingerprint(query);
  const metadata: Record<string, string | number> = {
    query_hash: queryHash,
    result_count: boundedCount,
  };
  if (!isSensitiveSearchText(query)) metadata.query_normalized = query;
  return metadata;
}

export function feedViewMetadata(input: {
  feedType: 'home' | 'for_you';
  view?: string | null;
  period?: string | null;
  category?: string | null;
  store?: string | null;
  resultCount?: number | null;
}): Record<string, string | number> {
  const metadata: Record<string, string | number> = { feed_type: input.feedType };
  if (input.view) metadata.view = input.view.slice(0, 32);
  if (input.period) metadata.period = input.period.slice(0, 16);
  if (input.category) metadata.category = input.category.slice(0, 80);
  if (input.store) metadata.store = input.store.slice(0, 80);
  if (typeof input.resultCount === 'number' && Number.isFinite(input.resultCount)) {
    metadata.result_count = Math.max(0, Math.min(100, Math.floor(input.resultCount)));
  }
  return metadata;
}

export function loadMoreMetadata(input: {
  feedType: 'home' | 'for_you';
  cursor: string;
  view?: string | null;
  period?: string | null;
}): Record<string, string> | null {
  const cursor = input.cursor.trim();
  if (!cursor) return null;
  const metadata: Record<string, string> = {
    feed_type: input.feedType,
    cursor_fp: fingerprint(cursor),
  };
  if (input.view) metadata.view = input.view.slice(0, 32);
  if (input.period) metadata.period = input.period.slice(0, 16);
  return metadata;
}

export function isPhase1BehaviorEvent(
  event: WritableProductEvent,
): event is 'page_view' | 'feed_view' | 'search' | 'load_more' {
  return event === 'page_view' || event === 'feed_view' || event === 'search' || event === 'load_more';
}
