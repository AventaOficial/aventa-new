'use client';

type OfferImageThumbsProps = {
  images: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /** Al pulsar +N (o cualquier thumb) abre lightbox en ese índice. */
  onOpenGallery?: (index: number) => void;
};

/** Thumbs claros antes del overflow; el slot +N no tapa una foto seleccionable. */
export const THUMB_CLEAR_SLOTS = 3;

/**
 * Miniaturas bajo la foto principal.
 * Si hay más de THUMB_CLEAR_SLOTS fotos, muestra 3 thumbs + slot +N que abre la galería.
 */
export default function OfferImageThumbs({
  images,
  activeIndex,
  onSelect,
  onOpenGallery,
}: OfferImageThumbsProps) {
  if (images.length <= 1) return null;

  const hasOverflow = images.length > THUMB_CLEAR_SLOTS;
  const clearCount = hasOverflow ? THUMB_CLEAR_SLOTS : images.length;
  const extra = hasOverflow ? images.length - THUMB_CLEAR_SLOTS : 0;
  const shown = images.slice(0, clearCount);

  return (
    <div className="mt-2 flex gap-1.5 px-1 overflow-x-auto scrollbar-hide">
      {shown.map((src, i) => {
        const selected = activeIndex === i;
        return (
          <button
            key={`${src}-${i}`}
            type="button"
            onClick={() => {
              onSelect(i);
              onOpenGallery?.(i);
            }}
            className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border ${
              selected
                ? 'border-violet-500 ring-1 ring-violet-500'
                : 'border-gray-200 dark:border-gray-700'
            }`}
            aria-label={`Foto ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          </button>
        );
      })}
      {hasOverflow ? (
        <button
          type="button"
          onClick={() => {
            const openAt = THUMB_CLEAR_SLOTS;
            onSelect(openAt);
            onOpenGallery?.(openAt);
          }}
          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
          aria-label={`Ver ${extra} fotos más`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[THUMB_CLEAR_SLOTS] ?? images[0]}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/70 text-xs font-semibold text-white">
            +{extra}
          </span>
        </button>
      ) : null}
    </div>
  );
}
