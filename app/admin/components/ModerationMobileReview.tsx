'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  Clock,
  ExternalLink,
  MoreHorizontal,
  PenLine,
  Store,
  X,
} from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';
import { moderationUi } from '../moderation/moderationUi';
import ModerationConfidenceChip from './ModerationConfidenceChip';
import ModerationBotFactsCard from './ModerationBotFactsCard';
import ModerationChecklist from './ModerationChecklist';
import ModerationDecisionCard from './ModerationDecisionCard';
import ModerationFixSheet, { type FixField } from './ModerationFixSheet';
import ModerationImageGallery from './ModerationImageGallery';
import { mergeOfferImageUrls } from '@/lib/offerPath';
import { shortModerationQueueTitle } from '@/lib/moderation/queueTitle';
import { MODERATION_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';
import { isOfferLockedByOther } from '@/lib/moderation/moderationLock';
import {
  formatModerationRelativeTime,
  getOfferDiscountPercent,
} from '@/lib/moderation/relativeTime';
import {
  buildModerationChecklist,
  countChecklistBlockers,
  type ModerationChecklistItem,
} from '@/lib/moderation/botFacts';
import { ALL_CATEGORIES, isVitalCategory, normalizeCategoryForStorage } from '@/lib/categories';

export type MobileModerationOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  category?: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  offer_url: string | null;
  description?: string | null;
  conditions?: string | null;
  created_at?: string;
  created_by: string | null;
  risk_score?: number | null;
  moderator_comment?: string | null;
  bot_meta?: unknown;
  is_bot?: boolean;
  locked_by?: string | null;
  locked_at?: string | null;
  locked_by_name?: string | null;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
};

type SourceTab = 'all' | 'bot' | 'users';

type Props = {
  mode?: ModerationHubMode;
  offers: MobileModerationOffer[];
  selectedId: string | null;
  sourceTab: SourceTab;
  tabLocked?: boolean;
  currentUserId?: string | null;
  linkConfirmed: boolean;
  onLinkConfirmedChange: (v: boolean) => void;
  onSelect: (id: string) => void;
  onSourceTab: (tab: SourceTab) => void;
  onApprove: (
    id: string,
    createdBy?: string | null,
    modMessage?: string,
    offerHasUrl?: boolean
  ) => void;
  onReject: (id: string, reason?: string) => void;
  onSnooze?: (minutes: 15 | 60 | 240) => void;
  onOfferUpdated?: () => void;
  loading?: boolean;
  actionError?: string | null;
  onClearActionError?: () => void;
  /** Si true, muestra detalle; si false, lista decision-first. */
  showDetail?: boolean;
  onShowDetailChange?: (show: boolean) => void;
};

/**
 * Mobile decision-first: lista con Aprobar/Rechazar → detalle al tocar la card.
 */
export default function ModerationMobileReview({
  mode = 'admin',
  offers,
  selectedId,
  sourceTab,
  tabLocked = false,
  currentUserId = null,
  linkConfirmed,
  onLinkConfirmedChange,
  onSelect,
  onSourceTab,
  onApprove,
  onReject,
  onSnooze,
  onOfferUpdated,
  loading = false,
  actionError = null,
  onClearActionError,
  showDetail: showDetailProp,
  onShowDetailChange,
}: Props) {
  const ui = moderationUi(mode);
  const [internalShowDetail, setInternalShowDetail] = useState(false);
  const showDetail = showDetailProp ?? internalShowDetail;
  const setShowDetail = onShowDetailChange ?? setInternalShowDetail;

  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [imgBroken, setImgBroken] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [fixField, setFixField] = useState<FixField | null>(null);
  const [showFix, setShowFix] = useState(false);
  const [linkGateId, setLinkGateId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  useBodyScrollLock(showFix);

  const index = Math.max(
    0,
    offers.findIndex((o) => o.id === selectedId)
  );
  const offer = offers[index] ?? null;

  useEffect(() => {
    setImgBroken(false);
    setGalleryIndex(0);
    setShowReject(false);
    setRejectReason('');
    setShowMore(false);
    setShowFix(false);
    setFixField(null);
  }, [offer?.id]);

  const images = useMemo(
    () => (offer ? mergeOfferImageUrls(offer.image_url, offer.image_urls ?? null) : []),
    [offer]
  );
  const heroSrc = !imgBroken ? images[galleryIndex] ?? images[0] ?? null : null;

  const readOnly = offer
    ? isOfferLockedByOther(
        { locked_by: offer.locked_by, locked_at: offer.locked_at },
        currentUserId
      )
    : false;

  const catNorm = normalizeCategoryForStorage(offer?.category ?? null);
  const catLabel = catNorm
    ? ALL_CATEGORIES.find((c) => c.value === catNorm)?.label ?? catNorm
    : null;
  const pct = offer ? getOfferDiscountPercent(offer.price, offer.original_price) : 0;
  const hasOriginal =
    offer?.original_price != null && Number(offer.original_price) > Number(offer.price);
  const hasUrl = Boolean(offer?.offer_url?.trim());
  const canApprove = !readOnly && (!hasUrl || linkConfirmed);

  const checklist = useMemo(
    () =>
      offer
        ? buildModerationChecklist({
            title: offer.title,
            image_url: offer.image_url,
            image_urls: offer.image_urls,
            offer_url: offer.offer_url,
            category: offer.category,
          })
        : [],
    [offer]
  );
  const blockers = countChecklistBlockers(checklist);

  const destination = catLabel
    ? isVitalCategory(catNorm)
      ? `Día a día → ${catLabel}`
      : `Top / Recientes → ${catLabel}`
    : 'Sin categoría — asígnala antes de aprobar';

  const openFix = (field: FixField | ModerationChecklistItem['id'] | null) => {
    const mapped: FixField | null =
      field === 'affiliate' ? 'link' : field === null ? null : (field as FixField);
    setFixField(mapped);
    setShowFix(true);
    setShowMore(false);
  };

  const tryApprove = (o: MobileModerationOffer) => {
    const locked = isOfferLockedByOther(
      { locked_by: o.locked_by, locked_at: o.locked_at },
      currentUserId
    );
    if (locked) return;
    const url = Boolean(o.offer_url?.trim());
    const alreadySelected = selectedId === o.id;
    if (!alreadySelected) onSelect(o.id);
    if (url && !(alreadySelected && linkConfirmed) && linkGateId !== o.id) {
      setLinkGateId(o.id);
      return;
    }
    setActingId(o.id);
    onApprove(o.id, o.created_by, undefined, url);
    setLinkGateId(null);
    setActingId(null);
  };

  const confirmLinkAndApprove = (o: MobileModerationOffer) => {
    onLinkConfirmedChange(true);
    setActingId(o.id);
    onApprove(o.id, o.created_by, undefined, true);
    setLinkGateId(null);
    setActingId(null);
  };

  const tryReject = (o: MobileModerationOffer) => {
    const locked = isOfferLockedByOther(
      { locked_by: o.locked_by, locked_at: o.locked_at },
      currentUserId
    );
    if (locked) return;
    onSelect(o.id);
    setShowDetail(true);
    setShowReject(true);
    setLinkGateId(null);
  };

  const confirmReject = () => {
    if (!offer || !rejectReason.trim()) return;
    onReject(offer.id, rejectReason.trim());
    setShowReject(false);
    setRejectReason('');
  };

  const sourceTabs = (
    <div className={`flex gap-1 rounded-xl p-1 ${ui.thumbBg}`}>
      {(
        [
          { id: 'all' as const, label: 'Todas' },
          { id: 'bot' as const, label: 'Bot' },
          { id: 'users' as const, label: 'Usuarios' },
        ] as const
      ).map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSourceTab(id)}
          className={`min-h-10 flex-1 rounded-lg text-xs font-semibold transition-colors ${
            sourceTab === id ? ui.chipActive : ui.chipIdle
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className={`flex items-center justify-center gap-2 py-24 ${ui.emptyDash}`}>
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="text-sm">Cargando cola…</span>
      </div>
    );
  }

  /* —— Lista decision-first —— */
  if (!showDetail) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-3">
        <div>
          <h2 className={`text-xl font-semibold tracking-tight ${ui.title}`}>Moderación</h2>
          <p className={`mt-0.5 text-sm ${ui.subtitle}`}>
            {offers.length} pendiente{offers.length === 1 ? '' : 's'}
          </p>
        </div>

        {!tabLocked ? sourceTabs : null}

        {offers.length === 0 ? (
          <div className={`${ui.card} px-5 py-14 text-center`}>
            <p className={`text-base font-medium ${ui.title}`}>Cola vacía</p>
            <p className={`mt-1 text-sm ${ui.subtitle}`}>No hay ofertas pendientes en esta vista.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {offers.map((o) => (
              <li key={o.id}>
                <ModerationDecisionCard
                  mode={mode}
                  offer={{
                    ...o,
                    created_at: o.created_at ?? new Date().toISOString(),
                  }}
                  active={o.id === selectedId}
                  currentUserId={currentUserId}
                  linkGateOpen={linkGateId === o.id}
                  acting={actingId === o.id}
                  onSelect={() => {
                    onSelect(o.id);
                    setShowDetail(true);
                    setLinkGateId(null);
                  }}
                  onApprove={() => tryApprove(o)}
                  onReject={() => tryReject(o)}
                  onConfirmLinkAndApprove={() => confirmLinkAndApprove(o)}
                  onDismissLinkGate={() => setLinkGateId(null)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  /* —— Detalle de una oferta —— */
  if (!offer) {
    return (
      <div className={`${ui.card} px-5 py-16 text-center`}>
        <p className={`text-base font-medium ${ui.title}`}>Cola vacía</p>
        <button
          type="button"
          onClick={() => setShowDetail(false)}
          className={`mt-4 ${ui.btnGhost}`}
        >
          Volver a la lista
        </button>
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-lg flex-col md:max-h-[calc(100dvh-5.5rem)]">
      <div
        className={`z-20 shrink-0 -mx-1 mb-2 px-1 pb-2 pt-1 backdrop-blur-md ${
          ui.ws ? 'bg-white/90 dark:bg-[#0c0c0e]/90' : 'bg-[#0a0a0c]/90'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            setShowDetail(false);
            setShowReject(false);
            setLinkGateId(null);
          }}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold ${ui.btnGhost}`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Cola
          <span className={`tabular-nums ${ui.muted}`}>
            {index + 1}/{offers.length}
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <article className={`overflow-hidden ${ui.card}`}>
        <div className={`flex flex-wrap gap-1.5 border-b px-4 py-2.5 ${ui.hairline}`}>
          <ModerationConfidenceChip offer={offer} mode={mode} size="md" />
          {offer.is_bot ? (
            <span className="rounded-md bg-sky-500/90 px-2 py-0.5 text-[11px] font-semibold text-white">
              Bot
            </span>
          ) : null}
        </div>

        {heroSrc ? (
          <ModerationImageGallery
            images={images}
            index={galleryIndex}
            onIndexChange={(i) => {
              setGalleryIndex(i);
              setImgBroken(false);
            }}
            onImageError={() => setImgBroken(true)}
            heroBg={ui.heroBg}
            heroClassName="aspect-[4/3] max-h-[34vh]"
          />
        ) : offer.is_bot ? (
          <ModerationBotFactsCard
            variant="hero"
            mode={mode}
            store={offer.store}
            botMeta={offer.bot_meta}
            moderatorComment={offer.moderator_comment}
            destination={destination}
          />
        ) : (
          <div
            className={`flex flex-col items-center justify-center gap-1.5 border-b py-8 ${ui.hairline} ${ui.heroBg} ${ui.faint}`}
          >
            <Store className="h-8 w-8 opacity-40" />
            <p className="text-sm">Sin foto</p>
          </div>
        )}

        <div className="space-y-3 px-4 py-4">
          {readOnly ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
              <span>
                En revisión por <strong>{offer.locked_by_name?.trim() || 'otro moderador'}</strong>
              </span>
            </div>
          ) : null}

          <div>
            <h2 className={`text-[17px] font-semibold leading-snug tracking-tight ${ui.title}`}>
              {shortModerationQueueTitle(offer.title)}
            </h2>
            <p className={`mt-2 flex flex-wrap items-center gap-2 text-sm ${ui.soft}`}>
              <span className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                ${Number(offer.price ?? 0).toLocaleString('es-MX')}
              </span>
              {hasOriginal ? (
                <span className={`text-sm tabular-nums line-through ${ui.faint}`}>
                  ${Number(offer.original_price).toLocaleString('es-MX')}
                </span>
              ) : null}
              {pct > 0 ? (
                <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  −{pct}%
                </span>
              ) : null}
            </p>
            <p className={`mt-1.5 text-sm ${ui.muted}`}>
              {offer.store ?? 'Sin tienda'}
              {offer.created_at ? ` · ${formatModerationRelativeTime(offer.created_at)}` : ''}
              {catLabel ? ` · ${catLabel}` : ''}
            </p>
          </div>

          {offer.is_bot ? (
            <ModerationChecklist
              mode={mode}
              items={checklist}
              onFix={readOnly ? undefined : openFix}
              disabled={readOnly}
            />
          ) : null}

          {hasUrl ? (
            <a
              href={offer.offer_url!}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold ${
                ui.ws
                  ? 'bg-emerald-600 text-white active:bg-emerald-700'
                  : 'bg-violet-600 text-white active:bg-violet-700'
              }`}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Abrir en la tienda
            </a>
          ) : null}

          {hasUrl ? (
            <label
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-3 ${ui.borderStrong} ${ui.thumbBg}`}
            >
              <input
                type="checkbox"
                checked={linkConfirmed}
                onChange={(e) => onLinkConfirmedChange(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className={`text-sm font-medium ${ui.body}`}>Confirmé el producto en la tienda</span>
            </label>
          ) : null}

          {(offer.description || offer.conditions) && (
            <details className={`rounded-xl border px-3 py-2 ${ui.border}`}>
              <summary className={`cursor-pointer text-sm font-medium ${ui.soft}`}>Más detalles</summary>
              <div className={`mt-2 space-y-2 text-sm ${ui.subtitle}`}>
                {offer.description ? <p className="whitespace-pre-wrap">{offer.description}</p> : null}
                {offer.conditions ? (
                  <p>
                    <span className={`font-medium ${ui.body}`}>Condiciones: </span>
                    {offer.conditions}
                  </p>
                ) : null}
              </div>
            </details>
          )}
        </div>
      </article>
      </div>

      <div
        className={`z-20 mt-3 shrink-0 space-y-2 px-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md ${
          ui.ws ? 'bg-white/95 dark:bg-[#0c0c0e]/95' : 'bg-[#0a0a0c]/95'
        }`}
      >
        {showReject ? (
          <div className={`space-y-2 rounded-2xl border p-3 ${ui.border} ${ui.card}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${ui.label}`}>Motivo de rechazo</p>
            <div className="flex flex-wrap gap-1.5">
              {MODERATION_REJECTION_PRESETS.map((r) => (
                <button
                  key={r.short}
                  type="button"
                  onClick={() => setRejectReason(r.full)}
                  className={`rounded-full border px-3 py-2 text-[12px] font-medium ${ui.borderStrong} ${ui.soft}`}
                >
                  {r.short}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motivo (obligatorio)"
              className={`w-full min-h-11 px-3 text-sm ${ui.input}`}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowReject(false);
                  setRejectReason('');
                }}
                className={`min-h-12 rounded-2xl text-sm font-semibold ${ui.btnGhost}`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={!rejectReason.trim() || readOnly}
                className="min-h-12 rounded-2xl bg-red-600 text-sm font-semibold text-white disabled:opacity-40"
              >
                Confirmar rechazo
              </button>
            </div>
          </div>
        ) : (
          <>
            {showMore ? (
              <div className={`space-y-3 rounded-2xl border p-3 ${ui.border} ${ui.card}`}>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => openFix(null)}
                  className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-40 ${ui.btnGhost}`}
                >
                  <PenLine className="h-4 w-4" aria-hidden />
                  Editar la oferta
                </button>
                {onSnooze && !readOnly ? (
                  <div>
                    <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${ui.label}`}>
                      Revisar después
                    </p>
                    <div className="flex gap-2">
                      {(
                        [
                          { m: 15 as const, label: '15m' },
                          { m: 60 as const, label: '1h' },
                          { m: 240 as const, label: '4h' },
                        ] as const
                      ).map(({ m, label }) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            onSnooze(m);
                            setShowMore(false);
                          }}
                          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl text-xs font-semibold ${ui.btnGhost}`}
                        >
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {blockers > 0 && !readOnly ? (
              <button
                type="button"
                onClick={() => openFix(checklist.find((i) => i.state === 'missing')?.id ?? null)}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 text-sm font-bold text-amber-950 active:bg-amber-600"
              >
                <PenLine className="h-4 w-4" aria-hidden />
                Arreglar · {blockers} pendiente{blockers > 1 ? 's' : ''}
              </button>
            ) : null}

            {actionError ? (
              <div
                className="rounded-2xl border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-800 dark:text-red-200"
                role="alert"
              >
                {actionError}
                {onClearActionError ? (
                  <button
                    type="button"
                    className="ml-2 font-semibold underline"
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
                disabled={!canApprove || blockers > 0}
                onClick={() => onApprove(offer.id, offer.created_by, undefined, hasUrl)}
                className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[15px] font-bold text-white active:bg-emerald-700 disabled:opacity-40"
              >
                <Check className="h-5 w-5" aria-hidden />
                Aprobar
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => setShowReject(true)}
                className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-2xl bg-red-600 text-[15px] font-bold text-white active:bg-red-700 disabled:opacity-40"
              >
                <X className="h-5 w-5" aria-hidden />
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl text-sm font-semibold ${ui.btnGhost}`}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
                Más acciones
              </button>
            </div>
            {hasUrl && !linkConfirmed ? (
              <p className={`text-center text-[11px] ${ui.muted}`}>
                Abre la tienda y confirma el producto para poder aprobar
              </p>
            ) : blockers > 0 ? (
              <p className={`text-center text-[11px] ${ui.muted}`}>
                Arregla lo pendiente antes de aprobar
              </p>
            ) : null}
          </>
        )}
      </div>

      {showFix ? (
        <ModerationFixSheet
          mode={mode}
          offer={{
            id: offer.id,
            title: offer.title,
            image_url: offer.image_url,
            image_urls: offer.image_urls,
            offer_url: offer.offer_url,
            category: offer.category,
          }}
          focusField={fixField}
          onClose={() => {
            setShowFix(false);
            setFixField(null);
          }}
          onSaved={() => {
            setImgBroken(false);
            onOfferUpdated?.();
          }}
        />
      ) : null}
    </div>
  );
}
