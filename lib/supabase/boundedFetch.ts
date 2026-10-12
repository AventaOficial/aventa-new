import { incrementLaunchMetric } from '@/lib/observability/launchMetrics';

/**
 * fetch con plazo para el cliente Supabase de rutas interactivas.
 * - Un único plazo cubre el intento y el reintento: nunca se espera más que timeoutMs.
 * - Reintenta como máximo una vez, solo GET/HEAD y solo si la conexión falló antes de responder.
 *   Un timeout o un 5xx no se reintentan: con la base saturada, reintentar duplica la presión.
 * - Si el llamador cancela, se respeta su señal y no se reintenta.
 */

export const SUPABASE_TIMEOUT_ERROR_NAME = 'SupabaseTimeoutError';

export class SupabaseTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Supabase no respondió en ${timeoutMs} ms`);
    this.name = SUPABASE_TIMEOUT_ERROR_NAME;
  }
}

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

export function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code ?? (error.cause as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' && TRANSIENT_NETWORK_CODES.has(code);
}

/**
 * postgrest-js convierte la excepción en `{ message: "<name>: <msg>" }`.
 * Si el plazo vence mientras se lee el cuerpo, el error es el TimeoutError nativo de AbortSignal.timeout.
 */
export function isSupabaseTimeout(error: { message?: string | null } | null | undefined): boolean {
  const message = error?.message;
  return (
    typeof message === 'string' &&
    (message.startsWith(SUPABASE_TIMEOUT_ERROR_NAME) || message.startsWith('TimeoutError'))
  );
}

export type BoundedFetchOptions = {
  timeoutMs: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
};

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function createBoundedFetch(options: BoundedFetchOptions): typeof fetch {
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs));
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 150);
  const doFetch = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const callerSignal = init?.signal ?? null;
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
    const startedAt = Date.now();
    const idempotent = ['GET', 'HEAD'].includes(requestMethod(input, init));
    let retried = false;

    for (;;) {
      try {
        return await doFetch(input, { ...init, signal });
      } catch (error) {
        if (deadline.aborted && !callerSignal?.aborted) {
          incrementLaunchMetric('supabase_timeouts');
          throw new SupabaseTimeoutError(timeoutMs);
        }
        if (callerSignal?.aborted) throw error;
        const remaining = timeoutMs - (Date.now() - startedAt);
        if (!idempotent || retried || !isTransientNetworkError(error) || remaining <= retryDelayMs * 2) throw error;
        retried = true;
        incrementLaunchMetric('supabase_retries');
        try {
          await sleep(retryDelayMs, signal);
        } catch {
          if (deadline.aborted && !callerSignal?.aborted) {
            incrementLaunchMetric('supabase_timeouts');
            throw new SupabaseTimeoutError(timeoutMs);
          }
          throw error;
        }
      }
    }
  };
}
