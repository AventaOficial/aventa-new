'use client';

import { useState } from 'react';
import { Check, ExternalLink, Lock, X } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { mergeOfferImageUrls } from '@/lib/offerPath';
import { shortModerationQueueTitle } from '@/lib/moderation/queueTitle';
import {
  formatModerationRelativeTime,
  getOfferDiscountPercent,
} from '@/lib/moderation/relativeTime';
import { isOfferLockedByOther } from '@/lib/moderation/moderationLock';
import { moderationUi } from '../moderation/moderationUi';

export type DecisionCardOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  offer_url: string | null;
  created_at: string;
  is_bot?: boolean;
  locked_by?: string | null;
  locked_at?: string | null;
  locked_by_name?: string | null;
};

type Props = {
  offer: DecisionCardOffer;
  mode?: ModerationHubMode;
  active?: boolean;
  currentUserId?: string | null;
  /** Muestra puerta de confirmación de enlace en la card. */
  linkGateOpen?: boolean;
  acting?: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onConfirmLinkAndApprove?: () => void;
  onDismissLinkGate?: () => void;
};

/**
 * Card decision-first: imagen, producto, precios, tienda, tiempo + Aprobar/Rechazar.
 */
export default function ModerationDecisionCard({
  offer,
  mode = 'admin',
  active = false,
  currentUserId = null,
  linkGateOpen = false,
  acting = false,
  onSelect,
  onApprove,
  onReject,
  onConfirmLinkAndApprove,
  onDismissLinkGate,
}: Props) {
  const ui = moderationUi(mode);
  const [imgBroken, setImgBroken] = useState(false);
  const thumb = !imgBroken
    ? mergeOfferImageUrls(offer.image_url, offer.image_urls ?? null)[0] ?? null
    : null;
  const pct = getOfferDiscountPercent(offer.price, offer.original_price);
  const hasOriginal =
    offer.original_price != null && Number(offer.original_price) > Number(offer.price);
  const readOnly = isOfferLockedByOther(
    { locked_by: offer.locked_by, locked_at: offer.locked_at },
    currentUserId
  );
  const hasUrl = Boolean(offer.offer_url?.trim());
  const accentRing = ui.ws
    ? 'border-emerald-500/60 bg-emerald-50/80 shadow-[0_0_0_3px_rgba(16,185,129,0.12)] dark:border-emerald-400/50 dark:bg-emerald-950/30 dark:shadow-[0_0_0_3px_rgba(52,211,153,0.12)]'
    : 'border-violet-400/55 bg-violet-500/10 shadow-[0_0_0_3px_rgba(139,92,246,0.18)]';

  return (
    <div
      className={`overflow-hidden rounded-2xl border transition-all ${
        active
          ? accentRing
          : `${ui.borderStrong} shadow-sm ${ui.rowHover} ${
              ui.ws ? 'bg-white dark:bg-white/[0.03]' : 'bg-white/[0.03]'
            }`
      }`}
    >
      <div className="flex items-stretch gap-3 p-3 sm:gap-3.5 sm:p-3.5">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-current={active ? 'true' : undefined}
        >
          <div
            className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl sm:h-16 sm:w-16 ${ui.thumbBg}`}
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setImgBroken(true)}
              />
            ) : (
              <div className={`flex h-full w-full items-center justify-center text-[10px] ${ui.faint}`}>
                Sin foto
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className={`truncate text-[14px] font-semibold leading-snug sm:text-[15px] ${ui.title}`}>
              {shortModerationQueueTitle(offer.title)}
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[15px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                ${Number(offer.price ?? 0).toLocaleString('es-MX')}
              </span>
              {hasOriginal ? (
                <span className={`text-[12px] tabular-nums line-through ${ui.faint}`}>
                  ${Number(offer.original_price).toLocaleString('es-MX')}
                </span>
              ) : null}
              {pct > 0 ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  −{pct}%
                </span>
              ) : null}
            </p>
            <p className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] ${ui.muted}`}>
              {offer.store ? (
                <span className={`font-medium ${ui.soft}`}>{offer.store}</span>
              ) : (
                <span>Sin tienda</span>
              )}
              <span aria-hidden>·</span>
              <span>{formatModerationRelativeTime(offer.created_at)}</span>
              {offer.is_bot ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                    Bot
                  </span>
                </>
              ) : null}
              {readOnly ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-300">
                    <Lock className="h-3 w-3" aria-hidden />
                    {offer.locked_by_name?.trim() || 'En revisión'}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </button>

        <div className="flex shrink-0 flex-col justify-center gap-1.5 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={readOnly || acting}
            onClick={(e) => {
              e.stopPropagation();
              onApprove();
            }}
            aria-label="Aprobar"
            title="Aprobar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 sm:h-12 sm:w-12"
          >
            <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          </button>
          <button
            type="button"
            disabled={readOnly || acting}
            onClick={(e) => {
              e.stopPropagation();
              onReject();
            }}
            aria-label="Rechazar"
            title="Rechazar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm transition hover:bg-red-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 sm:h-12 sm:w-12"
          >
            <X className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>

      {linkGateOpen && hasUrl && !readOnly ? (
        <div
          className={`space-y-2 border-t px-3 py-3 sm:px-3.5 ${ui.hairline} ${
            ui.ws ? 'bg-amber-50/80 dark:bg-amber-950/20' : 'bg-amber-500/10'
          }`}
        >
          <p className={`text-[12px] leading-snug ${ui.body}`}>
            Antes de aprobar, abre el enlace y confirma que es el producto correcto.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={offer.offer_url!}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold sm:flex-none ${
                ui.ws
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'bg-violet-600 text-white hover:bg-violet-500'
              }`}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              Abrir tienda
            </a>
            <button
              type="button"
              disabled={acting}
              onClick={onConfirmLinkAndApprove}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 sm:flex-none"
            >
              <Check className="h-4 w-4" aria-hidden />
              Confirmé · Aprobar
            </button>
            <button
              type="button"
              onClick={onDismissLinkGate}
              className={`inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-medium ${ui.btnGhost}`}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
