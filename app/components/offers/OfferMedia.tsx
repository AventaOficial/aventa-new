'use client';

import Image from 'next/image';
import { useState, type SyntheticEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { offerFrameMode, readEdgeTone, type EdgeTone } from '@/lib/offers/media/edgeTone';
import {
  isImageElementBroken,
  resolveOfferImageSource,
  type OfferImageSource,
} from '@/lib/offers/media/offerImageSource';
import { mergeOfferImageUrls } from '@/lib/offerPath';
import { reportOfferImageFailure, type OfferImageSurface } from '@/lib/offers/media/imageFailureTelemetry';

type OfferMediaProps = {
  src?: string | null;
  /** Other photos of the same offer, tried in order if `src` fails to load. */
  fallbackSrcs?: readonly (string | null | undefined)[] | null;
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
  /** Sampled load-failure signal (host + surface + offer only). */
  telemetry?: { surface: OfferImageSurface; offerId?: string | null };
};

/** Same photo appears in feed, detail and favorites: measure its edge once per session. */
const toneCache = new Map<string, EdgeTone>();

/**
 * Load order: `src`, then each distinct fallback, then `src` once more.
 * Some retail CDNs (Soriana) answer 403 intermittently without caching it, so one retry recovers.
 */
export function offerMediaAttempts(
  src: string | null | undefined,
  fallbackSrcs?: readonly (string | null | undefined)[] | null,
): OfferImageSource[] {
  const primary = resolveOfferImageSource(src);
  const extras = mergeOfferImageUrls(null, (fallbackSrcs ?? []).filter((u): u is string => typeof u === 'string'));
  const seen = new Set<string>();
  const unique: OfferImageSource[] = [];
  for (const candidate of [primary, ...extras.map((u) => resolveOfferImageSource(u))]) {
    if (!candidate || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    unique.push(candidate);
  }
  return unique.length > 0 ? [...unique, unique[0]] : [];
}

export type OfferMediaFailure = { key: string; count: number };

/** One step per failed attempt; a late or duplicate error for an older attempt is ignored. */
export function advanceOfferMediaFailure(
  prev: OfferMediaFailure,
  attemptsKey: string,
  failedAttempt: number,
): OfferMediaFailure {
  const count = prev.key === attemptsKey ? prev.count : 0;
  return count === failedAttempt ? { key: attemptsKey, count: count + 1 } : prev;
}

/**
 * One frame for offer photos, reused by every product surface.
 * - Studio shots (uniform edge) sit on a plate of their own edge colour, so the photo
 *   blends into the card instead of floating as a white box inside a dark well.
 * - Unmeasured, transparent or cross-origin photos sit on a light neutral plate.
 * - Only photos measured as scenes get a blurred copy of themselves behind them.
 */
export default function OfferMedia({
  src,
  fallbackSrcs,
  alt,
  sizes,
  ratioClass = 'aspect-[4/3]',
  fit = 'contain',
  unoptimized = false,
  priority = false,
  compact = false,
  className = '',
  telemetry,
}: OfferMediaProps) {
  const attempts = offerMediaAttempts(src, fallbackSrcs);
  const attemptsKey = attempts.map((a) => a.url).join('\n');
  const [failure, setFailure] = useState<OfferMediaFailure>({ key: attemptsKey, count: 0 });
  const failedCount = failure.key === attemptsKey ? failure.count : 0;
  const source = attempts[failedCount] ?? null;
  const [tone, setTone] = useState<{ src: string; tone: EdgeTone } | null>(null);
  const show = source != null;
  const cached = source ? toneCache.get(source.url) : undefined;
  const edge: EdgeTone | null = cached ?? (tone && tone.src === source?.url ? tone.tone : null);

  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (!source || fit === 'cover' || toneCache.has(source.url)) return;
    const measured = readEdgeTone(event.currentTarget);
    if (!measured) return;
    toneCache.set(source.url, measured);
    setTone({ src: source.url, tone: measured });
  };
  const markFailed = () => {
    if (!source) return;
    setFailure((prev) => advanceOfferMediaFailure(prev, attemptsKey, failedCount));
    if (telemetry) {
      reportOfferImageFailure({ src: source.url, surface: telemetry.surface, offerId: telemetry.offerId });
    }
  };
  const onError = () => markFailed();
  // Server-rendered photos can fail before hydration, when React has not attached onError yet.
  const attachMain = (node: HTMLImageElement | null) => {
    if (isImageElementBroken(node)) markFailed();
  };

  const mode = offerFrameMode(edge, fit);
  const plated = show && (mode === 'plate' || mode === 'neutral');
  const plateStyle =
    show && mode === 'plate' && edge?.kind === 'plate'
      ? { backgroundColor: `rgb(${edge.rgb[0]} ${edge.rgb[1]} ${edge.rgb[2]})` }
      : undefined;
  const mainClass =
    mode === 'cover' ? 'object-cover object-center' : `object-contain object-center ${compact ? 'p-0.5' : plated ? 'p-[6%]' : 'p-1.5'}`;
  const backdropClass = 'scale-110 object-cover opacity-40 blur-xl dark:opacity-35';

  const renderImage = (variant: 'backdrop' | 'main') => {
    if (!source) return null;
    const isBackdrop = variant === 'backdrop';
    if (source.optimized) {
      return (
        <Image
          key={`${variant}-${failedCount}`}
          src={source.url}
          alt={isBackdrop ? '' : alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={unoptimized}
          aria-hidden={isBackdrop || undefined}
          ref={isBackdrop ? undefined : attachMain}
          className={isBackdrop ? backdropClass : mainClass}
          onLoad={isBackdrop ? undefined : onLoad}
          onError={isBackdrop ? undefined : onError}
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`${variant}-${failedCount}`}
        src={source.url}
        alt={isBackdrop ? '' : alt}
        aria-hidden={isBackdrop || undefined}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        ref={isBackdrop ? undefined : attachMain}
        className={`absolute inset-0 h-full w-full ${isBackdrop ? backdropClass : mainClass}`}
        onLoad={isBackdrop ? undefined : onLoad}
        onError={isBackdrop ? undefined : onError}
      />
    );
  };

  return (
    <div
      data-offer-media={show ? mode : 'fallback'}
      className={`relative overflow-hidden ring-1 ring-black/[0.06] ${
        plated ? 'bg-[#f6f6f8] dark:ring-white/[0.06] dark:brightness-[0.94]' : 'bg-[#f3f3f6] dark:bg-[#16161c] dark:ring-white/10'
      } ${ratioClass} ${className}`}
      style={plateStyle}
    >
      {show ? (
        <>
          {mode === 'scene' ? renderImage('backdrop') : null}
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
