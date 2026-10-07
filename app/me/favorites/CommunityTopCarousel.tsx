'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchHomeFeedFromAPI } from '@/lib/offers/homeFeedClient';
import { mapOfferToCard, type CardOffer } from '@/lib/offers/transform';
import FavoriteOfferTile from './FavoriteOfferTile';

type CommunityTopCarouselProps = {
  favoriteIds: ReadonlySet<string>;
  savingId: string | null;
  onToggleFavorite: (offer: CardOffer) => void;
};

const TILE_WIDTH = 'w-[calc(50%-0.375rem)] sm:w-[calc(33.333%-0.5rem)] lg:w-[calc(25%-0.5625rem)]';

export default function CommunityTopCarousel({ favoriteIds, savingId, onToggleFavorite }: CommunityTopCarouselProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'hidden'>('loading');
  const [offers, setOffers] = useState<CardOffer[]>([]);
  const [page, setPage] = useState({ index: 0, count: 1 });
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHomeFeedFromAPI({ limit: 12, viewMode: 'top', timeFilter: 'week', categoryFilter: null, storeFilter: null })
      .then(({ items }) => {
        if (cancelled) return;
        const mapped = items.map(mapOfferToCard);
        setOffers(mapped);
        setStatus(mapped.length > 0 ? 'ready' : 'hidden');
      })
      .catch(() => {
        if (!cancelled) setStatus('hidden');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const count = Math.max(1, Math.ceil((el.scrollWidth - 1) / el.clientWidth));
    const index = Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth));
    setPage((prev) => (prev.index === index && prev.count === count ? prev : { index, count }));
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [status, measure]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth, behavior: 'smooth' });
  };

  if (status === 'hidden') return null;

  const atStart = page.index === 0;
  const atEnd = page.index >= page.count - 1;

  return (
    <section aria-labelledby="favorites-community-top" className="border-t border-white/10 pt-8">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="favorites-community-top" className="flex items-center gap-2 text-[18px] font-bold text-white">
            <span className="h-4 w-1 rounded-full bg-violet-600" aria-hidden />
            Lo más votado de la comunidad
          </h2>
          <p className="mt-0.5 text-[13px] text-white/65">Las ofertas con más votos esta semana en Aventa.</p>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-violet-300 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          Ver más
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="relative">
        {status === 'loading' ? (
          <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Cargando ofertas más votadas">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`${TILE_WIDTH} h-72 shrink-0 animate-pulse rounded-2xl bg-white/10`} />
            ))}
          </div>
        ) : (
          <>
            <div
              ref={scrollerRef}
              onScroll={measure}
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {offers.map((offer) => (
                <FavoriteOfferTile
                  key={offer.id}
                  offer={offer}
                  isFavorite={favoriteIds.has(offer.id)}
                  saving={savingId === offer.id}
                  onToggleFavorite={onToggleFavorite}
                  className={`${TILE_WIDTH} shrink-0 snap-start`}
                />
              ))}
            </div>
            {page.count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => scrollByPage(-1)}
                  disabled={atStart}
                  aria-label="Ver ofertas anteriores"
                  className="absolute left-0 top-[38%] hidden h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-[#1d1d1f] shadow-md transition-opacity hover:bg-[#f5f5f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:pointer-events-none disabled:opacity-0 dark:border-white/15 dark:bg-[#1c1c1e] dark:text-[#fafafa] dark:hover:bg-[#262626] md:flex"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => scrollByPage(1)}
                  disabled={atEnd}
                  aria-label="Ver más ofertas"
                  className="absolute right-0 top-[38%] hidden h-11 w-11 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-[#1d1d1f] shadow-md transition-opacity hover:bg-[#f5f5f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:pointer-events-none disabled:opacity-0 dark:border-white/15 dark:bg-[#1c1c1e] dark:text-[#fafafa] dark:hover:bg-[#262626] md:flex"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
                <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
                  {Array.from({ length: page.count }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-200 ${
                        i === page.index ? 'w-5 bg-violet-600 dark:bg-violet-400' : 'w-1.5 bg-black/15 dark:bg-white/20'
                      }`}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
