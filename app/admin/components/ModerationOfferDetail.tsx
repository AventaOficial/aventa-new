'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  ExternalLink,
  History,
  Maximize2,
  Pencil,
  Store,
  Tag,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { ALL_CATEGORIES, normalizeCategoryForStorage, isVitalCategory } from '@/lib/categories';
import { formatCupónBancarioDisplay, getBankCouponLabel } from '@/lib/bankCoupons';
import { MODERATION_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';
import { mergeOfferImageUrls } from '@/lib/offerPath';
import { profileSlugFromDisplayName } from '@/lib/profileSlug';

export type ModerationDetailOffer = {
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
  conditions?: string | null;
  created_at: string;
  created_by: string | null;
  risk_score?: number | null;
  moderator_comment?: string | null;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
  is_bot?: boolean;
};

type SimilarOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  created_at: string;
};

type ModLog = {
  id: string;
  action: string;
  reason: string | null;
  created_at: string;
  display_name?: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  approved: 'Aprobada',
  rejected: 'Rechazada',
  expired: 'Marcada expirada',
};

type Props = {
  offer: ModerationDetailOffer;
  onApprove: (
    id: string,
    createdBy?: string | null,
    modMessage?: string,
    offerHasUrl?: boolean
  ) => void;
  onReject: (id: string, reason?: string) => void;
  actingId: string | null;
  qualityCandidate?: boolean;
  similarOffers?: SimilarOffer[];
  onOfferUpdated?: () => void;
  onBack?: () => void;
};

function storeOpenLabel(store: string | null): string {
  const s = (store ?? '').toLowerCase();
  if (s.includes('mercado')) return 'Abrir en Mercado Libre';
  if (s.includes('amazon')) return 'Abrir en Amazon';
  return 'Abrir en la tienda';
}

export default function ModerationOfferDetail({
  offer,
  onApprove,
  onReject,
  actingId,
  qualityCandidate = false,
  similarOffers = [],
  onOfferUpdated,
  onBack,
}: Props) {
  const { session } = useAuth();
  const [imgBroken, setImgBroken] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showImageExpand, setShowImageExpand] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<ModLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState(offer.title);
  const [editOfferUrl, setEditOfferUrl] = useState(offer.offer_url ?? '');
  const [editDescription, setEditDescription] = useState(
    typeof offer.description === 'string' ? offer.description : ''
  );
  const [editImageUrl, setEditImageUrl] = useState(offer.image_url ?? '');
  const [editSaving, setEditSaving] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [modMessage, setModMessage] = useState('');
  const [linkConfirmed, setLinkConfirmed] = useState(false);

  const allPreviewImages = useMemo(
    () => mergeOfferImageUrls(offer.image_url, offer.image_urls ?? null),
    [offer.image_url, offer.image_urls]
  );

  useEffect(() => {
    setGalleryIndex(0);
    setImgBroken(false);
    setLinkConfirmed(false);
    setShowRejectInput(false);
    setRejectReason('');
    setModMessage('');
  }, [offer.id]);

  const authorName = offer.profiles?.display_name?.trim() || 'Usuario';
  const authorSlug =
    offer.created_by != null
      ? profileSlugFromDisplayName(offer.profiles?.display_name, offer.created_by)
      : '';

  const categoryLabel = useMemo(() => {
    const n = normalizeCategoryForStorage(offer.category ?? null);
    if (!n) return null;
    return ALL_CATEGORIES.find((c) => c.value === n)?.label ?? n;
  }, [offer.category]);

  const vital = isVitalCategory(offer.category ?? null);
  const bankCouponLabel = getBankCouponLabel(offer.bank_coupon);
  const isBotOffer =
    offer.is_bot === true ||
    (offer.moderator_comment ?? '').toLowerCase().includes('[bot-ingest]') ||
    (offer.description ?? '').toLowerCase().includes('ingesta automática (bot)');
  const discountPercent =
    offer.original_price != null && Number(offer.original_price) > Number(offer.price)
      ? Math.round(
          ((Number(offer.original_price) - Number(offer.price)) / Number(offer.original_price)) * 100
        )
      : 0;

  const heroSrc = !imgBroken ? allPreviewImages[galleryIndex] ?? allPreviewImages[0] : null;

  const fetchHistory = useCallback(() => {
    if (historyLogs.length > 0) {
      setShowHistory(true);
      return;
    }
    setHistoryLoading(true);
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    fetch(`/api/admin/moderation-logs?offerId=${encodeURIComponent(offer.id)}`, { headers })
      .then((r) => r.json())
      .then((data) => {
        setHistoryLogs(Array.isArray(data?.logs) ? data.logs : []);
        setShowHistory(true);
      })
      .catch(() => setHistoryLogs([]))
      .finally(() => setHistoryLoading(false));
  }, [offer.id, historyLogs.length, session?.access_token]);

  const handleReject = () => {
    if (rejectReason.trim()) {
      onReject(offer.id, rejectReason.trim());
      setShowRejectInput(false);
      setRejectReason('');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl glass-dark overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Revisión</p>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mt-0.5 text-sm text-violet-300 hover:underline lg:hidden"
            >
              ← Volver a la cola
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isBotOffer ? (
            <span className="rounded-md bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-200">Bot</span>
          ) : null}
          {qualityCandidate ? (
            <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
              Calidad
            </span>
          ) : null}
          {offer.risk_score != null && offer.risk_score > 50 ? (
            <span className="rounded-md bg-amber-500/25 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
              Risk {offer.risk_score}
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative aspect-[4/3] max-h-[320px] w-full bg-white/[0.04]">
          {heroSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroSrc}
                alt=""
                className="absolute inset-0 h-full w-full object-contain p-3"
                onError={() => setImgBroken(true)}
              />
              <button
                type="button"
                onClick={() => setShowImageExpand(true)}
                className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-black/75"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Ampliar
              </button>
              {allPreviewImages.length > 1 ? (
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1">
                  {allPreviewImages.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setGalleryIndex(i);
                        setImgBroken(false);
                      }}
                      className={`h-1.5 rounded-full ${i === galleryIndex ? 'w-3 bg-white' : 'w-1.5 bg-white/40'}`}
                      aria-label={`Imagen ${i + 1}`}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/35">
              <Store className="h-8 w-8 opacity-50" />
              <p className="text-sm">Sin foto</p>
              <p className="text-xs text-white/25">{offer.store ?? 'Tienda'}</p>
            </div>
          )}
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap gap-1.5">
            {categoryLabel ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/20 px-2 py-0.5 text-[11px] font-semibold text-violet-200">
                <Tag className="h-3 w-3 opacity-80" />
                {categoryLabel}
                {vital ? <span className="font-normal text-violet-300/80">· vital</span> : null}
              </span>
            ) : (
              <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/45">Sin categoría</span>
            )}
            {bankCouponLabel ? (
              <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-200">
                {formatCupónBancarioDisplay(bankCouponLabel)}
              </span>
            ) : null}
            {discountPercent > 0 ? (
              <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-100">
                {discountPercent}% off
              </span>
            ) : null}
          </div>

          <h2 className="text-xl font-semibold leading-snug text-white/90">{offer.title}</h2>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold tabular-nums text-emerald-300">
              ${Number(offer.price).toLocaleString('es-MX')}
            </span>
            {offer.original_price != null ? (
              <span className="text-sm tabular-nums text-white/35 line-through">
                ${Number(offer.original_price).toLocaleString('es-MX')}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/45">
            <span className="inline-flex items-center gap-1">
              <Store className="h-3.5 w-3.5" />
              {offer.store ?? '—'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(offer.created_at).toLocaleString('es-MX', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className="inline-flex items-center gap-1 min-w-0">
              <User className="h-3.5 w-3.5 shrink-0" />
              {authorSlug ? (
                <Link href={`/u/${authorSlug}`} className="truncate text-violet-300 hover:underline">
                  {authorName}
                </Link>
              ) : (
                <span className="truncate">{authorName}</span>
              )}
            </span>
          </div>

          {offer.offer_url?.trim() ? (
            <a
              href={offer.offer_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-400"
            >
              <ExternalLink className="h-4 w-4" />
              {storeOpenLabel(offer.store)}
            </a>
          ) : (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              Esta oferta no tiene URL de tienda.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setEditTitle(offer.title);
                setEditOfferUrl(offer.offer_url ?? '');
                setEditDescription(typeof offer.description === 'string' ? offer.description : '');
                setEditImageUrl(offer.image_url ?? '');
                setShowEdit(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/[0.04]"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
            <button
              type="button"
              onClick={fetchHistory}
              disabled={historyLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/[0.04] disabled:opacity-50"
            >
              <History className="h-4 w-4" />
              Historial
            </button>
          </div>

          {offer.moderator_comment?.trim() ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white/55">
              <span className="font-medium text-white/70">Nota ingest:</span> {offer.moderator_comment.trim()}
            </div>
          ) : null}

          {similarOffers.length > 0 ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
              <p className="font-medium">Posibles duplicados</p>
              <ul className="mt-1 space-y-1 text-amber-100/70">
                {similarOffers.slice(0, 3).map((s) => (
                  <li key={s.id} className="flex justify-between gap-3">
                    <span className="truncate" title={s.title}>
                      {s.title}
                    </span>
                    <span className="shrink-0 font-semibold">
                      ${Number(s.price).toLocaleString('es-MX')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-white/[0.06] bg-black/20 px-4 py-3 space-y-3">
        <div>
          <label className="text-[11px] text-white/40">Mensaje opcional al autor</label>
          <textarea
            placeholder="Ej: ¡Muy buena oferta! Ya está en el feed."
            value={modMessage}
            onChange={(e) => setModMessage(e.target.value.slice(0, 500))}
            rows={2}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/85 placeholder:text-white/25 outline-none focus:border-violet-400/50"
          />
        </div>
        {offer.offer_url?.trim() ? (
          <label className="flex cursor-pointer items-start gap-2 text-xs text-white/55">
            <input
              type="checkbox"
              checked={linkConfirmed}
              onChange={(e) => setLinkConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-white/20 text-emerald-500 focus:ring-emerald-500"
            />
            <span>
              Confirmé el producto en la tienda
              <span
                className="ml-1 text-white/30"
                title="Al aprobar, AVENTA aplica tracking de afiliado (ML tag/matt, Amazon, etc.) según env."
              >
                (?)
              </span>
            </span>
          </label>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              onApprove(
                offer.id,
                offer.created_by,
                modMessage.trim() || undefined,
                Boolean(offer.offer_url?.trim())
              )
            }
            disabled={actingId === offer.id || (Boolean(offer.offer_url?.trim()) && !linkConfirmed)}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Aprobar
          </button>
          <button
            type="button"
            onClick={() => setShowRejectInput((v) => !v)}
            disabled={actingId === offer.id}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            Rechazar
          </button>
        </div>
        {showRejectInput ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {MODERATION_REJECTION_PRESETS.map((r) => (
                <button
                  key={r.short}
                  type="button"
                  onClick={() => setRejectReason(r.full)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/70 hover:border-violet-400/40"
                >
                  {r.short}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Motivo (obligatorio)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleReject();
                  if (e.key === 'Escape') {
                    setShowRejectInput(false);
                    setRejectReason('');
                  }
                }}
                className="min-w-[160px] flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/85 outline-none focus:border-violet-400/50"
                autoFocus
              />
              <button
                type="button"
                onClick={handleReject}
                disabled={actingId === offer.id || !rejectReason.trim()}
                className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {showHistory ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-auto rounded-2xl glass-dark border border-white/10 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white/90">Historial</h3>
              <button type="button" onClick={() => setShowHistory(false)} className="rounded p-1 hover:bg-white/10" aria-label="Cerrar">
                <X className="h-5 w-5 text-white/70" />
              </button>
            </div>
            {historyLogs.length === 0 ? (
              <p className="text-sm text-white/40">Aún no hay acciones.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {historyLogs.map((log) => (
                  <li key={log.id} className="border-b border-white/[0.06] py-2 last:border-0">
                    <span className="font-medium text-white/85">{ACTION_LABELS[log.action] ?? log.action}</span>
                    <span className="ml-2 text-white/40">{new Date(log.created_at).toLocaleString('es-MX')}</span>
                    {log.reason ? <p className="text-white/45">Motivo: {log.reason}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {showImageExpand && heroSrc ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4"
          onClick={() => setShowImageExpand(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Escape' && setShowImageExpand(false)}
          aria-label="Cerrar imagen"
        >
          <button
            type="button"
            onClick={() => setShowImageExpand(false)}
            className="absolute right-4 top-4 rounded-full p-2 text-white hover:bg-white/10"
            aria-label="Cerrar"
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroSrc} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}

      {showEdit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowEdit(false)}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl glass-dark border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-white/[0.06] bg-[#0c0c0e]/95 px-4 py-3">
              <h3 className="text-lg font-semibold text-white/90">Editar oferta</h3>
              <button type="button" onClick={() => setShowEdit(false)} className="rounded p-1 hover:bg-white/10" aria-label="Cerrar">
                <X className="h-5 w-5 text-white/70" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="mb-1 block text-sm text-white/60">Título</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value.slice(0, 500))}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/90"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-white/60">URL</label>
                <input
                  type="url"
                  value={editOfferUrl}
                  onChange={(e) => setEditOfferUrl(e.target.value.slice(0, 2048))}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm text-white/90"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-white/60">Descripción</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value.slice(0, 2000))}
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/90"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-white/60">Imagen (URL)</label>
                <input
                  type="url"
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value.slice(0, 2048))}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm text-white/90"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={async () => {
                    setEditSaving(true);
                    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
                    const res = await fetch('/api/admin/update-offer', {
                      method: 'PATCH',
                      headers,
                      body: JSON.stringify({
                        id: offer.id,
                        title: editTitle.trim() || undefined,
                        offer_url: editOfferUrl.trim() || undefined,
                        description: editDescription.trim() || undefined,
                        image_url: editImageUrl.trim() || undefined,
                      }),
                    });
                    setEditSaving(false);
                    if (!res.ok) return;
                    setShowEdit(false);
                    onOfferUpdated?.();
                  }}
                  className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-50"
                >
                  {editSaving ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
