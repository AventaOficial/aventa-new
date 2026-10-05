'use client';

import Link from 'next/link';
import { ArrowBigUp, Heart } from 'lucide-react';
import StoreBrandMark from '@/app/components/StoreBrandMark';
import OfferMedia from '@/app/components/offers/OfferMedia';
import { formatOfferMoneyInput } from '@/lib/formatPrice';
import { buildOfferPublicPath } from '@/lib/offerPath';
import type { CardOffer } from '@/lib/offers/transform';

type FavoriteOfferTileProps = {
  offer: CardOffer;
  isFavorite: boolean;
  saving: boolean;
  onToggleFavorite: (offer: CardOffer) => void;
  className?: string;
};

export default function FavoriteOfferTile({ offer, isFavorite, saving, onToggleFavorite, className = '' }: FavoriteOfferTileProps) {
  const price = offer.discountPrice > 0 ? offer.discountPrice : null;
  const before = price != null && offer.originalPrice > price ? offer.originalPrice : null;
  const discount = Math.round(offer.discount);
  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:border-white/10 dark:bg-[#141414] dark:hover:border-violet-500/50 ${className}`}
    >
      <Link
        href={buildOfferPublicPath(offer.id, offer.title)}
        className="flex flex-1 flex-col rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400"
      >
        <div className="relative m-2 mb-0">
          <OfferMedia
            src={offer.image}
            alt={offer.title}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
            ratioClass="aspect-[4/3]"
            className="rounded-xl"
          />
          {discount >= 1 ? (
            <span className="absolute left-2 top-2 rounded-md bg-orange-500 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white shadow-sm">
              -{discount}%<span className="sr-only"> de descuento</span>
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col px-3 pt-3">
          <StoreBrandMark store={offer.brand || 'Tienda'} className="text-[12px]" />
          <h3 className="mt-1.5 line-clamp-2 text-[14px] font-semibold leading-snug text-[#1d1d1f] wrap-anywhere dark:text-[#fafafa]">
            {offer.title}
          </h3>
          <p className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
            {price != null ? (
              <span className="text-[17px] font-bold tracking-tight tabular-nums text-orange-600 dark:text-orange-400">
                ${formatOfferMoneyInput(price)}
              </span>
            ) : (
              <span className="text-[13px] font-medium text-[#6e6e73] dark:text-[#a3a3a3]">Ver precio en tienda</span>
            )}
            {before != null ? (
              <span className="text-[12px] tabular-nums text-[#86868b] line-through dark:text-[#8e8e93]">
                <span className="sr-only">Antes </span>${formatOfferMoneyInput(before)}
              </span>
            ) : null}
          </p>
        </div>
      </Link>

      <div className="mx-2 mb-2 mt-3 flex items-center justify-between rounded-xl border border-black/[0.06] pl-2.5 dark:border-white/10">
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums text-[#1d1d1f] dark:text-[#fafafa]">
          <ArrowBigUp className="h-4 w-4 text-orange-500" aria-hidden />
          {offer.upvotes}
          <span className="sr-only"> votos a favor</span>
        </span>
        <button
          type="button"
          onClick={() => onToggleFavorite(offer)}
          disabled={saving}
          aria-pressed={isFavorite}
          aria-busy={saving}
          aria-label={isFavorite ? `Quitar ${offer.title} de favoritos` : `Guardar ${offer.title} en favoritos`}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[#6e6e73] transition-colors hover:bg-black/[0.04] hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-60 dark:text-[#a3a3a3] dark:hover:bg-white/[0.06] dark:hover:text-[#fafafa] md:h-9 md:w-9"
        >
          <Heart className={`h-4 w-4 ${isFavorite ? 'fill-red-500/90 text-red-500/90' : ''}`} aria-hidden />
        </button>
      </div>
    </article>
  );
}
