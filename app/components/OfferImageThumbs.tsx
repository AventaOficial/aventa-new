'use client';

type OfferImageThumbsProps = {
  images: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

/** Thumbs claros antes del overflow; el slot +N no tapa una foto seleccionable. */
export const THUMB_CLEAR_SLOTS = 3;

/**
 * Miniaturas bajo la foto principal.
 * Elegir una miniatura solo cambia la imagen activa. No abre el visor.
 */
export default function OfferImageThumbs({
  images,
  activeIndex,
  onSelect,
}: OfferImageThumbsProps) {
  if (images.length <= 1) return null;

  const hasOverflow = images.length > THUMB_CLEAR_SLOTS;
  const clearCount = hasOverflow ? THUMB_CLEAR_SLOTS : images.length;
  const extra = hasOverflow ? images.length - THUMB_CLEAR_SLOTS : 0;
  const shown = images.slice(0, clearCount);
  const overflowSelected = hasOverflow && activeIndex >= THUMB_CLEAR_SLOTS;

  return (
    <div className="mt-2 flex gap-1.5 overflow-x-auto px-1 scrollbar-hide">
      {shown.map((src, i) => {
        const selected = activeIndex === i;
        return (
          <button
            key={`${src}-${i}`}
            type="button"
            onClick={() => onSelect(i)}
            className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border ${
              selected
                ? 'border-violet-500 ring-1 ring-violet-500'
                : 'border-gray-200 dark:border-gray-700'
            }`}
            aria-label={`Foto ${i + 1}`}
            aria-pressed={selected}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          </button>
        );
      })}
      {hasOverflow ? (
        <button
          type="button"
          onClick={() => onSelect(THUMB_CLEAR_SLOTS)}
          className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border ${
            overflowSelected
              ? 'border-violet-500 ring-1 ring-violet-500'
              : 'border-gray-200 dark:border-gray-700'
          }`}
          aria-label={`Ver ${extra} fotos más`}
          aria-pressed={overflowSelected}
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
