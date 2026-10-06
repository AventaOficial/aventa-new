'use client';

import { Heart, Flame, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { applyFavoriteToggle } from '@/lib/offers/applyFavoriteToggle';
import StoreBrandMark from './StoreBrandMark';
import OfferMedia from '@/app/components/offers/OfferMedia';
import { presentOfferPrice } from '@/lib/formatPrice';

type FeaturedOfferCardProps = {
  offerId?: string;
  title: string;
  brand: string;
  image?: string;
  originalPrice: number;
  discountPrice: number;
  sourceCurrency?: string | null;
  discount: number;
  isLiked?: boolean;
  isTesterOffer?: boolean;
  onCardClick?: () => void;
  onFavoriteChange?: (isFavorite: boolean) => void;
};

export default function FeaturedOfferCard({
  offerId,
  title,
  brand,
  image,
  originalPrice,
  discountPrice,
  sourceCurrency = null,
  discount,
  isLiked: isLikedProp = false,
  isTesterOffer = false,
  onCardClick,
  onFavoriteChange,
}: FeaturedOfferCardProps) {
  const { session } = useAuth();
  const [localLiked, setLocalLiked] = useState<boolean | null>(null);
  const [favoritePending, setFavoritePending] = useState(false);
  const isLiked = localLiked !== null ? localLiked : isLikedProp;
  const discountPct =
    discount > 0
      ? discount
      : originalPrice > 0 && discountPrice < originalPrice
        ? Math.round((1 - discountPrice / originalPrice) * 100)
        : 0;

  const savings = originalPrice > discountPrice && originalPrice > 0 ? originalPrice - discountPrice : 0;
  const imageUnoptimized = Boolean(image) && (image!.startsWith('/') || image!.includes('placehold.co'));

  return (
    <article
      onClick={onCardClick}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-[#e8e8ed] bg-white dark:border-[#2a2a2a] dark:bg-[#141414]"
    >
      <div className="flex items-center px-3.5 pt-3">
        <StoreBrandMark store={brand || 'Tienda'} className="text-xs" />
      </div>
      <div className="relative px-3 pt-2">
        <OfferMedia
          src={image}
          alt={title}
          sizes="240px"
          ratioClass="aspect-[4/3]"
          unoptimized={imageUnoptimized}
          className="rounded-xl"
        />
        {discountPct >= 1 ? (
          <span className="absolute left-5 top-4 inline-flex items-center gap-0.5 rounded-md bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            <Flame className="h-3 w-3" aria-hidden />
            -{discountPct}%
          </span>
        ) : null}
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            if (isTesterOffer || !offerId || !session || favoritePending) return;
            const prev = isLiked;
            setFavoritePending(true);
            setLocalLiked(!prev);
            onFavoriteChange?.(!prev);
            try {
              const result = await applyFavoriteToggle({
                client: createClient(),
                userId: session.user.id,
                offerId,
                wasFavorite: prev,
              });
              setLocalLiked(result.isFavorite);
              onFavoriteChange?.(result.isFavorite);
            } finally {
              setFavoritePending(false);
            }
          }}
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-gray-400 dark:bg-[#141414]/90"
          aria-label={isLiked ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        >
          <Heart className={`h-4 w-4 ${isLiked ? 'fill-red-500/90 text-red-500/90' : ''}`} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[#1d1d1f] dark:text-[#fafafa]">
          {title}
        </h3>
        <div className="mt-auto">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums text-violet-600 dark:text-violet-400">
              {presentOfferPrice(discountPrice, sourceCurrency)}
            </span>
            {originalPrice > discountPrice && originalPrice > 0 ? (
              <span className="text-xs text-gray-400 line-through tabular-nums">
                {presentOfferPrice(originalPrice, sourceCurrency)}
              </span>
            ) : null}
          </div>
          {savings > 0 ? (
            <p className="mt-0.5 text-xs tabular-nums text-gray-500 dark:text-gray-400">
              Ahorras {presentOfferPrice(savings, sourceCurrency)}
            </p>
          ) : null}
        </div>
        <span className="inline-flex items-center justify-center gap-1 rounded-xl border border-violet-600 px-3 py-2 text-xs font-semibold text-violet-600 transition-colors group-hover:bg-violet-600 group-hover:text-white dark:border-violet-500 dark:text-violet-400">
          Ver oferta
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
    </article>
  );
}
