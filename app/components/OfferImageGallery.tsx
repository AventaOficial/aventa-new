'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

type OfferImageGalleryProps = {
  images: string[];
  /** Índice controlado por el padre (hero / thumbs). */
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  alt?: string;
};

/**
 * Lightbox reutilizable para galerías de oferta.
 * Un solo portal — índice controlado por el padre.
 */
export default function OfferImageGallery({
  images,
  index,
  open,
  onClose,
  onIndexChange,
  alt = '',
}: OfferImageGalleryProps) {
  const touchStartX = useRef<number | null>(null);
  const [broken, setBroken] = useState<Record<number, boolean>>({});

  const safeIndex =
    images.length === 0 ? 0 : Math.min(Math.max(index, 0), images.length - 1);

  const goTo = useCallback(
    (next: number) => {
      if (images.length === 0) return;
      const safe = ((next % images.length) + images.length) % images.length;
      onIndexChange(safe);
    },
    [images.length, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(safeIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(safeIndex + 1);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, goTo, safeIndex]);

  if (typeof document === 'undefined' || !open || images.length === 0) return null;

  const src = images[safeIndex] ?? images[0];
  const showNav = images.length > 1;
  const imageBroken = broken[safeIndex] === true;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) < 48) return;
    if (delta > 0) goTo(safeIndex - 1);
    else goTo(safeIndex + 1);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Galería de imágenes"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-full w-full max-w-4xl flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex items-center justify-between gap-3 text-white">
          <span className="text-sm font-medium tabular-nums">
            {safeIndex + 1} / {images.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/10 p-2 hover:bg-white/20"
            aria-label="Cerrar galería"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative flex min-h-[40vh] flex-1 items-center justify-center">
          {showNav ? (
            <button
              type="button"
              onClick={() => goTo(safeIndex - 1)}
              className="absolute left-0 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/50 p-2.5 text-white hover:bg-black/70 sm:left-2"
              aria-label="Imagen anterior"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : null}
          {imageBroken ? (
            <div className="flex max-h-[min(75vh,720px)] max-w-full flex-col items-center justify-center gap-2 rounded-xl bg-white/10 px-8 py-16 text-center text-white/80">
              <p className="text-sm font-medium">No se pudo cargar esta imagen</p>
              {showNav ? (
                <button
                  type="button"
                  className="text-xs underline underline-offset-2 hover:text-white"
                  onClick={() => goTo(safeIndex + 1)}
                >
                  Ver siguiente
                </button>
              ) : null}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${src}-${safeIndex}`}
              src={src}
              alt={alt}
              className="max-h-[min(75vh,720px)] max-w-full object-contain"
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => setBroken((prev) => ({ ...prev, [safeIndex]: true }))}
            />
          )}
          {showNav ? (
            <button
              type="button"
              onClick={() => goTo(safeIndex + 1)}
              className="absolute right-0 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/50 p-2.5 text-white hover:bg-black/70 sm:right-2"
              aria-label="Siguiente imagen"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          ) : null}
        </div>

        {showNav ? (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {images.map((url, i) => (
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => goTo(i)}
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                  i === safeIndex ? 'border-white' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
                aria-label={`Foto ${i + 1}`}
                aria-current={i === safeIndex ? 'true' : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
