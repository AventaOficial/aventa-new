'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { Search, CheckSquare, Square, Clock, Check, X } from 'lucide-react';
import ModerationOfferCard from '../components/ModerationOfferCard';
import ModerationObjectivesSidebar from '../components/ModerationObjectivesSidebar';

import { ALL_CATEGORIES } from '@/lib/categories';
import { MODERATION_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';

const CATEGORY_OPTIONS = [
  { value: '', label: 'Todas' },
  ...ALL_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
];

type ModerationOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  category?: string | null;
  bank_coupon?: string | null;
  coupons?: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  offer_url: string | null;
  description?: string | null;
  steps?: unknown;
  conditions?: string | null;
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
        'id, title, price, original_price, store, category, bank_coupon, coupons, image_url, image_urls, offer_url, description, steps, conditions, created_at, created_by, risk_score, moderator_comment, profiles:public_profiles_view!created_by(display_name, avatar_url)'
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
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) {
      setIsOwner(false);
      return;
    }
    const supabase = createClient();
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .then(({ data }) => {
        const roles = (data ?? []) as { role: string }[];
        setIsOwner(roles.some((r) => r.role === 'owner'));
        setIsAdmin(roles.some((r) => r.role === 'admin'));
      });
  }, [session?.user?.id]);

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
    reason?: string,
    modMessage?: string
  ) => {
    setActingId(id);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const body: { id: string; status: string; reason?: string; mod_message?: string } = { id, status };
    if (reason) body.reason = reason;
    if (status === 'approved' && modMessage?.trim()) body.mod_message = modMessage.trim();
    const res = await fetch('/api/admin/moderate-offer', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
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
  const canAdvancedModeration = isOwner || isAdmin;

  return (
    <div className="lg:grid lg:grid-cols-[1fr_minmax(260px,300px)] xl:grid-cols-[1fr_minmax(280px,320px)] lg:gap-8 lg:items-start">
      <div className="min-w-0">
      <header className="mb-6 rounded-2xl border border-violet-200/70 dark:border-violet-900/50 bg-gradient-to-br from-violet-50 via-white to-slate-50 dark:from-violet-950/40 dark:via-gray-900 dark:to-gray-900 px-5 py-6 md:px-8 md:py-7 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-1">
          Moderación
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          Cola de revisión
        </h1>
        <p className="text-sm md:text-[15px] text-gray-600 dark:text-gray-400 mt-2 max-w-2xl leading-relaxed">
          Prioriza coherencia precio–enlace, duplicados y categoría. Usa filtros, vista previa e historial por tarjeta.
          Los atajos de rechazo rellenan un motivo claro para el autor (siempre editable).
        </p>
        <div className="mt-4 rounded-xl border border-violet-100 dark:border-violet-900/40 bg-white/70 dark:bg-gray-900/50 px-4 py-3 text-left">
          <p className="text-xs font-semibold text-violet-800 dark:text-violet-200 mb-2">Checklist rápido (calidad y “vida” de la oferta)</p>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5 list-disc list-inside leading-relaxed">
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Enlace:</strong> abre, muestra el mismo producto y precio razonable.
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Duplicados:</strong> revisa el bloque ámbar; evita publicar la misma oferta dos veces.
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Categoría y tienda:</strong> coherente con el producto (afecta descubrimiento y ranking).
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Cupón / MSI:</strong> si el cazador los indicó, que cuadren con lo visible en tienda.
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Risk alto:</strong> filtro “Risk alto” primero cuando la cola crece.
            </li>
          </ul>
        </div>
      </header>

      <div className="mb-5 space-y-3 rounded-xl border border-gray-200/90 dark:border-gray-700/90 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-500/80" />
            <input
              type="search"
              placeholder="Buscar por título, tienda o autor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-none transition-shadow"
            />
          </div>
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 px-3 py-2.5 min-w-0 max-w-[160px]"
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
            className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 px-3 py-2.5 min-w-0 max-w-[140px]"
            title="Filtrar por categoría"
          >
            {CATEGORY_OPTIONS.map(({ value, label }) => (
              <option key={value || 'all'} value={value}>{label}</option>
            ))}
          </select>
          {canAdvancedModeration ? (
            <>
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
            </>
          ) : null}
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {filtered.length} de {pending.length} pendientes
          </span>
        </div>

        {canAdvancedModeration && filtered.length > 0 && (
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
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Mismo motivo para todas (obligatorio). Atajos:</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {MODERATION_REJECTION_PRESETS.map((r) => (
                  <button
                    key={r.short}
                    type="button"
                    onClick={() => setBatchRejectReason(r.full)}
                    className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/80 px-2 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-300 hover:border-violet-400"
                  >
                    {r.short}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={batchRejectReason}
                onChange={(e) => setBatchRejectReason(e.target.value)}
                placeholder="Motivo detallado para todas las seleccionadas…"
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
        <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 py-16 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" aria-hidden />
          Cargando cola…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gradient-to-b from-gray-50/80 to-white dark:from-gray-800/40 dark:to-gray-900 p-10 md:p-12 text-center">
          <p className="text-gray-600 dark:text-gray-400 text-[15px]">
            {pending.length === 0
              ? 'No hay ofertas pendientes. Buen trabajo.'
              : 'Ninguna coincide con los filtros. Prueba a limpiar la búsqueda.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-5">
          {filtered.map((offer) => (
            <ModerationOfferCardWithSimilar
              key={offer.id}
              offer={offer}
              status="pending"
              onApprove={(id, createdBy, modMessage) => setStatus(id, 'approved', createdBy, undefined, modMessage)}
              onReject={(id, reason) => setStatus(id, 'rejected', undefined, reason)}
              actingId={actingId}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              batchMode={canAdvancedModeration}
              onOfferUpdated={() => refreshList(true)}
            />
          ))}
        </ul>
      )}
      </div>

      <div className="mt-8 lg:mt-0">
        <ModerationObjectivesSidebar />
      </div>
    </div>
  );
}

function ModerationOfferCardWithSimilar({
  offer,
  selectedIds,
  onToggleSelect,
  batchMode,
  onOfferUpdated,
  ...props
}: {
  offer: ModerationOffer;
  status: 'pending';
  onApprove: (id: string, createdBy?: string | null, modMessage?: string) => void;
  onReject: (id: string, reason?: string) => void;
  actingId: string | null;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  batchMode?: boolean;
  onOfferUpdated?: () => void;
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
        onOfferUpdated={onOfferUpdated}
        {...props}
      />
    </li>
  );
}
