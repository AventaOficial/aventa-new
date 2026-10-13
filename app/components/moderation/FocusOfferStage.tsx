'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { mergeOfferImageUrls } from '@/lib/offerPath';
import { getOfferDiscountPercent } from '@/lib/moderation/relativeTime';
import { buildHumanVerdict } from '@/lib/moderation/humanVerdict';
import { computeMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';
import { formatMsiCardLabel } from '@/lib/offers/msiDisplay';
import { formatCupónBancarioDisplay, getBankCouponLabel } from '@/lib/bankCoupons';
import type { FocusModerationOffer } from '@/lib/moderation/focusTypes';
import { cn } from '@/app/components/panel/utils';
import StoreBrandMark from '@/app/components/StoreBrandMark';
import ModerationPriorityHints from './ModerationPriorityHints';
import ModerationImageGallery from '@/app/admin/components/ModerationImageGallery';

type Props = {
  offer: FocusModerationOffer;
  mode: ModerationHubMode;
  onOpenWhy: () => void;
  /** Ausente en historial: elegir portada es una edición. */
  onSetCover?: (src: string) => Promise<{ ok: boolean; error?: string }>;
};

export default function FocusOfferStage({ offer, mode, onOpenWhy, onSetCover }: Props) {
  const ui = moderationUi(mode);
  const gallery = mergeOfferImageUrls(offer.image_url, offer.image_urls ?? null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [allBroken, setAllBroken] = useState(false);
  const [coverSaving, setCoverSaving] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
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

  const handleSetCover = onSetCover
    ? async (src: string) => {
        setCoverSaving(true);
        setCoverError(null);
        const result = await onSetCover(src);
        setCoverSaving(false);
        if (result.ok) setActiveIdx(0);
        else setCoverError(result.error ?? 'No se pudo cambiar la portada');
      }
    : undefined;

  return (
    <div className="flex w-full flex-col gap-4 text-left sm:flex-row sm:items-start">
      <div className="w-full shrink-0 sm:w-52">
        {!allBroken && gallery.length > 0 ? (
          <ModerationImageGallery
            key={gallery.join('|')}
            images={gallery}
            index={activeIdx}
            onIndexChange={setActiveIdx}
            onImageError={() => setAllBroken(true)}
            heroBg={ui.heroBg}
            heroClassName="aspect-square overflow-hidden rounded-2xl"
            thumbClassName="h-11 w-11"
            thumbStripClassName="mt-2 gap-1.5 px-1 pb-0.5"
            onSetCover={handleSetCover}
            coverSaving={coverSaving}
            sendReferer
          />
        ) : (
          <div
            className={cn(
              'flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-4',
              ui.heroBg
            )}
          >
            <ImageOff className={cn('h-8 w-8', ui.iconMuted)} />
            <p className={cn('text-sm font-medium', ui.title)}>Sin imagen</p>
          </div>
        )}
        {coverError ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
            {coverError}
          </p>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
      <h2
        className={cn(
          'line-clamp-3 text-balance text-xl font-semibold leading-snug md:text-2xl',
          ui.title
        )}
      >
        {offer.title}
      </h2>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
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
        {offer.store?.trim() ? <StoreBrandMark store={offer.store} className="text-sm" /> : null}
      </div>

      {(() => {
        const msiLabel = formatMsiCardLabel(offer.msi_months);
        const bankLabel = getBankCouponLabel(offer.bank_coupon);
        const personalCoupon = offer.coupons?.trim() || null;
        if (!msiLabel && !bankLabel && !personalCoupon) return null;
        return (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {msiLabel ? <span className={cn('font-medium', ui.soft)}>{msiLabel}</span> : null}
            {bankLabel ? (
              <span
                className={cn(
                  'font-medium',
                  ui.ws ? 'text-sky-700 dark:text-sky-300' : 'text-sky-300'
                )}
              >
                {formatCupónBancarioDisplay(bankLabel)}
              </span>
            ) : null}
            {personalCoupon ? (
              <span className={cn('font-medium', ui.muted)}>Cupón: {personalCoupon}</span>
            ) : null}
          </div>
        );
      })()}

      <div className="mt-3 w-full max-w-sm">
        <ModerationPriorityHints
          price={offer.price}
          originalPrice={offer.original_price}
          imageUrl={offer.image_url}
          isBot={offer.is_bot}
          createdAt={offer.created_at}
          botMeta={offer.bot_meta}
          density="full"
          className="rounded-xl px-3 py-2 text-left"
          mutedClassName={ui.soft}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
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
    </div>
  );
}
