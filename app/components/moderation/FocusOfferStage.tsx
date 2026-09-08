'use client';

import { useState } from 'react';
import { ExternalLink, ImageOff } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { mergeOfferImageUrls } from '@/lib/offerPath';
import { getOfferDiscountPercent } from '@/lib/moderation/relativeTime';
import { buildHumanVerdict } from '@/lib/moderation/humanVerdict';
import { computeMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';
import type { FocusModerationOffer } from '@/lib/moderation/focusTypes';
import { cn } from '@/app/components/panel/utils';

type Props = {
  offer: FocusModerationOffer;
  mode: ModerationHubMode;
  onOpenWhy: () => void;
};

export default function FocusOfferStage({ offer, mode, onOpenWhy }: Props) {
  const ui = moderationUi(mode);
  const gallery = mergeOfferImageUrls(offer.image_url, offer.image_urls ?? null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [imgBroken, setImgBroken] = useState(false);
  const safeIdx = Math.min(activeIdx, Math.max(0, gallery.length - 1));
  const thumb = !imgBroken ? gallery[safeIdx] ?? null : null;
  const pct = getOfferDiscountPercent(offer.price, offer.original_price);
  const hasOriginal =
    offer.original_price != null && Number(offer.original_price) > Number(offer.price);
  const verdict = buildHumanVerdict({
    risk_score: offer.risk_score,
    moderator_comment: offer.moderator_comment,
    image_url: offer.image_url,
    category: offer.category,
    original_price: offer.original_price,
    price: offer.price,
    is_bot: offer.is_bot,
    bot_meta: offer.bot_meta,
    title: offer.title,
  });
  const monetization = computeMonetizationReadiness({
    offerUrl: offer.offer_url,
    originalOfferUrl: offer.original_offer_url,
    linkModOk: offer.link_mod_ok,
  });

  const toneDot =
    verdict.tone === 'good'
      ? 'bg-emerald-500'
      : verdict.tone === 'caution'
        ? 'bg-amber-400'
        : 'bg-rose-500';

  const moneyDot =
    monetization.status === 'ready'
      ? 'bg-emerald-500'
      : monetization.status === 'needs_attention'
        ? 'bg-amber-400'
        : 'bg-gray-400';

  const offerHref = offer.offer_url?.trim() || '';

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center text-center">
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-2xl',
          'aspect-[4/3] max-h-[min(28vh,220px)] sm:max-h-[min(32vh,260px)]',
          ui.heroBg
        )}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-contain"
            onError={() => {
              if (safeIdx < gallery.length - 1) {
                setActiveIdx(safeIdx + 1);
                setImgBroken(false);
              } else {
                setImgBroken(true);
              }
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4">
            <ImageOff className={cn('h-8 w-8', ui.iconMuted)} />
            <p className={cn('text-sm font-medium', ui.title)}>Sin imagen</p>
          </div>
        )}
      </div>

      {gallery.length > 1 ? (
        <div
          className="mt-2 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5"
          aria-label="Fotos de la oferta"
        >
          {gallery.slice(0, 8).map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => {
                setActiveIdx(i);
                setImgBroken(false);
              }}
              className={cn(
                'h-11 w-11 shrink-0 overflow-hidden rounded-lg border-2',
                i === safeIdx
                  ? ui.ws
                    ? 'border-emerald-500'
                    : 'border-violet-400'
                  : 'border-transparent opacity-70 hover:opacity-100'
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      <h2
        className={cn(
          'mt-3 line-clamp-2 text-balance text-lg font-semibold leading-snug md:text-xl',
          ui.title
        )}
      >
        {offer.title}
      </h2>

      <div className="mt-2 flex flex-wrap items-baseline justify-center gap-x-2.5 gap-y-0.5">
        <span className={cn('text-xl font-semibold tabular-nums md:text-2xl', ui.title)}>
          ${Number(offer.price).toLocaleString('es-MX', { maximumFractionDigits: 2 })}
        </span>
        {hasOriginal ? (
          <span className={cn('text-sm tabular-nums line-through', ui.faint)}>
            ${Number(offer.original_price).toLocaleString('es-MX', { maximumFractionDigits: 0 })}
          </span>
        ) : null}
        {pct > 0 ? (
          <span
            className={cn(
              'text-sm font-semibold',
              ui.ws ? 'text-emerald-600 dark:text-emerald-400' : 'text-emerald-300'
            )}
          >
            {pct}% OFF
          </span>
        ) : null}
        {offer.store?.trim() && offerHref ? (
          <a
            href={offerHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('inline-flex items-center gap-1 text-sm font-medium', ui.soft)}
          >
            · {offer.store.trim()}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : offer.store?.trim() ? (
          <span className={cn('text-sm', ui.soft)}>· {offer.store.trim()}</span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <p className={cn('inline-flex items-center gap-1.5 text-sm font-medium', ui.body)}>
          <span className={cn('inline-block h-2 w-2 rounded-full', toneDot)} aria-hidden />
          {verdict.headline}
        </p>
        <p
          className={cn('inline-flex items-center gap-1.5 text-sm font-medium', ui.soft)}
          data-monetization-status={monetization.status}
        >
          <span className={cn('inline-block h-2 w-2 rounded-full', moneyDot)} aria-hidden />
          Monetización · {monetization.label}
        </p>
      </div>

      <div className="mt-1.5">
        <button
          type="button"
          onClick={onOpenWhy}
          className={cn('text-sm font-medium underline-offset-4 hover:underline', ui.muted)}
        >
          Ver por qué
        </button>
      </div>
    </div>
  );
}
