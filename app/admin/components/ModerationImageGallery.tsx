'use client';

import { useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import {
  clampGalleryIndex,
  indexAfterImageFailure,
  stepGalleryIndex,
  workingGalleryImages,
} from '@/lib/moderation/galleryNavigation';

type Props = {
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  /** Solo cuando fallaron todas las fotos (el padre muestra "Sin foto"). */
  onImageError?: () => void;
  heroBg: string;
  /** Clases extra para el contenedor del hero (altura máxima, etc.). */
  heroClassName?: string;
  showExpand?: boolean;
  onExpand?: (src: string) => void;
  /** Si existe, la foto activa se puede elegir como portada. */
  onSetCover?: (src: string) => void;
  coverSaving?: boolean;
  /** Tamaño de las miniaturas. */
  thumbClassName?: string;
  thumbStripClassName?: string;
};

const SWIPE_MIN_PX = 40;

/**
 * Galería de revisión: hero + miniaturas, flechas, teclado (←/→ con foco), deslizar en móvil
 * y contador. Una foto rota se salta sin ocultar las demás. Montar con `key` por oferta
 * para que el índice y las fotos rotas no se arrastren entre ofertas.
 */
export default function ModerationImageGallery({
  images,
  index,
  onIndexChange,
  onImageError,
  heroBg,
  heroClassName = 'aspect-[4/3] max-h-[min(40vh,360px)]',
  showExpand = false,
  onExpand,
  onSetCover,
  coverSaving = false,
  thumbClassName = 'h-14 w-14',
  thumbStripClassName = 'gap-2 border-b px-3 py-2.5',
}: Props) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const touchStartX = useRef<number | null>(null);

  const visible = workingGalleryImages(images, failed);
  if (visible.length === 0) return null;

  const safeIndex = clampGalleryIndex(index, visible.length);
  const src = visible[safeIndex];
  const isCover = src === images[0];
  const many = visible.length > 1;

  const go = (direction: 1 | -1) => onIndexChange(stepGalleryIndex(safeIndex, visible.length, direction));

  const handleError = (url: string) => {
    if (failed.has(url)) return;
    const nextIndex = indexAfterImageFailure(images, failed, url);
    setFailed(new Set([...failed, url]));
    if (nextIndex < 0) {
      onImageError?.();
      return;
    }
    if (url === src) onIndexChange(nextIndex);
    else if (visible.indexOf(url) < safeIndex) onIndexChange(Math.max(0, safeIndex - 1));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!many) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      go(e.key === 'ArrowLeft' ? -1 : 1);
    }
  };

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (!many || start == null || end == null) return;
    const dx = end - start;
    if (Math.abs(dx) >= SWIPE_MIN_PX) go(dx > 0 ? -1 : 1);
  };

  return (
    <div className="shrink-0" data-moderation-gallery>
      <div
        className={`relative w-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${heroBg} ${heroClassName}`}
        tabIndex={many ? 0 : undefined}
        role={many ? 'region' : undefined}
        aria-roledescription={many ? 'carrusel' : undefined}
        aria-label={many ? `Foto ${safeIndex + 1} de ${visible.length}` : undefined}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={src}
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-contain p-3"
          referrerPolicy="no-referrer"
          onError={() => handleError(src)}
        />
        {many ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Imagen anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Siguiente imagen"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span
              className="absolute left-3 top-3 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums"
              aria-live="polite"
            >
              {safeIndex + 1}/{visible.length}
            </span>
          </>
        ) : null}
        <div className="absolute bottom-3 right-3 flex flex-wrap justify-end gap-1.5">
          {isCover && many ? (
            <span className="rounded-lg bg-emerald-600/90 px-2 py-1 text-[11px] font-semibold text-white">
              Portada
            </span>
          ) : null}
          {onSetCover && !isCover ? (
            <button
              type="button"
              disabled={coverSaving}
              onClick={() => onSetCover(src)}
              className="rounded-lg bg-black/60 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-black/80 disabled:opacity-50"
            >
              {coverSaving ? 'Guardando…' : 'Usar como portada'}
            </button>
          ) : null}
          {showExpand && onExpand ? (
            <button
              type="button"
              onClick={() => onExpand(src)}
              className="inline-flex items-center gap-1 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-black/75"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Ampliar
            </button>
          ) : null}
        </div>
      </div>

      {many ? (
        <div className={`flex overflow-x-auto scrollbar-hide ${thumbStripClassName}`} aria-label="Fotos de la oferta">
          {visible.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => onIndexChange(i)}
              className={`relative ${thumbClassName} shrink-0 overflow-hidden rounded-lg border-2 ${
                i === safeIndex
                  ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                  : 'border-transparent opacity-80 hover:opacity-100'
              }`}
              aria-label={`Ver foto ${i + 1}`}
              aria-current={i === safeIndex ? 'true' : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => handleError(url)}
              />
              {url === images[0] ? (
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-[9px] font-semibold text-white">
                  Portada
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
