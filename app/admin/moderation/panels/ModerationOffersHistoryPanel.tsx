'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search } from 'lucide-react';
import ModerationOfferCard from '../../components/ModerationOfferCard';
import type { ModerationOfferPatch } from '@/lib/moderation/cardEditPayload';
import {
  HISTORY_PAGE_SIZE,
  historySearchFilter,
  mergeHistoryPage,
} from '@/lib/moderation/historyPagination';

type ModerationOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  image_url: string | null;
  offer_url: string | null;
  description?: string | null;
  created_at: string;
  created_by: string | null;
  expires_at?: string | null;
  risk_score?: number | null;
  category?: string | null;
  bot_meta?: unknown;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
};

type Props = {
  status: 'approved' | 'rejected';
  title: string;
  emptyMessage: string;
};

const OFFER_SELECT = {
  approved:
    'id, title, price, original_price, store, category, bot_meta, image_url, offer_url, description, created_at, created_by, expires_at, profiles:public_profiles_view!created_by(display_name, avatar_url)',
  rejected:
    'id, title, price, original_price, store, image_url, offer_url, created_at, created_by, profiles!created_by(display_name, avatar_url)',
} as const;

export default function ModerationOffersHistoryPanel({
  status,
  title,
  emptyMessage,
}: Props) {
  const [offers, setOffers] = useState<ModerationOffer[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const requestRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  /** Página de servidor: ordenada por created_at desc; `before` es el created_at de la última cargada. */
  const fetchPage = useCallback(
    async (before: string | null) => {
      const supabase = createClient();
      let query = supabase
        .from('offers')
        .select(OFFER_SELECT[status], { count: before ? undefined : 'exact' })
        .eq('status', status)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(HISTORY_PAGE_SIZE);
      if (before) query = query.lte('created_at', before);
      const search = historySearchFilter(debouncedSearch);
      if (search) query = query.or(search);
      const { data, error, count } = await query;
      if (error) {
        console.error('Error refreshing:', error);
        return null;
      }
      const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        ...r,
        profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
      })) as ModerationOffer[];
      return { rows, count: count ?? null };
    },
    [status, debouncedSearch]
  );

  const refreshList = useCallback(
    async (skipLoading = false) => {
      const requestId = ++requestRef.current;
      if (!skipLoading) setLoading(true);
      const page = await fetchPage(null);
      if (requestId !== requestRef.current) return;
      if (!skipLoading) setLoading(false);
      if (!page) return;
      setOffers(page.rows);
      setTotal(page.count);
      setHasMore(page.rows.length === HISTORY_PAGE_SIZE);
    },
    [fetchPage]
  );

  useEffect(() => {
    void refreshList(false);
  }, [refreshList]);

  const loadMore = async () => {
    const last = offers[offers.length - 1];
    if (!last || loadingMore) return;
    const requestId = requestRef.current;
    setLoadingMore(true);
    const page = await fetchPage(last.created_at);
    setLoadingMore(false);
    if (!page || requestId !== requestRef.current) return;
    const merged = mergeHistoryPage(offers, page.rows);
    setOffers(merged.offers);
    setHasMore(merged.added > 0 && page.rows.length === HISTORY_PAGE_SIZE);
  };

  const applyPatch = (id: string, patch?: ModerationOfferPatch) => {
    if (!patch) {
      void refreshList(true);
      return;
    }
    if (patch.status && patch.status !== status) {
      setOffers((prev) => prev.filter((o) => o.id !== id));
      setTotal((prev) => (prev == null ? prev : Math.max(0, prev - 1)));
      return;
    }
    const fields: ModerationOfferPatch = { ...patch };
    delete fields.status;
    setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, ...fields } as ModerationOffer : o)));
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">{title}</h2>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por título o tienda..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 placeholder-gray-500"
          />
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400" data-history-count>
          {offers.length} de {total ?? offers.length}
        </span>
      </div>

      {loading ? (
        <div className="text-gray-500 dark:text-gray-400 py-8">Cargando…</div>
      ) : offers.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] p-8 text-center text-gray-500 dark:text-gray-400">
          {debouncedSearch.trim() ? 'No hay resultados para tu búsqueda.' : emptyMessage}
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            {offers.map((offer) => (
              <li key={offer.id}>
                <ModerationOfferCard
                  offer={offer}
                  status={status}
                  onOfferUpdated={status === 'approved' ? (patch) => applyPatch(offer.id, patch) : undefined}
                />
              </li>
            ))}
          </ul>
          {hasMore ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {loadingMore ? 'Cargando…' : `Cargar ${HISTORY_PAGE_SIZE} más`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
