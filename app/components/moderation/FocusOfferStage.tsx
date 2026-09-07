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
  onPrepareLink?: () => void;
};

export default function FocusOfferStage({ offer, mode, onOpenWhy, onPrepareLink }: Props) {
  const ui = moderationUi(mode);
  const [imgBroken, setImgBroken] = useState(false);
  const thumb = !imgBroken
    ? mergeOfferImageUrls(offer.image_url, offer.image_urls ?? null)[0] ?? null
    : null;
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
  const changeLabel =
    monetization.status === 'needs_attention' ? 'Preparar enlace' : 'Cambiar enlace';

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
            onError={() => setImgBroken(true)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4">
            <ImageOff className={cn('h-8 w-8', ui.iconMuted)} />
            <p className={cn('text-sm font-medium', ui.title)}>Sin imagen</p>
          </div>
        )}
      </div>

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

      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-3">
        {offerHref ? (
          <a
            href={offerHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('text-sm font-semibold underline-offset-4 hover:underline', ui.body)}
          >
            Abrir
          </a>
        ) : null}
        {onPrepareLink ? (
          <button
            type="button"
            onClick={onPrepareLink}
            className={cn(
              'text-sm font-semibold underline-offset-4 hover:underline',
              monetization.status === 'needs_attention'
                ? ui.ws
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-amber-200'
                : ui.muted
            )}
          >
            {changeLabel}
          </button>
        ) : null}
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
