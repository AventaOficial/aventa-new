'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { Search, CheckSquare, Square, Clock, Check, X } from 'lucide-react';
import ModerationOfferCard from '../components/ModerationOfferCard';

const CATEGORY_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'electronics', label: 'Electrónica' },
  { value: 'fashion', label: 'Moda' },
  { value: 'home', label: 'Hogar' },
  { value: 'sports', label: 'Deportes' },
  { value: 'books', label: 'Libros' },
  { value: 'other', label: 'Otros' },
];

type ModerationOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  category?: string | null;
  image_url: string | null;
  offer_url: string | null;
  created_at: string;
  created_by: string | null;
  risk_score?: number | null;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
};

const MODERATION_PATH = '/admin/moderation';

type SimilarOffer = { id: string; title: string; price: number; original_price: number | null; store: string | null; created_at: string };

function useSimilarOffers(store: string | null, title: string, offerUrl: string | null) {
  const [similar, setSimilar] = useState<SimilarOffer[]>([]);
  useEffect(() => {
    if (!store?.trim() && !title?.trim()) return;
    const params = new URLSearchParams();
    if (store?.trim()) params.set('store', store.trim());
    if (title?.trim()) params.set('title', title.trim());
    if (offerUrl?.trim()) params.set('offer_url', offerUrl.trim());
    fetch(`/api/offers/similar?${params}`)
      .then((r) => r.json())
      .then((data) => setSimilar(Array.isArray(data?.similar) ? data.similar : []))
      .catch(() => setSimilar([]));
  }, [store, title, offerUrl]);
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
        'id, title, price, original_price, store, category, image_url, offer_url, created_at, created_by, risk_score, profiles!created_by(display_name, avatar_url)'
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
        setSelectedIds(new Set());
      });
  }, []);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchRejectReason, setBatchRejectReason] = useState('');
  const [showBatchReject, setShowBatchReject] = useState(false);
  const [batchActing, setBatchActing] = useState(false);
  const [storeFilter, setStoreFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [riskHighOnly, setRiskHighOnly] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size >= filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((o) => o.id)));
  };

  const runBatchApprove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBatchActing(true);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    for (const id of ids) {
      const offer = pending.find((o) => o.id === id);
      await fetch('/api/admin/moderate-offer', { method: 'POST', headers, body: JSON.stringify({ id, status: 'approved' }) });
      if (offer?.created_by) {
        await fetch('/api/reputation/increment-approved', { method: 'POST', headers, body: JSON.stringify({ userId: offer.created_by }) }).catch(() => {});
      }
    }
    setBatchActing(false);
    setSelectedIds(new Set());
    await refreshList(true);
  };

  const runBatchReject = async () => {
    const ids = Array.from(selectedIds);
    const reason = batchRejectReason.trim();
    if (ids.length === 0 || !reason) return;
    setBatchActing(true);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    for (const id of ids) {
      const offer = pending.find((o) => o.id === id);
      await fetch('/api/admin/moderate-offer', { method: 'POST', headers, body: JSON.stringify({ id, status: 'rejected', reason }) });
      if (offer?.created_by) {
        await fetch('/api/reputation/increment-rejected', { method: 'POST', headers, body: JSON.stringify({ userId: offer.created_by }) }).catch(() => {});
      }
    }
    setBatchActing(false);
    setShowBatchReject(false);
    setBatchRejectReason('');
    setSelectedIds(new Set());
    await refreshList(true);
  };

  const runBatchExpire = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBatchActing(true);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    for (const id of ids) {
      await fetch('/api/admin/expire-offer', { method: 'POST', headers, body: JSON.stringify({ offerId: id }) });
    }
    setBatchActing(false);
    setSelectedIds(new Set());
    await refreshList(true);
  };

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

  const storesInList = [...new Set(pending.map((o) => o.store).filter(Boolean))] as string[];

  const filtered = pending.filter((o) => {
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      if (
        !o.title?.toLowerCase().includes(q) &&
        !o.store?.toLowerCase().includes(q) &&
        !o.profiles?.display_name?.toLowerCase().includes(q)
      ) return false;
    }
    if (storeFilter && o.store !== storeFilter) return false;
    if (categoryFilter && (o.category ?? '') !== categoryFilter) return false;
    if (riskHighOnly && (o.risk_score == null || o.risk_score <= 50)) return false;
    if (dateFrom) {
      const d = new Date(o.created_at).toISOString().slice(0, 10);
      if (d < dateFrom) return false;
    }
    if (dateTo) {
      const d = new Date(o.created_at).toISOString().slice(0, 10);
      if (d > dateTo) return false;
    }
    return true;
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-1">
        Ofertas pendientes
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Revisa cada oferta. Si está bien → Aprobar. Si no cumple → Rechazar.
      </p>

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
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
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 px-3 py-2 min-w-0 max-w-[160px]"
            title="Filtrar por tienda"
          >
            <option value="">Todas las tiendas</option>
            {storesInList.sort().map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 px-3 py-2 min-w-0 max-w-[140px]"
            title="Filtrar por categoría"
          >
            {CATEGORY_OPTIONS.map(({ value, label }) => (
              <option key={value || 'all'} value={value}>{label}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
            title="Desde fecha"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
            title="Hasta fecha"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={riskHighOnly}
              onChange={(e) => setRiskHighOnly(e.target.checked)}
              className="rounded border-gray-400 text-amber-500 focus:ring-amber-500"
            />
            <span>Risk alto</span>
          </label>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {filtered.length} de {pending.length} pendientes
          </span>
        </div>

        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 py-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {selectedIds.size >= filtered.length ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {selectedIds.size >= filtered.length ? 'Quitar todas' : 'Seleccionar todas'}
            </button>
            {selectedIds.size > 0 && (
              <>
                <span className="text-sm text-gray-500 dark:text-gray-400">{selectedIds.size} seleccionadas</span>
                <button
                  type="button"
                  onClick={runBatchApprove}
                  disabled={batchActing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() => setShowBatchReject(true)}
                  disabled={batchActing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  Rechazar
                </button>
                <button
                  type="button"
                  onClick={runBatchExpire}
                  disabled={batchActing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  <Clock className="h-4 w-4" />
                  Marcar expiradas
                </button>
              </>
            )}
          </div>
        )}

        {showBatchReject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !batchActing && setShowBatchReject(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-5 max-w-md w-full border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Rechazar {selectedIds.size} ofertas</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Motivo (obligatorio para todas):</p>
              <input
                type="text"
                value={batchRejectReason}
                onChange={(e) => setBatchRejectReason(e.target.value)}
                placeholder="Ej: No cumple normas, duplicada..."
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 mb-4"
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowBatchReject(false)} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">Cancelar</button>
                <button type="button" onClick={runBatchReject} disabled={!batchRejectReason.trim() || batchActing} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Rechazar</button>
              </div>
            </div>
          </div>
        )}
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
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              batchMode
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ModerationOfferCardWithSimilar({
  offer,
  selectedIds,
  onToggleSelect,
  batchMode,
  ...props
}: {
  offer: ModerationOffer;
  status: 'pending';
  onApprove: (id: string, createdBy?: string | null) => void;
  onReject: (id: string, reason?: string) => void;
  actingId: string | null;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  batchMode?: boolean;
}) {
  const similarOffers = useSimilarOffers(offer.store, offer.title, offer.offer_url);
  return (
    <li>
      <ModerationOfferCard
        offer={offer}
        similarOffers={similarOffers}
        selected={selectedIds?.has(offer.id)}
        onToggleSelect={onToggleSelect ? () => onToggleSelect(offer.id) : undefined}
        batchMode={batchMode}
        {...props}
      />
    </li>
  );
}
