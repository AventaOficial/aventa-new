'use client';

import Image from 'next/image';
import { Heart, Flame, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import StoreBrandMark from './StoreBrandMark';

const formatPrice = (value: number) =>
  new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

type FeaturedOfferCardProps = {
  offerId?: string;
  title: string;
  brand: string;
  image?: string;
  originalPrice: number;
  discountPrice: number;
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
  discount,
  isLiked: isLikedProp = false,
  isTesterOffer = false,
  onCardClick,
  onFavoriteChange,
}: FeaturedOfferCardProps) {
  const { session } = useAuth();
  const [localLiked, setLocalLiked] = useState<boolean | null>(null);
  const isLiked = localLiked !== null ? localLiked : isLikedProp;
  const discountPct =
    discount > 0
      ? discount
      : originalPrice > 0 && discountPrice < originalPrice
        ? Math.round((1 - discountPrice / originalPrice) * 100)
        : 0;

  return (
    <article
      onClick={onCardClick}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[#e8e8ed] bg-white dark:border-[#2a2a2a] dark:bg-[#141414]"
    >
      <div className="relative aspect-[4/3] bg-[#f5f5f7] dark:bg-[#1a1a1a]">
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="(max-width: 1280px) 30vw, 280px"
            className="object-contain p-3"
            unoptimized={image.startsWith('/') || image.includes('placehold.co')}
          />
        ) : null}
        {discountPct >= 1 ? (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-0.5 rounded-md bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            <Flame className="h-3 w-3" aria-hidden />
            -{discountPct}%
          </span>
        ) : null}
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            if (isTesterOffer || !offerId || !session) return;
            const prev = isLiked;
            setLocalLiked(!prev);
            onFavoriteChange?.(!prev);
            const supabase = createClient();
            if (prev) {
              const { error } = await supabase
                .from('offer_favorites')
                .delete()
                .eq('offer_id', offerId)
                .eq('user_id', session.user.id);
              if (error) {
                setLocalLiked(prev);
                onFavoriteChange?.(prev);
              }
            } else {
              const { error } = await supabase.from('offer_favorites').insert({
                user_id: session.user.id,
                offer_id: offerId,
              });
              if (error) {
                setLocalLiked(prev);
                onFavoriteChange?.(prev);
              }
            }
          }}
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-gray-400 dark:bg-[#141414]/90"
          aria-label={isLiked ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        >
          <Heart className={`h-4 w-4 ${isLiked ? 'fill-red-500/90 text-red-500/90' : ''}`} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <StoreBrandMark store={brand || 'Tienda'} className="text-xs" />
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[#1d1d1f] dark:text-[#fafafa]">
          {title}
        </h3>
        <div className="mt-auto flex items-baseline gap-2">
          <span className="text-lg font-semibold tabular-nums text-violet-600 dark:text-violet-400">
            ${formatPrice(discountPrice)}
          </span>
          {originalPrice > discountPrice && originalPrice > 0 ? (
            <span className="text-xs text-gray-400 line-through tabular-nums">
              ${formatPrice(originalPrice)}
            </span>
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
