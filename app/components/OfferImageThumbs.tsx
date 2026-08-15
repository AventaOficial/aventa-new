'use client';

type OfferImageThumbsProps = {
  images: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

const VISIBLE = 4;

/** Miniaturas bajo la foto principal; el último recuadro muestra +N si hay más. */
export default function OfferImageThumbs({ images, activeIndex, onSelect }: OfferImageThumbsProps) {
  if (images.length <= 1) return null;
  const shown = images.slice(0, VISIBLE);
  const extra = images.length - VISIBLE;
  return (
    <div className="flex gap-1.5 mt-2 px-1">
      {shown.map((src, i) => {
        const isLastVisible = i === VISIBLE - 1 && extra > 0;
        const selected = activeIndex === i || (isLastVisible && activeIndex >= VISIBLE - 1);
        return (
          <button
            key={`${src}-${i}`}
            type="button"
            onClick={() => onSelect(isLastVisible && extra > 0 ? VISIBLE : i)}
            className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border ${
              selected
                ? 'border-violet-500 ring-1 ring-violet-500'
                : 'border-gray-200 dark:border-gray-700'
            }`}
            aria-label={isLastVisible ? `${extra + 1} fotos más` : `Foto ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" />
            {isLastVisible ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/70 text-xs font-semibold text-white">
                +{extra}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
