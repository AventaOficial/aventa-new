'use client';

import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';

type Props = {
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onImageError?: () => void;
  heroBg: string;
  /** Clases extra para el contenedor del hero (altura máxima, etc.). */
  heroClassName?: string;
  showExpand?: boolean;
  onExpand?: () => void;
};

/**
 * Galería de revisión: hero + miniaturas horizontales para ver todas las fotos sin scroll interno.
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
}: Props) {
  if (images.length === 0) return null;

  const safeIndex = Math.min(Math.max(index, 0), images.length - 1);
  const src = images[safeIndex] ?? images[0];

  const goPrev = () => onIndexChange(safeIndex === 0 ? images.length - 1 : safeIndex - 1);
  const goNext = () => onIndexChange(safeIndex === images.length - 1 ? 0 : safeIndex + 1);

  return (
    <div className="shrink-0">
      <div className={`relative w-full ${heroBg} ${heroClassName}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-contain p-3"
          referrerPolicy="no-referrer"
          onError={onImageError}
        />
        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
              aria-label="Imagen anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
              aria-label="Siguiente imagen"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="absolute left-3 top-3 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
              {safeIndex + 1}/{images.length}
            </span>
          </>
        ) : null}
        {showExpand && onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-black/75"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Ampliar
          </button>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto border-b px-3 py-2.5 scrollbar-hide">
          {images.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => onIndexChange(i)}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                i === safeIndex
                  ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                  : 'border-transparent opacity-80 hover:opacity-100'
              }`}
              aria-label={`Ver foto ${i + 1}`}
              aria-current={i === safeIndex ? 'true' : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              {i === 0 ? (
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
