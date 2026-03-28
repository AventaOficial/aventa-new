import { logEvent } from '@/lib/monitoring/clientLogger';

let consecutiveHomeFeedErrors = 0;

/**
 * Errores seguidos al cargar el feed en home (incluye búsqueda y “Para ti”).
 * Tras 5: console.warn, logEvent con alerta (siempre intenta POST) y webhook opcional en servidor.
 */
export function recordFeedLoadSuccess(): void {
  consecutiveHomeFeedErrors = 0;
}

export function recordFeedLoadFailure(meta?: Record<string, unknown>): void {
  consecutiveHomeFeedErrors += 1;
  if (consecutiveHomeFeedErrors < 5) return;

  console.warn('[AVENTA] Visibilidad: 5+ errores seguidos al cargar el feed', meta ?? {});
  logEvent({
    type: 'error',
    source: 'feed:consecutive_failures',
    metadata: { ...meta, count: consecutiveHomeFeedErrors, alert: 'feed_streak_5' },
  });
  consecutiveHomeFeedErrors = 0;
}
