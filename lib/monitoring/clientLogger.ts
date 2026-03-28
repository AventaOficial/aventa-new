export type ClientLogEventType = 'view' | 'vote' | 'error' | 'api_error';

export type LogEventInput = {
  type: ClientLogEventType;
  source: string;
  metadata?: Record<string, unknown>;
};

function shouldSendRemote(payload: LogEventInput): boolean {
  if (typeof process === 'undefined') return false;
  if (process.env.NEXT_PUBLIC_CLIENT_EVENTS_ENABLED === 'true') return true;
  return payload.metadata?.alert === 'feed_streak_5';
}

/**
 * Visibilidad en cliente: consola en desarrollo; opcionalmente POST a /api/log-client-event
 * si NEXT_PUBLIC_CLIENT_EVENTS_ENABLED=true, o siempre para metadata.alert === feed_streak_5.
 */
export function logEvent(payload: LogEventInput): void {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[AVENTA:event]', payload.type, payload.source, payload.metadata ?? {});
  }

  if (typeof window === 'undefined') return;
  if (!shouldSendRemote(payload)) return;

  try {
    void fetch('/api/log-client-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: payload.type,
        source: payload.source,
        metadata: payload.metadata ?? {},
        ts: new Date().toISOString(),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
