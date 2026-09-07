'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
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

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center text-center">
      <div
        className={cn(
          'relative aspect-[4/5] w-full max-h-[min(52vh,420px)] overflow-hidden rounded-3xl',
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
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6">
            <ImageOff className={cn('h-10 w-10', ui.iconMuted)} />
            <p className={cn('text-base font-medium', ui.title)}>Sin imagen</p>
            <p className={cn('text-sm', ui.muted)}>Puedes decidir igualmente.</p>
          </div>
        )}
      </div>

      <h2 className={cn('mt-5 text-balance text-xl font-semibold leading-snug md:text-2xl', ui.title)}>
        {offer.title}
      </h2>

      <div className="mt-3 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
        <span className={cn('text-2xl font-semibold tabular-nums md:text-3xl', ui.title)}>
          ${Number(offer.price).toLocaleString('es-MX', { maximumFractionDigits: 2 })}
        </span>
        {hasOriginal ? (
          <span className={cn('text-base tabular-nums line-through', ui.faint)}>
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
      </div>

      {offer.store?.trim() ? (
        <p className={cn('mt-2 text-sm', ui.soft)}>{offer.store.trim()}</p>
      ) : null}

      <div className="mt-6 max-w-md space-y-1.5">
        <p className={cn('inline-flex items-center gap-2 text-base font-medium', ui.body)}>
          <span className={cn('inline-block h-2.5 w-2.5 rounded-full', toneDot)} aria-hidden />
          {verdict.headline}
        </p>
        <p className={cn('text-sm leading-relaxed', ui.muted)}>{verdict.detail}</p>
      </div>

      <p
        className={cn('mt-4 inline-flex items-center gap-2 text-sm font-medium', ui.soft)}
        data-monetization-status={monetization.status}
      >
        <span className={cn('inline-block h-2 w-2 rounded-full', moneyDot)} aria-hidden />
        Monetización · {monetization.label}
      </p>

      <button
        type="button"
        onClick={onOpenWhy}
        className={cn('mt-2 text-sm font-medium underline-offset-4 hover:underline', ui.muted)}
      >
        Ver por qué
      </button>
    </div>
  );
}
