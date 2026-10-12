'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import OfferMedia from '@/app/components/offers/OfferMedia';

type OfferImageThumbsProps = {
  images: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
  offerId?: string | null;
};

/** Miniaturas que se asumen visibles antes de medir el carrusel (SSR / primer render). */
export const THUMB_CLEAR_SLOTS = 3;

export function galleryOverflowExtra(total: number, clearSlots = THUMB_CLEAR_SLOTS): number | null {
  if (total <= 1 || total <= clearSlots) return null;
  return total - clearSlots;
}

export function galleryFirstOverflowIndex(total: number, clearSlots = THUMB_CLEAR_SLOTS): number | null {
  if (total <= clearSlots) return null;
  return clearSlots;
}

export type HiddenThumbs = { firstHidden: number; count: number };

/**
 * Miniaturas a la derecha que no caben completas en el carrusel.
 * `thumbRightEdges` son los bordes derechos de cada miniatura relativos al contenido desplazable.
 */
export function hiddenThumbsAfterViewport(
  thumbRightEdges: number[],
  viewportRight: number,
): HiddenThumbs | null {
  const firstHidden = thumbRightEdges.findIndex((right) => right > viewportRight + 1);
  if (firstHidden < 0) return null;
  return { firstHidden, count: thumbRightEdges.length - firstHidden };
}

/** Destino del control +N: la primera miniatura oculta, o la siguiente a la activa si ya está oculta. */
export function overflowTarget(hidden: HiddenThumbs, activeIndex: number, total: number): number {
  if (activeIndex >= hidden.firstHidden && activeIndex + 1 < total) return activeIndex + 1;
  return hidden.firstHidden;
}

/**
 * Miniaturas bajo la foto principal — carrusel horizontal con todas las imágenes.
 * Elegir una miniatura solo cambia la imagen activa. No abre el visor.
 */
export default function OfferImageThumbs({
  images,
  activeIndex,
  onSelect,
  offerId = null,
}: OfferImageThumbsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [hidden, setHidden] = useState<HiddenThumbs | null>(null);

  const fallbackExtra = galleryOverflowExtra(images.length);
  const fallbackFirst = galleryFirstOverflowIndex(images.length);
  const overflow: HiddenThumbs | null = measured
    ? hidden
    : fallbackExtra != null && fallbackFirst != null
      ? { firstHidden: fallbackFirst, count: fallbackExtra }
      : null;

  const updateScrollAffordances = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const edges = Array.from(el.children).map((child) => {
      const node = child as HTMLElement;
      return node.offsetLeft + node.offsetWidth;
    });
    setCanScrollLeft(el.scrollLeft > 4);
    setHidden(hiddenThumbsAfterViewport(edges, el.scrollLeft + el.clientWidth));
    setMeasured(true);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollAffordances();
    el.addEventListener('scroll', updateScrollAffordances, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollAffordances) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollAffordances);
      ro?.disconnect();
    };
  }, [images.length, updateScrollAffordances]);

  /** Solo desplaza el carrusel en horizontal; nunca mueve el scroll vertical de la página. */
  const scrollThumbIntoView = useCallback((index: number) => {
    const el = scrollRef.current;
    const thumb = el?.children[index] as HTMLElement | undefined;
    if (!el || !thumb) return;
    const left = thumb.offsetLeft;
    const right = left + thumb.offsetWidth;
    if (left < el.scrollLeft) {
      el.scrollTo({ left, behavior: 'smooth' });
    } else if (right > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: right - el.clientWidth, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollThumbIntoView(activeIndex);
  }, [activeIndex, scrollThumbIntoView]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = Math.max(el.clientWidth * 0.75, 120) * direction;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const revealOverflow = () => {
    if (!overflow) return;
    const target = overflowTarget(overflow, activeIndex, images.length);
    onSelect(target);
    scrollThumbIntoView(target);
  };

  if (images.length <= 1) return null;

  const arrowClass =
    'hidden md:inline-flex h-14 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-gray-200 dark:hover:bg-[#222]';

  return (
    <div className="mt-2 flex items-center gap-1" data-gallery-thumbs>
      {canScrollLeft ? (
        <button
          type="button"
          onClick={() => scrollByPage(-1)}
          className={arrowClass}
          aria-label="Desplazar miniaturas hacia la izquierda"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      ) : null}

      <div
        ref={scrollRef}
        role="group"
        aria-label={`Miniaturas (${images.length} fotos)`}
        className="relative flex min-w-0 flex-1 snap-x snap-proximity gap-1.5 overflow-x-auto overscroll-x-contain p-0.5 scrollbar-hide touch-pan-x touch-pan-y"
      >
        {images.map((src, i) => {
          const selected = activeIndex === i;
          return (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => onSelect(i)}
              className={`relative h-14 w-14 shrink-0 snap-start overflow-hidden rounded-lg border ${
                selected
                  ? 'border-violet-500 ring-1 ring-violet-500'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
              aria-label={`Foto ${i + 1} de ${images.length}`}
              aria-pressed={selected}
            >
              <OfferMedia
                src={src}
                alt=""
                sizes="56px"
                ratioClass="h-full w-full"
                fit="cover"
                compact
                telemetry={{ surface: 'detail_thumb', offerId }}
              />
            </button>
          );
        })}
      </div>

      {overflow ? (
        <button
          type="button"
          onClick={revealOverflow}
          className="inline-flex h-14 min-w-[3.5rem] shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-900 px-2 text-xs font-semibold text-white hover:bg-gray-800 dark:border-gray-700 dark:bg-[#1a1a1a] dark:text-gray-100 dark:hover:bg-[#222]"
          aria-label={`Ver ${overflow.count} ${overflow.count === 1 ? 'foto más' : 'fotos más'}`}
          data-gallery-overflow
        >
          +{overflow.count}
        </button>
      ) : null}

      {overflow ? (
        <button
          type="button"
          onClick={() => scrollByPage(1)}
          className={arrowClass}
          aria-label="Desplazar miniaturas hacia la derecha"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
