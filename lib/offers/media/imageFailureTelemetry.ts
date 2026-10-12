import { logEvent, type LogEventInput } from '@/lib/monitoring/clientLogger';
import { offerImageHost } from '@/lib/offers/media/offerImageSource';

export type OfferImageSurface =
  | 'card'
  | 'featured_card'
  | 'detail'
  | 'detail_thumb'
  | 'gallery'
  | 'gallery_thumb'
  | 'other';

export const OFFER_IMAGE_FAILURE_SOURCE = 'offer_image:load_failed';

/** Una de cada cinco fallas únicas: suficiente para ver hosts rotos sin inundar el buffer de eventos. */
export const OFFER_IMAGE_FAILURE_SAMPLE_RATE = 0.2;

export type OfferImageFailureInput = {
  src: string | null | undefined;
  surface: OfferImageSurface;
  offerId?: string | null;
};

/** Solo host, superficie y oferta: la URL completa (con query) nunca sale del navegador. */
export function buildOfferImageFailureEvent(input: OfferImageFailureInput): LogEventInput {
  return {
    type: 'error',
    source: OFFER_IMAGE_FAILURE_SOURCE,
    metadata: {
      host: offerImageHost(input.src) ?? 'unknown',
      surface: input.surface,
      offerId: input.offerId?.trim() || null,
    },
  };
}

const reported = new Set<string>();

export function reportOfferImageFailure(
  input: OfferImageFailureInput,
  random: () => number = Math.random,
): boolean {
  const event = buildOfferImageFailureEvent(input);
  const meta = event.metadata as { host: string; surface: string; offerId: string | null };
  const key = `${meta.surface}|${meta.host}|${meta.offerId ?? ''}`;
  if (reported.has(key)) return false;
  reported.add(key);
  if (random() >= OFFER_IMAGE_FAILURE_SAMPLE_RATE) return false;
  logEvent(event);
  return true;
}

export function resetOfferImageFailureTelemetryForTests(): void {
  reported.clear();
}
