import { currentRequestProgress } from './requestProgressCounters';

/** Timeout HTTP reutilizado por Hunter / ML API. Mismo orden de magnitud que scrape de oferta. */
export const HUNTER_HTTP_TIMEOUT_MS = 12_000;

export function isTimeoutAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? String(error.name) : '';
  const message = 'message' in error ? String(error.message) : String(error);
  return name === 'AbortError' || /aborted|abort|timeout/i.test(message);
}

/**
 * fetch + AbortController. Replica el patrón de fetchParsedOfferMetadata.
 * No reintenta.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = HUNTER_HTTP_TIMEOUT_MS, signal: userSignal, ...rest } = init;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const onUserAbort = () => controller.abort();
  if (userSignal) {
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener('abort', onUserAbort, { once: true });
  }

  const progress = currentRequestProgress();
  if (progress) progress.requests_started += 1;
  try {
    const res = await fetch(input, { ...rest, signal: controller.signal });
    if (progress) {
      progress.requests_completed += 1;
      if (!res.ok) progress.requests_http_error += 1;
    }
    return res;
  } catch (error) {
    if (progress) {
      if (isTimeoutAbortError(error)) progress.requests_timed_out += 1;
      else progress.requests_failed += 1;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    userSignal?.removeEventListener('abort', onUserAbort);
  }
}
