import type { SupabaseClient } from '@supabase/supabase-js';
import {
  HUNTER_PAGE_SIZE,
  HUNTER_WINDOW,
  pipelineStatusesFor,
  type HunterQueueStatus,
  type HunterSort,
} from '@/lib/huntersAi/contract';
import { dedupeSources, matchesCategory, sortCards, toHunterCard, type HunterCard, type HunterSource } from '@/lib/huntersAi/present';

const ITEM_COLUMNS = `
  id, batch_id, status, identity_key, source_url, canonical_url, normalized_url,
  retailer, store, title, hint_title, price, hint_price, original_price, hint_original_price,
  discount_percent, category, hint_note, duplicate_status, duplicate_offer_id, offer_id,
  error_code, warnings, rejection_reason, evidence, created_at, approved_at, rejected_at,
  offers(status)`;

const ITEM_SELECT = `${ITEM_COLUMNS},
  offer_batches!inner(mcp_run_id, machine_client_id, machine_clients(name, hunter_code))
`;

const ITEM_SELECT_WITHOUT_CODE = `${ITEM_COLUMNS},
  offer_batches!inner(mcp_run_id, machine_client_id, machine_clients(name))
`;

export type HunterQueueQuery = {
  status: HunterQueueStatus | 'ALL';
  category: string | null;
  retailer: string | null;
  hunter: string | null;
  runId: string | null;
  sort: HunterSort;
  page: number;
};

export type HunterQueuePage = {
  items: HunterCard[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  /** La ventana se llenó: puede haber candidatos más antiguos en este filtro. */
  windowFull: boolean;
  metrics: {
    pending: number;
    needsReview: number;
    inModeration: number;
    approved: number;
    rejected: number;
    published: number;
    discoveredToday: number;
  };
};

function mexicoDayStart(now = new Date()): string {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${ymd}T00:00:00-06:00`).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function missingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || /hunters_ai_candidates/i.test(error.message ?? '');
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  return value == null ? null : Number(value);
}

export function rowToSource(raw: Record<string, unknown>): HunterSource {
  const batch = asRecord(raw.offer_batches);
  const client = asRecord(batch.machine_clients);
  const offer = asRecord(raw.offers);
  return {
    id: String(raw.id),
    batchId: String(raw.batch_id),
    status: String(raw.status ?? ''),
    identityKey: String(raw.identity_key ?? raw.id),
    sourceUrl: String(raw.source_url ?? ''),
    canonicalUrl: typeof raw.canonical_url === 'string' ? raw.canonical_url : null,
    retailer: typeof raw.retailer === 'string' ? raw.retailer : null,
    store: typeof raw.store === 'string' ? raw.store : null,
    title: typeof raw.title === 'string' ? raw.title : null,
    hintTitle: typeof raw.hint_title === 'string' ? raw.hint_title : null,
    price: optionalNumber(raw.price),
    hintPrice: optionalNumber(raw.hint_price),
    originalPrice: optionalNumber(raw.original_price),
    hintOriginalPrice: optionalNumber(raw.hint_original_price),
    discountPercent: optionalNumber(raw.discount_percent),
    category: typeof raw.category === 'string' ? raw.category : null,
    hintNote: typeof raw.hint_note === 'string' ? raw.hint_note : null,
    duplicateStatus: typeof raw.duplicate_status === 'string' ? raw.duplicate_status : null,
    duplicateOfferId: typeof raw.duplicate_offer_id === 'string' ? raw.duplicate_offer_id : null,
    offerId: typeof raw.offer_id === 'string' ? raw.offer_id : null,
    offerStatus:
      typeof offer.status === 'string' ? offer.status : typeof raw.offer_status === 'string' ? raw.offer_status : null,
    errorCode: typeof raw.error_code === 'string' ? raw.error_code : null,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === 'string') : [],
    rejectionReason: typeof raw.rejection_reason === 'string' ? raw.rejection_reason : null,
    evidence: asRecord(raw.evidence),
    createdAt: String(raw.created_at ?? ''),
    approvedAt: typeof raw.approved_at === 'string' ? raw.approved_at : null,
    rejectedAt: typeof raw.rejected_at === 'string' ? raw.rejected_at : null,
    mcpRunId: typeof raw.mcp_run_id === 'string' ? raw.mcp_run_id : typeof batch.mcp_run_id === 'string' ? batch.mcp_run_id : null,
    hunterName:
      typeof client.hunter_code === 'string' && client.hunter_code.trim()
        ? client.hunter_code
        : typeof raw.hunter_code === 'string'
          ? raw.hunter_code
          : typeof raw.hunter_name === 'string'
            ? raw.hunter_name
            : typeof client.name === 'string'
              ? client.name
              : null,
  };
}

async function loadWindow(supabase: SupabaseClient, statuses: string[] | null): Promise<HunterSource[]> {
  let view = supabase.from('hunters_ai_candidates').select('*');
  if (statuses) view = view.in('status', statuses);
  const viewed = await view.order('created_at', { ascending: false }).limit(HUNTER_WINDOW);
  if (!viewed.error && Array.isArray(viewed.data)) {
    return (viewed.data as Record<string, unknown>[]).map(rowToSource);
  }
  if (viewed.error && !missingRelation(viewed.error) && viewed.error.code !== '42703') {
    throw new Error(viewed.error.message);
  }
  const items = (select: string) => {
    let q = supabase.from('offer_batch_items').select(select).not('offer_batches.machine_client_id', 'is', null);
    if (statuses) q = q.in('status', statuses);
    return q.order('created_at', { ascending: false }).limit(HUNTER_WINDOW);
  };
  const fallback = await items(ITEM_SELECT);
  const missingCode = fallback.error && /hunter_code/i.test(fallback.error.message ?? '');
  if (!missingCode) {
    if (fallback.error) throw new Error(fallback.error.message);
    return ((fallback.data ?? []) as unknown as Record<string, unknown>[]).map(rowToSource);
  }
  const plain = await items(ITEM_SELECT_WITHOUT_CODE);
  if (plain.error) throw new Error(plain.error.message);
  return ((plain.data ?? []) as unknown as Record<string, unknown>[]).map(rowToSource);
}

async function countPipeline(
  supabase: SupabaseClient,
  statuses: string[],
  opts: { since?: string; offerStatus?: string } = {},
): Promise<number> {
  const select = opts.offerStatus
    ? 'id, offer_batches!inner(machine_client_id), offers!inner(status)'
    : 'id, offer_batches!inner(machine_client_id)';
  let q = supabase
    .from('offer_batch_items')
    .select(select, { count: 'exact', head: true })
    .not('offer_batches.machine_client_id', 'is', null)
    .in('status', statuses);
  if (opts.offerStatus) q = q.eq('offers.status', opts.offerStatus);
  if (opts.since) q = q.gte('created_at', opts.since);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

export async function loadHunterQueue(supabase: SupabaseClient, query: HunterQueueQuery): Promise<HunterQueuePage> {
  const [raw, pending, needsReview, inModeration, approved, published, rejected, discoveredToday] = await Promise.all([
    loadWindow(supabase, pipelineStatusesFor(query.status)),
    countPipeline(supabase, ['INGESTED', 'PROCESSING', 'READY']),
    countPipeline(supabase, ['NEEDS_REVIEW', 'ERROR']),
    countPipeline(supabase, ['APPROVED'], { offerStatus: 'pending' }),
    countPipeline(supabase, ['APPROVED']),
    countPipeline(supabase, ['PUBLISHED']),
    countPipeline(supabase, ['REJECTED']),
    countPipeline(
      supabase,
      ['INGESTED', 'PROCESSING', 'READY', 'NEEDS_REVIEW', 'ERROR', 'APPROVED', 'PUBLISHED', 'REJECTED'],
      { since: mexicoDayStart() },
    ),
  ]);

  const cards = sortCards(
    dedupeSources(raw).map(toHunterCard).filter((card) => {
      if (query.status !== 'ALL' && card.queueStatus !== query.status) return false;
      if (query.category && !matchesCategory(card, query.category)) return false;
      if (query.retailer && !card.retailer.toLowerCase().includes(query.retailer.toLowerCase())) return false;
      if (query.hunter && !card.hunterName.toLowerCase().includes(query.hunter.toLowerCase())) return false;
      if (query.runId && card.runId !== query.runId) return false;
      return true;
    }),
    query.sort,
  );

  const page = Math.max(1, query.page);
  const start = (page - 1) * HUNTER_PAGE_SIZE;
  const items = cards.slice(start, start + HUNTER_PAGE_SIZE);
  return {
    items,
    page,
    pageSize: HUNTER_PAGE_SIZE,
    hasMore: start + HUNTER_PAGE_SIZE < cards.length,
    windowFull: raw.length >= HUNTER_WINDOW,
    metrics: { pending, needsReview, inModeration, approved, rejected, published, discoveredToday },
  };
}
