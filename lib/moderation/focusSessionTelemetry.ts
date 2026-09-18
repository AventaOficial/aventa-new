/**
 * Telemetría mínima de sesión Focus (sin PII, sin URLs).
 * Fail-soft: nunca tumba el flujo de moderación.
 */

export type FocusSessionTelemetryEvent =
  | 'claim'
  | 'skip'
  | 'approve'
  | 'reject'
  | 'snooze'
  | 'stale_reclaim';

export type FocusSessionTelemetryPayload = {
  event: FocusSessionTelemetryEvent;
  offerId: string;
  sessionId?: string | null;
  claimKind?: 'fresh' | 'stale_reclaim' | 'reclaim_own' | null;
};

export function recordFocusSessionTelemetry(payload: FocusSessionTelemetryPayload): void {
  try {
    const line = {
      src: 'moderation_focus_session',
      event: payload.event,
      offer_id: payload.offerId.slice(0, 64),
      session_id: payload.sessionId ? String(payload.sessionId).slice(0, 64) : undefined,
      claim_kind: payload.claimKind ?? undefined,
      t: Date.now(),
    };
    // Structured log for log drains; no PII.
    console.info('[moderation-session]', JSON.stringify(line));
  } catch {
    // ignore
  }
}
