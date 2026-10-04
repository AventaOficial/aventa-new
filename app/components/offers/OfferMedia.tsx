'use client';

import Image from 'next/image';
import { useState, type SyntheticEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { isNextImageAllowedSrc } from '@/lib/offers/isNextImageAllowedSrc';
import { readEdgeTone, type EdgeTone } from '@/lib/offers/media/edgeTone';

type OfferMediaProps = {
  src?: string | null;
  alt: string;
  sizes: string;
  /** Tailwind aspect class. The box is stable so the card does not jump. */
  ratioClass?: string;
  /**
   * `contain` (default) never crops the product.
   * `cover` only for surfaces that show a scene, never a product packshot.
   */
  fit?: 'contain' | 'cover';
  unoptimized?: boolean;
  priority?: boolean;
  /** Thumbnails (≤64px): tighter padding and an icon-only fallback. */
  compact?: boolean;
  className?: string;
};

/** Same photo appears in feed, detail and favorites: measure its edge once per session. */
const toneCache = new Map<string, EdgeTone>();

type Source = { url: string; optimized: boolean } | null;

/** next/image only for configured hosts; other https stores still render (CSP allows https images). */
function resolveSource(src: string | null | undefined): Source {
  const url = typeof src === 'string' ? src.trim() : '';
  if (!url) return null;
  if (isNextImageAllowedSrc(url)) return { url, optimized: true };
  return /^https:\/\//i.test(url) ? { url, optimized: false } : null;
}

/**
 * One frame for offer photos, reused by every product surface.
 * - Studio shots (uniform edge) sit on a plate of their own edge colour, so the photo
 *   blends into the card instead of floating as a white box inside a dark well.
 * - Transparent PNGs sit on a light plate so dark products keep contrast in dark mode.
 * - Scene photos keep their ratio over a blurred copy of themselves.
 */
export default function OfferMedia({
  src,
  alt,
  sizes,
  ratioClass = 'aspect-[4/3]',
  fit = 'contain',
  unoptimized = false,
  priority = false,
  compact = false,
  className = '',
}: OfferMediaProps) {
  const source = resolveSource(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [tone, setTone] = useState<{ src: string; tone: EdgeTone } | null>(null);
  const show = source != null && failedSrc !== source.url;
  const cached = source ? toneCache.get(source.url) : undefined;
  const edge: EdgeTone | null = cached ?? (tone && tone.src === source?.url ? tone.tone : null);

  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (!source || fit === 'cover' || toneCache.has(source.url)) return;
    const measured = readEdgeTone(event.currentTarget);
    if (!measured) return;
    toneCache.set(source.url, measured);
    setTone({ src: source.url, tone: measured });
  };
  const onError = () => setFailedSrc(source?.url ?? null);

  const plated = show && fit === 'contain' && edge != null && edge.kind !== 'scene';
  const plateStyle =
    plated && edge?.kind === 'plate' ? { backgroundColor: `rgb(${edge.rgb[0]} ${edge.rgb[1]} ${edge.rgb[2]})` } : undefined;
  const mainClass =
    fit === 'cover' ? 'object-cover object-center' : `object-contain object-center ${compact ? 'p-0.5' : plated ? 'p-[6%]' : 'p-1.5'}`;
  const backdropClass = 'scale-110 object-cover opacity-40 blur-xl dark:opacity-35';

  const renderImage = (variant: 'backdrop' | 'main') => {
    if (!source) return null;
    const isBackdrop = variant === 'backdrop';
    if (source.optimized) {
      return (
        <Image
          src={source.url}
          alt={isBackdrop ? '' : alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={unoptimized}
          aria-hidden={isBackdrop || undefined}
          className={isBackdrop ? backdropClass : mainClass}
          onLoad={isBackdrop ? undefined : onLoad}
          onError={isBackdrop ? undefined : onError}
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source.url}
        alt={isBackdrop ? '' : alt}
        aria-hidden={isBackdrop || undefined}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        className={`absolute inset-0 h-full w-full ${isBackdrop ? backdropClass : mainClass}`}
        onLoad={isBackdrop ? undefined : onLoad}
        onError={isBackdrop ? undefined : onError}
      />
    );
  };

  return (
    <div
      data-offer-media={show ? (plated ? edge?.kind : fit === 'cover' ? 'cover' : 'scene') : 'fallback'}
      className={`relative overflow-hidden ring-1 ring-black/[0.06] dark:ring-white/10 ${
        plated ? 'bg-[#f6f6f8] dark:brightness-[0.94]' : 'bg-[#f3f3f6] dark:bg-[#16161c]'
      } ${ratioClass} ${className}`}
      style={plateStyle}
    >
      {show ? (
        <>
          {!plated && fit === 'contain' ? renderImage('backdrop') : null}
          {renderImage('main')}
        </>
      ) : (
        <div
          {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5"
        >
          <Sparkles className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-violet-400/70 dark:text-violet-300/60`} aria-hidden />
          {compact ? null : (
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Sin foto</span>
          )}
        </div>
      )}
    </div>
  );
}
