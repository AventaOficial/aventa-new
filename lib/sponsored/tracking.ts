import type { SponsoredSurface } from './placements';

export type SponsoredEvent = {
  type: 'impression' | 'click';
  campaignId: string;
  surface: SponsoredSurface;
  /** Índice de la oferta tras la que apareció (feed) o null (rail). */
  position: number | null;
};

export const SPONSORED_EVENT_NAME = 'aventa:sponsored';

/**
 * Punto único de medición de impresiones y clics (CTR = clicks / impressions).
 * Hoy solo emite un evento de navegador: no escribe en base ni llama APIs.
 * Cuando exista un destino aprobado, se conecta aquí sin tocar el feed.
 */
export function trackSponsoredEvent(event: SponsoredEvent): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SponsoredEvent>(SPONSORED_EVENT_NAME, { detail: event }));
}
