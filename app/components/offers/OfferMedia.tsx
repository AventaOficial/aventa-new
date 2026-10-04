'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { isNextImageAllowedSrc } from '@/lib/offers/isNextImageAllowedSrc';

type OfferMediaProps = {
  src?: string | null;
  alt: string;
  sizes: string;
  /** Tailwind aspect class. The box is stable so the card does not jump. */
  ratioClass?: string;
  unoptimized?: boolean;
  priority?: boolean;
  className?: string;
};

/**
 * One frame for offer photos. The product keeps its ratio (object-contain).
 * A blurred copy of the same image fills the letterbox so dark mode is not
 * an empty black well and light mode is not a white void.
 */
export default function OfferMedia({
  src,
  alt,
  sizes,
  ratioClass = 'aspect-[4/3]',
  unoptimized = false,
  priority = false,
  className = '',
}: OfferMediaProps) {
  const [failed, setFailed] = useState(false);
  const safeSrc = isNextImageAllowedSrc(src) ? src : null;
  const show = Boolean(safeSrc) && !failed;

  return (
    <div
      className={`relative overflow-hidden bg-[#f3f3f6] dark:bg-[#16161c] ring-1 ring-black/[0.06] dark:ring-white/10 ${ratioClass} ${className}`}
    >
      {show ? (
        <>
          <Image
            src={safeSrc as string}
            alt=""
            fill
            sizes={sizes}
            priority={priority}
            unoptimized={unoptimized}
            aria-hidden
            className="scale-110 object-cover opacity-40 blur-xl dark:opacity-35"
          />
          <Image
            src={safeSrc as string}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            unoptimized={unoptimized}
            className="object-contain object-center p-2"
            onError={() => setFailed(true)}
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Sparkles className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden />
        </div>
      )}
    </div>
  );
}
