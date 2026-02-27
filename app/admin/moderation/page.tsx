'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { Search } from 'lucide-react';
import ModerationOfferCard from '../components/ModerationOfferCard';

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

const MODERATION_PATH = '/admin/moderation';

function useSimilarOffers(title: string) {
  const [similar, setSimilar] = useState<string[]>([]);
  useEffect(() => {
    if (!title?.trim()) return;
    const escaped = title.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const supabase = createClient();
    supabase
      .from('offers')
      .select('title')
      .or('status.eq.approved,status.eq.published')
      .ilike('title', `%${escaped}%`)
      .gte('created_at', sevenDaysAgo)
      .limit(3)
      .then(({ data }) => {
        setSimilar((data ?? []).map((r) => r.title).filter(Boolean));
      });
  }, [title]);
  return similar;
}

export default function ModerationPage() {
  const pathname = usePathname();
  const { session } = useAuth();
  const [pending, setPending] = useState<ModerationOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
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
        'id, title, price, original_price, store, image_url, offer_url, created_at, created_by, risk_score, profiles!created_by(display_name, avatar_url)'
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!skipLoading) setLoading(false);
        if (error) {
          console.error('Error refreshing:', error);
          return;
        }
        setPending(
          (data ?? []).map((r: Record<string, unknown>) => ({
            ...r,
            profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
          })) as ModerationOffer[]
        );
      });
  }, []);

  useEffect(() => {
    if (pathname !== MODERATION_PATH) return;
    refreshList(false);

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshList(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pathname, refreshList]);

  const setStatus = async (
    id: string,
    status: 'approved' | 'rejected',
    createdBy?: string | null,
    reason?: string
  ) => {
    setActingId(id);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch('/api/admin/moderate-offer', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id, status, reason: reason || undefined }),
    });
    setActingId(null);
    if (!res.ok) {
      console.error('Error updating offer');
      return;
    }
    const repHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) repHeaders.Authorization = `Bearer ${session.access_token}`;
    if (status === 'approved' && createdBy) {
      fetch('/api/reputation/increment-approved', {
        method: 'POST',
        headers: repHeaders,
        body: JSON.stringify({ userId: createdBy }),
      }).catch(() => {});
    } else if (status === 'rejected' && createdBy) {
      fetch('/api/reputation/increment-rejected', {
        method: 'POST',
        headers: repHeaders,
        body: JSON.stringify({ userId: createdBy }),
      }).catch(() => {});
    }
    await refreshList(true);
  };

  const filtered = pending.filter((o) => {
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
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-1">
        Ofertas pendientes
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Revisa cada oferta. Si está bien → Aprobar. Si no cumple → Rechazar.
      </p>

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
          {filtered.length} de {pending.length} pendientes
        </span>
      </div>

      {loading ? (
        <div className="text-gray-500 dark:text-gray-400 py-8">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center text-gray-500 dark:text-gray-400">
          {pending.length === 0
            ? 'No hay ofertas pendientes.'
            : 'No hay resultados para tu búsqueda.'}
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((offer) => (
            <ModerationOfferCardWithSimilar
              key={offer.id}
              offer={offer}
              status="pending"
              onApprove={(id, cb) => setStatus(id, 'approved', cb)}
              onReject={(id, reason) => setStatus(id, 'rejected', undefined, reason)}
              actingId={actingId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ModerationOfferCardWithSimilar({
  offer,
  ...props
}: {
  offer: ModerationOffer;
  status: 'pending';
  onApprove: (id: string, createdBy?: string | null) => void;
  onReject: (id: string, reason?: string) => void;
  actingId: string | null;
}) {
  const similarTitles = useSimilarOffers(offer.title);
  return (
    <li>
      <ModerationOfferCard
        offer={offer}
        similarTitles={similarTitles}
        {...props}
      />
    </li>
  );
}
