'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search } from 'lucide-react';
import ModerationOfferCard from '../../components/ModerationOfferCard';

type ModerationOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  image_url: string | null;
  offer_url: string | null;
  created_at: string;
  created_by: string | null;
  risk_score?: number | null;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
};

export default function ApprovedPage() {
  const [offers, setOffers] = useState<ModerationOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const refreshList = useCallback((skipLoading = false) => {
    if (!skipLoading) setLoading(true);
    const supabase = createClient();
    return supabase
      .from('offers')
      .select(
        'id, title, price, original_price, store, image_url, offer_url, created_at, created_by, profiles!created_by(display_name, avatar_url)'
      )
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!skipLoading) setLoading(false);
        if (error) {
          console.error('Error refreshing:', error);
          return;
        }
        setOffers(
          (data ?? []).map((r: Record<string, unknown>) => ({
            ...r,
            profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
          })) as ModerationOffer[]
        );
      });
  }, []);

  useEffect(() => {
    refreshList(false);
  }, [refreshList]);

  const filtered = offers.filter((o) => {
    if (!debouncedSearch.trim()) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      o.title?.toLowerCase().includes(q) ||
      o.store?.toLowerCase().includes(q) ||
      o.profiles?.display_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
        Ofertas aprobadas
      </h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por título, tienda o autor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500"
          />
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {filtered.length} de {offers.length}
        </span>
      </div>

      {loading ? (
        <div className="text-gray-500 dark:text-gray-400 py-8">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center text-gray-500 dark:text-gray-400">
          {offers.length === 0
            ? 'No hay ofertas aprobadas.'
            : 'No hay resultados para tu búsqueda.'}
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((offer) => (
            <li key={offer.id}>
              <ModerationOfferCard offer={offer} status="approved" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
