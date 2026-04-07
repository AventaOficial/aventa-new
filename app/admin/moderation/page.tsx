'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { Search, CheckSquare, Square, Clock, Check, X, Trash2 } from 'lucide-react';
import { MODERATION_DELETE_BOT_CONFIRM_PHRASE } from '@/lib/moderation/deleteBotQueue';
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
  moderator_comment?: string | null;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
  /** Resuelto en servidor (IDs de usuario bot + marcadores en comentario/descripción). */
  is_bot?: boolean;
};

function getOfferDiscountPercent(offer: ModerationOffer): number {
  const price = Number(offer.price ?? 0);
  const original = Number(offer.original_price ?? 0);
  if (!Number.isFinite(price) || !Number.isFinite(original)) return 0;
  if (original <= 0 || original <= price) return 0;
  return Math.round(((original - price) / original) * 100);
}

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

  const refreshList = useCallback(
    (skipLoading = false) => {
      if (!skipLoading) setLoading(true);
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      return fetch('/api/admin/moderation-pending-offers', { headers })
        .then(async (res) => {
          if (!skipLoading) setLoading(false);
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error('Error refreshing:', err?.error ?? res.status);
            return;
          }
          const body = (await res.json()) as { offers?: Record<string, unknown>[] };
          const rows = body.offers ?? [];
          setPending(
            rows.map((r) => ({
              ...r,
              is_bot: Boolean((r as { is_bot?: boolean }).is_bot),
              profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
            })) as ModerationOffer[]
          );
          setSelectedIds(new Set());
        })
        .catch((e) => {
          if (!skipLoading) setLoading(false);
          console.error('Error refreshing:', e);
        });
    },
    [session?.access_token]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchRejectReason, setBatchRejectReason] = useState('');
  const [showBatchReject, setShowBatchReject] = useState(false);
  const [batchActing, setBatchActing] = useState(false);
  const [storeFilter, setStoreFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [riskHighOnly, setRiskHighOnly] = useState(false);
  const [onlyBot, setOnlyBot] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showDeleteBotModal, setShowDeleteBotModal] = useState(false);
  const [deleteBotPhrase, setDeleteBotPhrase] = useState('');
  const [deleteBotAck, setDeleteBotAck] = useState(false);
  const [deleteBotLoading, setDeleteBotLoading] = useState(false);

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
      await fetch('/api/admin/moderate-offer', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, status: 'approved', batch_approve: true }),
      });
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

  const runDeleteAllBotPending = async () => {
    if (deleteBotPhrase.trim() !== MODERATION_DELETE_BOT_CONFIRM_PHRASE || !deleteBotAck) return;
    setDeleteBotLoading(true);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    try {
      const res = await fetch('/api/admin/moderation-delete-bot-pending', {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirmPhrase: deleteBotPhrase.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data?.error === 'string' ? data.error : 'No se pudo eliminar la cola del bot');
        return;
      }
      setShowDeleteBotModal(false);
      setDeleteBotPhrase('');
      setDeleteBotAck(false);
      setSelectedIds(new Set());
      await refreshList(true);
      if (typeof data?.deleted === 'number' && data.deleted > 0) {
        alert(`Se eliminaron ${data.deleted} oferta(s) pendientes del bot.`);
      }
    } finally {
      setDeleteBotLoading(false);
    }
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
    const normalizeAndRefresh = async () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      await fetch('/api/admin/moderation-normalize-links', {
        method: 'POST',
        headers,
        body: JSON.stringify({ limit: 250 }),
      }).catch(() => {});
      await refreshList(false);
    };
    void normalizeAndRefresh();

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshList(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pathname, refreshList, session?.access_token]);

  const setStatus = async (
    id: string,
    status: 'approved' | 'rejected',
    createdBy?: string | null,
    reason?: string,
    modMessage?: string,
    /** Si la oferta tiene URL, el moderador debe haber marcado la casilla; se envía link_mod_ok al API. */
    offerHasUrl?: boolean
  ) => {
    setActingId(id);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const body: { id: string; status: string; reason?: string; mod_message?: string; link_mod_ok?: boolean } = {
      id,
      status,
    };
    if (reason) body.reason = reason;
    if (status === 'approved' && modMessage?.trim()) body.mod_message = modMessage.trim();
    if (status === 'approved' && offerHasUrl) body.link_mod_ok = true;
    const res = await fetch('/api/admin/moderate-offer', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    setActingId(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Error updating offer', err);
      alert(typeof err?.error === 'string' ? err.error : 'No se pudo actualizar la oferta');
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

  const isBotOffer = (o: ModerationOffer) =>
    o.is_bot === true ||
    (o.moderator_comment ?? '').toLowerCase().includes('[bot-ingest]') ||
    (o.description ?? '').toLowerCase().includes('ingesta automática (bot)');

  const isQualityCandidate = (o: ModerationOffer) => {
    const hasUrl = Boolean(o.offer_url?.trim());
    const hasImage = Boolean(o.image_url?.trim());
    const hasPrice = Number(o.price ?? 0) > 0;
    const hasContext = Boolean(
      (o.description ?? '').trim() || (o.conditions ?? '').trim() || (o.coupons ?? '').trim()
    );
    const saneDiscount =
      o.original_price == null ||
      (Number(o.original_price) > Number(o.price) &&
        ((Number(o.original_price) - Number(o.price)) / Number(o.original_price)) * 100 >= 5);
    return hasUrl && hasImage && hasPrice && hasContext && saneDiscount;
  };

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
    if (onlyBot && !isBotOffer(o)) return false;
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
  const botFiltered = [...filtered]
    .filter((o) => isBotOffer(o))
    .sort((a, b) => {
      const aFree = Number(a.price ?? 0) <= 0 ? 1 : 0;
      const bFree = Number(b.price ?? 0) <= 0 ? 1 : 0;
      if (aFree !== bFree) return bFree - aFree; // gratis primero
      const aDiscount = getOfferDiscountPercent(a);
      const bDiscount = getOfferDiscountPercent(b);
      if (aDiscount !== bDiscount) return bDiscount - aDiscount; // mayor % primero
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  const userFiltered = filtered.filter((o) => !isBotOffer(o));

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const qualityToday = pending.filter((o) => isQualityCandidate(o) && new Date(o.created_at).getTime() >= startOfDay).length;
  const qualityWeek = pending.filter((o) => isQualityCandidate(o) && new Date(o.created_at).getTime() >= weekAgo).length;
  const botPending = pending.filter((o) => isBotOffer(o)).length;

  return (
    <div className="lg:grid lg:grid-cols-[1fr_minmax(260px,300px)] xl:grid-cols-[1fr_minmax(280px,320px)] lg:gap-8 lg:items-start">
      <div className="min-w-0">
      <header className="mb-6 rounded-[28px] border border-violet-200/70 dark:border-violet-900/50 bg-linear-to-br from-violet-50 via-white to-slate-50 dark:from-violet-950/40 dark:via-[#151517] dark:to-[#101012] px-5 py-6 md:px-8 md:py-7 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
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
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Al entrar a esta vista, el sistema normaliza automáticamente enlaces pendientes con tracking de afiliado de plataforma.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/35 text-emerald-800 dark:text-emerald-200 px-2.5 py-1 font-medium">
            Calidad hoy: {qualityToday}
          </span>
          <span className="rounded-full bg-violet-100 dark:bg-violet-900/35 text-violet-800 dark:text-violet-200 px-2.5 py-1 font-medium">
            Calidad 7 días: {qualityWeek}
          </span>
          <span className="rounded-full bg-sky-100 dark:bg-sky-900/35 text-sky-800 dark:text-sky-200 px-2.5 py-1 font-medium">
            Pendientes del bot: {botPending}
          </span>
        </div>
        <div className="mt-4 rounded-3xl border border-violet-100 dark:border-violet-900/40 bg-white/80 dark:bg-[#141414]/50 px-4 py-4 text-left">
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

      <div className="mb-5 space-y-3 rounded-[28px] border border-gray-200/90 dark:border-gray-700/90 bg-white/90 dark:bg-[#141414]/90 backdrop-blur-sm p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-500/80" />
            <input
              type="search"
              placeholder="Buscar por título, tienda o autor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-[#1a1a1a]/80 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-none transition-shadow"
            />
          </div>
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] text-sm text-gray-900 dark:text-gray-100 px-3 py-2.5 min-w-0 max-w-[160px]"
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
            className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] text-sm text-gray-900 dark:text-gray-100 px-3 py-2.5 min-w-0 max-w-[140px]"
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
                className="rounded-2xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] text-sm text-gray-900 dark:text-gray-100 px-3 py-2.5"
                title="Desde fecha"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-2xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] text-sm text-gray-900 dark:text-gray-100 px-3 py-2.5"
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
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyBot}
                  onChange={(e) => setOnlyBot(e.target.checked)}
                  className="rounded border-gray-400 text-sky-500 focus:ring-sky-500"
                />
                <span>Solo bot</span>
              </label>
            </>
          ) : null}
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {filtered.length} de {pending.length} pendientes · Bot: {botFiltered.length} · Usuarios: {userFiltered.length}
          </span>
        </div>

        {canAdvancedModeration && filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 py-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-transform active:scale-95"
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
                  className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-transform active:scale-95"
                  title="No marca verificación de enlace; conviene revisar ofertas con URL una a una."
                >
                  <Check className="h-4 w-4" />
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() => setShowBatchReject(true)}
                  disabled={batchActing}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-transform active:scale-95"
                >
                  <X className="h-4 w-4" />
                  Rechazar
                </button>
                <button
                  type="button"
                  onClick={runBatchExpire}
                  disabled={batchActing}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-transform active:scale-95"
                >
                  <Clock className="h-4 w-4" />
                  Marcar expiradas
                </button>
              </>
            )}
          </div>
        )}

        {showDeleteBotModal && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60"
            onClick={() => !deleteBotLoading && setShowDeleteBotModal(false)}
          >
            <div
              className="bg-white dark:bg-[#1a1a1a] rounded-[28px] shadow-xl p-5 max-w-lg w-full border border-red-200 dark:border-red-900/50"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-1">Vaciar cola del bot (irreversible)</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Se eliminarán de la base de datos todas las ofertas <strong>pendientes</strong> creadas por los usuarios del bot
                (según <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">BOT_INGEST_USER_ID*</code>).
                No afecta ofertas de usuarios reales. Solo owner/admin.
              </p>
              <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteBotAck}
                  onChange={(e) => setDeleteBotAck(e.target.checked)}
                  className="mt-1 rounded border-gray-400 text-red-600 focus:ring-red-500"
                />
                <span>Entiendo que esta acción no se puede deshacer y solo quiero borrar la cola del bot.</span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Escribe exactamente (mayúsculas):{' '}
                <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">{MODERATION_DELETE_BOT_CONFIRM_PHRASE}</code>
              </p>
              <input
                type="text"
                value={deleteBotPhrase}
                onChange={(e) => setDeleteBotPhrase(e.target.value)}
                autoComplete="off"
                placeholder="Frase de confirmación…"
                className="w-full rounded-2xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 mb-4 font-mono"
              />
              <div className="flex gap-2 justify-end flex-wrap">
                <button
                  type="button"
                  onClick={() => !deleteBotLoading && setShowDeleteBotModal(false)}
                  className="rounded-full border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void runDeleteAllBotPending()}
                  disabled={
                    deleteBotLoading ||
                    !deleteBotAck ||
                    deleteBotPhrase.trim() !== MODERATION_DELETE_BOT_CONFIRM_PHRASE
                  }
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {deleteBotLoading ? (
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Eliminar todas (bot)
                </button>
              </div>
            </div>
          </div>
        )}

        {showBatchReject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !batchActing && setShowBatchReject(false)}>
            <div className="bg-white dark:bg-[#1a1a1a] rounded-[28px] shadow-xl p-5 max-w-md w-full border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Rechazar {selectedIds.size} ofertas</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Mismo motivo para todas (obligatorio). Atajos:</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {MODERATION_REJECTION_PRESETS.map((r) => (
                  <button
                    key={r.short}
                    type="button"
                    onClick={() => setBatchRejectReason(r.full)}
                    className="rounded-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/80 px-3 py-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-300 hover:border-violet-400"
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
                className="w-full rounded-2xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 mb-4"
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowBatchReject(false)} className="rounded-full border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">Cancelar</button>
                <button type="button" onClick={runBatchReject} disabled={!batchRejectReason.trim() || batchActing} className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">Rechazar</button>
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
        <div className="rounded-[28px] border border-gray-200 dark:border-gray-700 bg-linear-to-b from-gray-50/80 to-white dark:from-gray-800/40 dark:to-gray-900 p-10 md:p-12 text-center">
          <p className="text-gray-600 dark:text-gray-400 text-[15px]">
            {pending.length === 0
              ? 'No hay ofertas pendientes. Buen trabajo.'
              : 'Ninguna coincide con los filtros. Prueba a limpiar la búsqueda.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
          <section className="rounded-[28px] border border-gray-200/80 dark:border-gray-700/80 bg-white/70 dark:bg-[#141414]/70 p-3 md:p-4 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm md:text-base font-semibold text-gray-800 dark:text-gray-200">
                Ofertas de usuarios
              </h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{userFiltered.length} en cola</span>
            </div>
            {userFiltered.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                Sin ofertas de usuarios en esta vista.
              </p>
            ) : (
              <ul className="space-y-4">
                {userFiltered.map((offer) => (
                  <ModerationOfferCardWithSimilar
                    key={offer.id}
                    offer={offer}
                    status="pending"
                    onApprove={(id, createdBy, modMessage, offerHasUrl) => {
                      void setStatus(id, 'approved', createdBy, undefined, modMessage, offerHasUrl);
                    }}
                    onReject={(id, reason) => setStatus(id, 'rejected', undefined, reason)}
                    actingId={actingId}
                    qualityCandidate={isQualityCandidate(offer)}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    batchMode={canAdvancedModeration}
                    onOfferUpdated={() => refreshList(true)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[28px] border border-sky-200/80 dark:border-sky-800/60 bg-sky-50/40 dark:bg-sky-950/20 p-3 md:p-4 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm md:text-base font-semibold text-sky-800 dark:text-sky-200">
                Ofertas del bot
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-sky-700 dark:text-sky-300 font-medium">{botFiltered.length} en cola</span>
                {canAdvancedModeration && botFiltered.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteBotPhrase('');
                      setDeleteBotAck(false);
                      setShowDeleteBotModal(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-red-300 dark:border-red-800 bg-white/90 dark:bg-red-950/30 px-3 py-1.5 text-[11px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Vaciar cola del bot
                  </button>
                ) : null}
              </div>
            </div>
            <p className="text-[11px] text-sky-800/80 dark:text-sky-300/90 mb-3">
              Prioridad: gratis primero, luego mayor % de descuento.
            </p>
            {botFiltered.length === 0 ? (
              <p className="text-sm text-sky-700/80 dark:text-sky-400/90 py-6 text-center border border-dashed border-sky-200 dark:border-sky-800 rounded-2xl">
                Sin ofertas del bot en esta vista.
              </p>
            ) : (
              <ul className="space-y-4">
                {botFiltered.map((offer) => (
                  <ModerationOfferCardWithSimilar
                    key={offer.id}
                    offer={offer}
                    status="pending"
                    onApprove={(id, createdBy, modMessage, offerHasUrl) => {
                      void setStatus(id, 'approved', createdBy, undefined, modMessage, offerHasUrl);
                    }}
                    onReject={(id, reason) => setStatus(id, 'rejected', undefined, reason)}
                    actingId={actingId}
                    qualityCandidate={isQualityCandidate(offer)}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    batchMode={canAdvancedModeration}
                    onOfferUpdated={() => refreshList(true)}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
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
  qualityCandidate,
  onOfferUpdated,
  ...props
}: {
  offer: ModerationOffer;
  status: 'pending';
  onApprove: (
    id: string,
    createdBy?: string | null,
    modMessage?: string,
    offerHasUrl?: boolean
  ) => void;
  onReject: (id: string, reason?: string) => void;
  actingId: string | null;
  qualityCandidate?: boolean;
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
        qualityCandidate={qualityCandidate}
        onOfferUpdated={onOfferUpdated}
        {...props}
      />
    </li>
  );
}
