import { logEvent } from '@/lib/monitoring/clientLogger';

/**
 * Errores de cliente: log + toast opcional (misma firma que useUI.showToast).
 */
export function logClientError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[AVENTA:${context}]`, msg, err);
  logEvent({ type: 'api_error', source: context, metadata: { message: msg } });
}

export function notifyUserError(
  showToast: ((message: string) => void) | undefined,
  userMessage: string,
  context?: string,
  err?: unknown
): void {
  if (context && err !== undefined) logClientError(context, err);
  else if (context) console.error(`[AVENTA:${context}]`, userMessage);
  showToast?.(userMessage);
}
