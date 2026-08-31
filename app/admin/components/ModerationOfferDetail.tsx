'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  ExternalLink,
  History,
  Lock,
  Pencil,
  Store,
  Tag,
  User,
  X,
  Save,
  Clock,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { ALL_CATEGORIES, normalizeCategoryForStorage, isVitalCategory } from '@/lib/categories';
import { inferOfferCategory } from '@/lib/offers/inferOfferCategory';
import { formatCupónBancarioDisplay, getBankCouponLabel } from '@/lib/bankCoupons';
import { MODERATION_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';
import { initialAffiliatePasteUi } from '@/lib/moderation/affiliatePasteUi';
import { mergeOfferImageUrls, normalizeOfferImageUrl } from '@/lib/offerPath';
import { profileSlugFromDisplayName } from '@/lib/profileSlug';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '../moderation/moderationUi';
import ModerationConfidenceChip from './ModerationConfidenceChip';
import ModerationBotFactsCard from './ModerationBotFactsCard';
import ModerationChecklist from './ModerationChecklist';
import ModerationImageGallery from './ModerationImageGallery';
import { isOfferLockedByOther } from '@/lib/moderation/moderationLock';
import { buildModerationChecklist, countChecklistBlockers } from '@/lib/moderation/botFacts';
import { validateAffiliatePaste, type AffiliatePasteValidation } from '@/lib/affiliate/validateAffiliatePaste';
import { offerRequiresAffiliateValidation } from '@/lib/moderation/approveReadiness';
import type { ModerationLevel } from '@/lib/moderation/classifyModerationLevel';
import { MODERATION_LEVEL_LABELS } from '@/lib/moderation/classifyModerationLevel';

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
  bot_meta?: unknown;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
  is_bot?: boolean;
  locked_by?: string | null;
  locked_at?: string | null;
  locked_by_name?: string | null;
  snoozed_until?: string | null;
  link_mod_ok?: boolean | null;
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
  qualityCandidate?: boolean;
  similarOffers?: SimilarOffer[];
  onOfferUpdated?: () => void;
  onBack?: () => void;
  mode?: ModerationHubMode;
  currentUserId?: string | null;
  /** URL original al abrir la oferta (botón Ver producto). */
  productOriginalUrl?: string | null;
  moderationLevel?: ModerationLevel;
  queueLabel?: string | null;
  onAffiliateReadyChange?: (ready: boolean) => void;
  /** @deprecated Mobile legacy — desktop usa validación de paste */
  linkConfirmed?: boolean;
  onLinkConfirmedChange?: (confirmed: boolean) => void;
  onSnooze?: (minutes: 15 | 60 | 240) => void;
  requestReject?: boolean;
  onRequestRejectHandled?: () => void;
  /** Error de Aprobar/Rechazar junto a la barra de acciones. */
  actionError?: string | null;
  onClearActionError?: () => void;
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
  qualityCandidate = false,
  similarOffers = [],
  onOfferUpdated,
  onBack,
  mode = 'admin',
  currentUserId = null,
  productOriginalUrl = null,
  moderationLevel = 'sprint',
  queueLabel = null,
  onAffiliateReadyChange,
  linkConfirmed: linkConfirmedProp,
  onLinkConfirmedChange,
  onSnooze,
  requestReject = false,
  onRequestRejectHandled,
  actionError = null,
  onClearActionError,
}: Props) {
  const ui = moderationUi(mode);
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
  const [editCategory, setEditCategory] = useState(offer.category ?? '');
  const [editSaving, setEditSaving] = useState(false);
  const [botImageUrl, setBotImageUrl] = useState(offer.image_url ?? '');
  const [botOfferUrl, setBotOfferUrl] = useState(offer.offer_url ?? '');
  const [botCategory, setBotCategory] = useState(offer.category ?? '');
  const [botQuickSaving, setBotQuickSaving] = useState(false);
  const [botQuickMsg, setBotQuickMsg] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [modMessage, setModMessage] = useState('');
  const [internalLinkConfirmed, setInternalLinkConfirmed] = useState(false);
  const [snoozeLoading, setSnoozeLoading] = useState<number | null>(null);
  const [affiliatePaste, setAffiliatePaste] = useState('');
  const [pasteStatus, setPasteStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [pasteValidation, setPasteValidation] = useState<AffiliatePasteValidation | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [showSecondary, setShowSecondary] = useState(false);
  const botImageInputRef = useRef<HTMLInputElement>(null);
  const botUrlInputRef = useRef<HTMLInputElement>(null);
  const botCategoryRef = useRef<HTMLSelectElement>(null);
  const affiliatePasteRef = useRef<HTMLInputElement>(null);
  const pasteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkConfirmed = linkConfirmedProp ?? internalLinkConfirmed;
  const setLinkConfirmed = onLinkConfirmedChange ?? setInternalLinkConfirmed;

  const originalProductUrl = (productOriginalUrl ?? offer.offer_url ?? '').trim();
  const requiresAffiliate = offerRequiresAffiliateValidation(originalProductUrl);
  const affiliateReady =
    offer.link_mod_ok === true ||
    pasteStatus === 'valid' ||
    (!requiresAffiliate && Boolean(offer.offer_url?.trim()));

  const readOnly = isOfferLockedByOther(
    { locked_by: offer.locked_by, locked_at: offer.locked_at },
    currentUserId
  );
  const lockerLabel = offer.locked_by_name?.trim() || 'Otro moderador';

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
    setBotImageUrl(offer.image_url ?? '');
    setBotOfferUrl(offer.offer_url ?? '');
    setBotCategory(offer.category ?? '');
    setBotQuickMsg(null);
    const pasteUi = initialAffiliatePasteUi(offer.link_mod_ok);
    setAffiliatePaste(pasteUi.affiliatePaste);
    setPasteStatus(pasteUi.pasteStatus);
    setPasteValidation(pasteUi.pasteValidation);
    setPasteError(pasteUi.pasteError);
    setShowSecondary(moderationLevel !== 'sprint');
  }, [offer.id, offer.image_url, offer.offer_url, offer.category, offer.link_mod_ok, moderationLevel]);

  useEffect(() => {
    onAffiliateReadyChange?.(affiliateReady);
  }, [affiliateReady, onAffiliateReadyChange]);

  useEffect(() => {
    if (!requestReject || readOnly) return;
    setShowRejectInput(true);
    onRequestRejectHandled?.();
  }, [requestReject, readOnly, onRequestRejectHandled]);

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

  const suggestedCategory = useMemo(() => {
    if (normalizeCategoryForStorage(offer.category ?? null)) return null;
    return inferOfferCategory({
      title: offer.title,
      breadcrumbs: offer.store ? [offer.store] : undefined,
    });
  }, [offer.title, offer.store, offer.category]);

  const suggestedCategoryLabel = useMemo(() => {
    if (!suggestedCategory) return null;
    return ALL_CATEGORIES.find((c) => c.value === suggestedCategory)?.label ?? suggestedCategory;
  }, [suggestedCategory]);

  const previewCategory = botCategory.trim() || offer.category || '';
  const previewCategoryNorm = normalizeCategoryForStorage(previewCategory || null);
  const previewCategoryLabel = previewCategoryNorm
    ? ALL_CATEGORIES.find((c) => c.value === previewCategoryNorm)?.label ?? previewCategoryNorm
    : null;
  const previewVital = isVitalCategory(previewCategoryNorm);

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

  const saveBotQuickFix = async () => {
    setBotQuickSaving(true);
    setBotQuickMsg(null);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const body: Record<string, unknown> = { id: offer.id };
    if (botImageUrl.trim() !== (offer.image_url ?? '')) {
      body.image_url = botImageUrl.trim();
    }
    if (botOfferUrl.trim() !== (offer.offer_url ?? '')) {
      body.offer_url = botOfferUrl.trim();
    }
    const normCat = normalizeCategoryForStorage(botCategory);
    const prevCat = normalizeCategoryForStorage(offer.category ?? null);
    if (normCat !== prevCat) {
      body.category = normCat ?? '';
    }
    if (Object.keys(body).length <= 1) {
      setBotQuickSaving(false);
      setBotQuickMsg('Sin cambios');
      return;
    }
    const res = await fetch('/api/admin/update-offer', { method: 'PATCH', headers, body: JSON.stringify(body) });
    setBotQuickSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setBotQuickMsg(typeof err?.error === 'string' ? err.error : 'Error al guardar');
      return;
    }
    setBotQuickMsg('Guardado');
    setImgBroken(false);
    onOfferUpdated?.();
  };

  const applyNormalizedImage = () => {
    const n = normalizeOfferImageUrl(botImageUrl);
    if (n) setBotImageUrl(n);
  };

  const checklist = useMemo(
    () =>
      buildModerationChecklist({
        title: offer.title,
        image_url: offer.image_url,
        image_urls: offer.image_urls,
        offer_url: offer.offer_url,
        category: offer.category,
      }),
    [offer.title, offer.image_url, offer.image_urls, offer.offer_url, offer.category]
  );
  const blockers = countChecklistBlockers(checklist);

  const feedDestination = previewVital
    ? `Día a día → ${previewCategoryLabel ?? 'Sin categoría'}`
    : previewCategoryLabel
      ? `Top / Recientes (${previewCategoryLabel})`
      : suggestedCategoryLabel
        ? `Sin categoría — sugerencia: ${suggestedCategoryLabel} → Top / Recientes`
        : 'Sin categoría — asignar antes de aprobar';

  const saveAffiliatePaste = useCallback(
    async (pasted: string) => {
      const trimmed = pasted.trim();
      if (!trimmed || !originalProductUrl) {
        setPasteStatus('idle');
        setPasteValidation(null);
        setPasteError(null);
        return;
      }
      setPasteStatus('validating');
      setPasteError(null);
      const local = validateAffiliatePaste(originalProductUrl, trimmed);
      if (!local.valid) {
        setPasteStatus('invalid');
        setPasteValidation(local);
        setPasteError(local.reason ?? 'El enlace no corresponde al producto');
        return;
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/admin/update-offer', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          id: offer.id,
          offer_url: trimmed,
          affiliate_paste: true,
          original_product_url: originalProductUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasteStatus('invalid');
        setPasteError(
          typeof data?.error === 'string' ? data.error : 'El enlace no corresponde al producto'
        );
        setPasteValidation(
          typeof data?.validation === 'object' ? (data.validation as AffiliatePasteValidation) : local
        );
        return;
      }
      setPasteStatus('valid');
      setPasteValidation(local);
      setPasteError(null);
      onOfferUpdated?.();
    },
    [offer.id, originalProductUrl, onOfferUpdated, session?.access_token]
  );

  const handleAffiliatePasteChange = (value: string) => {
    setAffiliatePaste(value.slice(0, 2048));
    if (pasteDebounceRef.current) clearTimeout(pasteDebounceRef.current);
    if (!value.trim()) {
      setPasteStatus(offer.link_mod_ok === true ? 'valid' : 'idle');
      setPasteValidation(null);
      setPasteError(null);
      return;
    }
    pasteDebounceRef.current = setTimeout(() => {
      void saveAffiliatePaste(value);
    }, 400);
  };

  const openOriginalProduct = () => {
    if (!originalProductUrl) return;
    window.open(originalProductUrl, '_blank', 'noopener,noreferrer');
  };

  const handleFix = (id: 'photo' | 'link' | 'affiliate' | 'category' | 'title') => {
    const targetId = id === 'affiliate' ? 'link' : id;
    if (id === 'title') {
      setEditTitle(offer.title);
      setEditOfferUrl(offer.offer_url ?? '');
      setEditDescription(typeof offer.description === 'string' ? offer.description : '');
      setEditImageUrl(offer.image_url ?? '');
      setEditCategory(offer.category ?? '');
      setShowEdit(true);
      return;
    }
    const target =
      targetId === 'photo'
        ? botImageInputRef.current
        : targetId === 'link'
          ? botUrlInputRef.current
          : botCategoryRef.current;
    target?.focus();
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${ui.card}`}>
      <div className={`flex items-center justify-between gap-2 border-b px-4 py-2.5 ${ui.hairline}`}>
        <div className="flex min-w-0 items-center gap-2">
          {queueLabel ? (
            <span className={`text-xs tabular-nums ${ui.muted}`}>{queueLabel}</span>
          ) : null}
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              moderationLevel === 'sprint'
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                : moderationLevel === 'review'
                  ? 'bg-amber-500/15 text-amber-900 dark:text-amber-100'
                  : 'bg-red-500/15 text-red-800 dark:text-red-200'
            }`}
          >
            {MODERATION_LEVEL_LABELS[moderationLevel]}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isBotOffer ? (
            <span className="rounded-md bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:text-sky-200">Bot</span>
          ) : null}
          <ModerationConfidenceChip offer={offer} mode={mode} size="sm" />
        </div>
      </div>

      {readOnly ? (
        <div className="flex items-center gap-2 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-950 dark:text-amber-100">
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            En revisión por <strong>{lockerLabel}</strong>. Solo lectura hasta que libere la oferta.
          </span>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-h-0 overflow-y-auto overscroll-contain border-b lg:border-b-0 lg:border-r border-white/[0.06] dark:border-white/[0.06]">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="px-4 pt-3 text-sm text-emerald-700 hover:underline dark:text-violet-300 lg:hidden"
            >
              ← Volver a la cola
            </button>
          ) : null}
        {heroSrc ? (
          <ModerationImageGallery
            images={allPreviewImages}
            index={galleryIndex}
            onIndexChange={(i) => {
              setGalleryIndex(i);
              setImgBroken(false);
            }}
            onImageError={() => setImgBroken(true)}
            heroBg={ui.heroBg}
            heroClassName="aspect-[4/3] max-h-[min(36vh,320px)] md:max-h-[min(42vh,380px)]"
            showExpand
            onExpand={() => setShowImageExpand(true)}
          />
        ) : isBotOffer ? (
          <ModerationBotFactsCard
            variant="hero"
            mode={mode}
            store={offer.store}
            botMeta={offer.bot_meta}
            moderatorComment={offer.moderator_comment}
            destination={feedDestination}
          />
        ) : (
          <div
            className={`flex flex-col items-center justify-center gap-1 border-b py-10 ${ui.hairline} ${ui.heroBg} ${ui.faint}`}
          >
            <Store className="h-8 w-8 opacity-50" />
            <p className="text-sm">Sin foto</p>
            <p className={`text-xs ${ui.muted}`}>{offer.store ?? 'Tienda'}</p>
          </div>
        )}

        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap gap-1.5">
            {categoryLabel ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:text-violet-200">
                <Tag className="h-3 w-3 opacity-80" />
                {categoryLabel}
                {vital ? <span className="font-normal opacity-80">· vital</span> : null}
              </span>
            ) : (
              <span className={`rounded-md px-2 py-0.5 text-[11px] ${ui.thumbBg} ${ui.muted}`}>Sin categoría</span>
            )}
            {bankCouponLabel ? (
              <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-800 dark:text-violet-200">
                {formatCupónBancarioDisplay(bankCouponLabel)}
              </span>
            ) : null}
            {discountPercent > 0 ? (
              <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-100">
                {discountPercent}% off
              </span>
            ) : null}
          </div>

          <h2 className={`text-xl font-semibold leading-snug ${ui.title}`}>{offer.title}</h2>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              ${Number(offer.price).toLocaleString('es-MX')}
            </span>
            {offer.original_price != null ? (
              <span className={`text-sm tabular-nums line-through ${ui.faint}`}>
                ${Number(offer.original_price).toLocaleString('es-MX')}
              </span>
            ) : null}
          </div>

          <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${ui.muted}`}>
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
            <span className="inline-flex min-w-0 items-center gap-1">
              <User className="h-3.5 w-3.5 shrink-0" />
              {authorSlug ? (
                <Link href={`/u/${authorSlug}`} className="truncate text-emerald-700 hover:underline dark:text-violet-300">
                  {authorName}
                </Link>
              ) : (
                <span className="truncate">{authorName}</span>
              )}
            </span>
          </div>

          {showSecondary && isBotOffer ? (
            <div className={`rounded-xl border px-3 py-3 space-y-3 ${ui.border} border-sky-500/30 bg-sky-500/5`}>
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm font-semibold ${ui.body}`}>Qué falta para publicar</p>
                <span
                  className={`shrink-0 text-[11px] font-semibold ${
                    blockers > 0
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {blockers > 0
                    ? `${blockers} pendiente${blockers > 1 ? 's' : ''}`
                    : 'Todo listo'}
                </span>
              </div>
              <ModerationChecklist
                mode={mode}
                items={checklist}
                onFix={handleFix}
                disabled={readOnly}
              />
              {heroSrc ? (
                <ModerationBotFactsCard
                  mode={mode}
                  store={offer.store}
                  botMeta={offer.bot_meta}
                  moderatorComment={offer.moderator_comment}
                  destination={feedDestination}
                />
              ) : null}
              <div>
                <label className={`mb-1 block text-[11px] ${ui.label}`}>Categoría del feed</label>
                <p className={`mb-1.5 text-[10px] leading-snug ${ui.muted}`}>
                  Tecnología y Gaming → Top / Recientes. Hogar, Súper, Moda… → Día a día.
                </p>
                <select
                  ref={botCategoryRef}
                  value={botCategory}
                  onChange={(e) => setBotCategory(e.target.value)}
                  className={`w-full px-3 py-2 text-sm ${ui.select}`}
                >
                  <option value="">Sin categoría</option>
                  {ALL_CATEGORIES.filter((c) => c.value !== 'other').map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                      {c.vital ? ' · Día a día' : ' · Top / Recientes'}
                    </option>
                  ))}
                </select>
                {suggestedCategoryLabel && !previewCategoryNorm ? (
                  <button
                    type="button"
                    className={`mt-1.5 text-[11px] font-medium text-sky-700 hover:underline dark:text-sky-300`}
                    onClick={() => setBotCategory(suggestedCategory ?? '')}
                  >
                    Usar sugerencia: {suggestedCategoryLabel}
                    {suggestedCategory && !isVitalCategory(suggestedCategory) ? ' (Top / Recientes)' : ''}
                  </button>
                ) : null}
              </div>
              <div>
                <label className={`mb-1 block text-[11px] ${ui.label}`}>Imagen (URL https)</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={botImageInputRef}
                    type="url"
                    value={botImageUrl}
                    onChange={(e) => setBotImageUrl(e.target.value.slice(0, 2048))}
                    placeholder="https://http2.mlstatic.com/…"
                    className={`min-w-[200px] flex-1 px-3 py-2 font-mono text-xs ${ui.input}`}
                  />
                  <button type="button" onClick={applyNormalizedImage} className={ui.btnGhostSm}>
                    Normalizar
                  </button>
                </div>
              </div>
              <div>
                <label className={`mb-1 block text-[11px] ${ui.label}`}>
                  Enlace tienda (se aplica tag afiliado al guardar)
                </label>
                <input
                  ref={botUrlInputRef}
                  type="url"
                  value={botOfferUrl}
                  onChange={(e) => setBotOfferUrl(e.target.value.slice(0, 2048))}
                  placeholder="https://articulo.mercadolibre.com.mx/…"
                  className={`w-full px-3 py-2 font-mono text-xs ${ui.input}`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={botQuickSaving}
                  onClick={() => void saveBotQuickFix()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {botQuickSaving ? 'Guardando…' : 'Guardar correcciones'}
                </button>
                {botQuickMsg ? <span className={`text-xs ${ui.muted}`}>{botQuickMsg}</span> : null}
              </div>
            </div>
          ) : null}

          {originalProductUrl ? (
            <button
              type="button"
              onClick={openOriginalProduct}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-600/40 bg-emerald-600/10 px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-600/20 dark:text-emerald-200"
            >
              <ExternalLink className="h-4 w-4" />
              Ver producto
            </button>
          ) : (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
              Esta oferta no tiene URL de tienda.
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowSecondary((v) => !v)}
            className={`mt-3 text-xs font-medium ${ui.muted} hover:underline`}
          >
            {showSecondary ? 'Ocultar detalles' : 'Más detalles (historial, duplicados, bot…)'}
          </button>

          {showSecondary ? (
            <div className="mt-3 space-y-3 border-t pt-3 border-white/[0.06]">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setEditTitle(offer.title);
                setEditOfferUrl(offer.offer_url ?? '');
                setEditDescription(typeof offer.description === 'string' ? offer.description : '');
                setEditImageUrl(offer.image_url ?? '');
                setEditCategory(offer.category ?? '');
                setShowEdit(true);
              }}
              className={ui.btnGhostSm}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
            <button
              type="button"
              onClick={fetchHistory}
              disabled={historyLoading}
              className={`${ui.btnGhostSm} disabled:opacity-50`}
            >
              <History className="h-4 w-4" />
              Historial
            </button>
          </div>

          {!isBotOffer && offer.moderator_comment?.trim() ? (
            <div className={`rounded-xl border px-3 py-2 text-sm ${ui.border} ${ui.thumbBg} ${ui.soft}`}>
              <span className={`font-medium ${ui.body}`}>Nota del cazador:</span>{' '}
              {offer.moderator_comment.trim()}
            </div>
          ) : null}

          {similarOffers.length > 0 ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100/90">
              <p className="font-medium">Posibles duplicados</p>
              <ul className="mt-1 space-y-1 opacity-80">
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
          ) : null}
        </div>
      </div>

        <aside className="flex min-h-0 flex-col bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {requiresAffiliate ? (
              <div className="space-y-2">
                <label className={`text-[11px] font-semibold uppercase tracking-wide ${ui.label}`}>
                  Enlace afiliado
                </label>
                <input
                  id="moderation-affiliate-paste-input"
                  ref={affiliatePasteRef}
                  type="url"
                  value={affiliatePaste}
                  onChange={(e) => handleAffiliatePasteChange(e.target.value)}
                  placeholder="Pegar enlace aquí…"
                  disabled={readOnly}
                  className={`w-full px-3 py-2.5 font-mono text-xs ${ui.input}`}
                />
                {pasteStatus === 'validating' ? (
                  <p className={`text-xs ${ui.muted}`}>Validando…</p>
                ) : null}
                {pasteStatus === 'valid' || offer.link_mod_ok === true ? (
                  <ul className={`space-y-1 text-xs text-emerald-700 dark:text-emerald-300`}>
                    {pasteValidation?.store || offer.store ? (
                      <li>✓ {pasteValidation?.store ?? offer.store}</li>
                    ) : null}
                    <li>✓ Producto coincide</li>
                    <li>✓ Tag AVENTA</li>
                  </ul>
                ) : null}
                {pasteStatus === 'invalid' && pasteError ? (
                  <p className="text-xs text-red-600 dark:text-red-300" role="alert">
                    ✕ {pasteError}
                  </p>
                ) : null}
              </div>
            ) : originalProductUrl ? (
              <p className={`text-xs ${ui.muted}`}>Tienda sin programa afiliado configurado.</p>
            ) : null}

            {affiliateReady && requiresAffiliate ? (
              <p className="text-center text-xs font-medium text-emerald-700 dark:text-emerald-300">
                ✓ Lista para aprobar
              </p>
            ) : null}
          </div>

      <div
        className={`shrink-0 space-y-3 border-t px-4 py-3 ${ui.stickyBar}`}
      >
        {!readOnly && onSnooze ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] font-medium ${ui.label}`}>Revisar después</span>
            {(
              [
                { minutes: 15 as const, label: '15 min' },
                { minutes: 60 as const, label: '1 h' },
                { minutes: 240 as const, label: '4 h' },
              ] as const
            ).map(({ minutes, label }) => (
              <button
                key={minutes}
                type="button"
                disabled={snoozeLoading != null}
                onClick={() => {
                  setSnoozeLoading(minutes);
                  Promise.resolve(onSnooze(minutes)).finally(() => setSnoozeLoading(null));
                }}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50 ${ui.borderStrong} ${ui.soft} hover:border-violet-400/40`}
              >
                {snoozeLoading === minutes ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Clock className="h-3 w-3" aria-hidden />
                )}
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <div>
          <label className={`text-[11px] ${ui.label}`}>Mensaje opcional al autor</label>
          <textarea
            placeholder="Ej: ¡Muy buena oferta! Ya está en el feed."
            value={modMessage}
            onChange={(e) => setModMessage(e.target.value.slice(0, 500))}
            rows={2}
            className={`mt-1 w-full px-3 py-2 text-sm ${ui.input}`}
          />
        </div>
        {actionError ? (
          <div
            className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200"
            role="alert"
          >
            {actionError}
            {onClearActionError ? (
              <button
                type="button"
                className="ml-2 font-medium underline"
                onClick={onClearActionError}
              >
                Cerrar
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-2">
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
            disabled={
              readOnly ||
              blockers > 0 ||
              (requiresAffiliate && !affiliateReady)
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Aprobar
          </button>
          <button
            type="button"
            onClick={() => setShowRejectInput((v) => !v)}
            disabled={readOnly}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className={`rounded-lg border px-2 py-1 text-[11px] ${ui.borderStrong} ${ui.soft} hover:border-violet-400/40`}
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
                className={`min-w-[160px] flex-1 px-3 py-2 text-sm ${ui.input}`}
                autoFocus
              />
              <button
                type="button"
                onClick={handleReject}
                disabled={!rejectReason.trim()}
                className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        ) : null}
      </div>
        </aside>
      </div>

      {showHistory ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowHistory(false)}
        >
          <div
            className={`max-h-[80vh] w-full max-w-md overflow-auto p-5 ${ui.modal}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className={`text-lg font-semibold ${ui.title}`}>Historial</h3>
              <button type="button" onClick={() => setShowHistory(false)} className={`rounded p-1 ${ui.rowHover}`} aria-label="Cerrar">
                <X className={`h-5 w-5 ${ui.soft}`} />
              </button>
            </div>
            {historyLogs.length === 0 ? (
              <p className={`text-sm ${ui.muted}`}>Aún no hay acciones.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {historyLogs.map((log) => (
                  <li key={log.id} className={`border-b py-2 last:border-0 ${ui.hairline}`}>
                    <span className={`font-medium ${ui.body}`}>{ACTION_LABELS[log.action] ?? log.action}</span>
                    <span className={`ml-2 ${ui.muted}`}>{new Date(log.created_at).toLocaleString('es-MX')}</span>
                    {log.reason ? <p className={ui.subtitle}>Motivo: {log.reason}</p> : null}
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
          <img
            src={heroSrc}
            alt=""
            className="max-h-full max-w-full object-contain"
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

      {showEdit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowEdit(false)}>
          <div
            className={`max-h-[90vh] w-full max-w-lg overflow-auto ${ui.modal}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`sticky top-0 flex items-center justify-between border-b px-4 py-3 backdrop-blur ${ui.hairline} ${ui.ws ? 'bg-white/95 dark:bg-[#0c0c0e]/95' : 'bg-[#0c0c0e]/95'}`}>
              <h3 className={`text-lg font-semibold ${ui.title}`}>Editar oferta</h3>
              <button type="button" onClick={() => setShowEdit(false)} className={`rounded p-1 ${ui.rowHover}`} aria-label="Cerrar">
                <X className={`h-5 w-5 ${ui.soft}`} />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className={`mb-1 block text-sm ${ui.soft}`}>Título</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value.slice(0, 500))}
                  className={`w-full px-3 py-2 text-sm ${ui.input}`}
                />
              </div>
              <div>
                <label className={`mb-1 block text-sm ${ui.soft}`}>URL</label>
                <input
                  type="url"
                  value={editOfferUrl}
                  onChange={(e) => setEditOfferUrl(e.target.value.slice(0, 2048))}
                  className={`w-full px-3 py-2 font-mono text-sm ${ui.input}`}
                />
              </div>
              <div>
                <label className={`mb-1 block text-sm ${ui.soft}`}>Descripción</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value.slice(0, 2000))}
                  rows={3}
                  className={`w-full px-3 py-2 text-sm ${ui.input}`}
                />
              </div>
              <div>
                <label className={`mb-1 block text-sm ${ui.soft}`}>Imagen (URL)</label>
                <input
                  type="url"
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value.slice(0, 2048))}
                  className={`w-full px-3 py-2 font-mono text-sm ${ui.input}`}
                />
              </div>
              <div>
                <label className={`mb-1 block text-sm ${ui.soft}`}>Categoría</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className={`w-full px-3 py-2 text-sm ${ui.input}`}
                >
                  <option value="">Sin categoría</option>
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
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
                        category: editCategory.trim() || null,
                      }),
                    });
                    setEditSaving(false);
                    if (!res.ok) return;
                    setShowEdit(false);
                    onOfferUpdated?.();
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-400"
                >
                  {editSaving ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEdit(false)}
                  className={ui.btnGhostSm}
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
