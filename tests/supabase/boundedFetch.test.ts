import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBoundedFetch,
  isSupabaseTimeout,
  isTransientNetworkError,
  SupabaseTimeoutError,
} from '@/lib/supabase/boundedFetch';
import { resetLaunchMetricsForTests, snapshotLaunchMetrics } from '@/lib/observability/launchMetrics';

const URL_ = 'https://example.supabase.co/rest/v1/offers?select=id';

function networkError(code: string): Error {
  const err = new TypeError('fetch failed');
  (err as { cause?: unknown }).cause = Object.assign(new Error(code), { code });
  return err;
}

/** fetch que nunca responde hasta que su señal se aborta. */
function hangingFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
  });
}

beforeEach(() => {
  resetLaunchMetricsForTests();
});

describe('createBoundedFetch — plazo', () => {
  it('corta con SupabaseTimeoutError al vencer el plazo y no reintenta', async () => {
    const fetchImpl = hangingFetch();
    const bounded = createBoundedFetch({ timeoutMs: 50, fetchImpl });
    const started = Date.now();
    await expect(bounded(URL_)).rejects.toBeInstanceOf(SupabaseTimeoutError);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(snapshotLaunchMetrics().supabase_timeouts).toBe(1);
    expect(snapshotLaunchMetrics().supabase_retries).toBe(0);
  });

  it('el mensaje que postgrest-js propaga se reconoce como timeout', () => {
    const err = new SupabaseTimeoutError(4000);
    expect(isSupabaseTimeout({ message: `${err.name}: ${err.message}` })).toBe(true);
    expect(isSupabaseTimeout({ message: 'TimeoutError: The operation was aborted due to timeout' })).toBe(true);
    expect(isSupabaseTimeout({ message: 'duplicate key value' })).toBe(false);
    expect(isSupabaseTimeout(null)).toBe(false);
  });

  it('devuelve la respuesta tal cual si llega a tiempo, incluso un 5xx (sin reintento)', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 503 }));
    const bounded = createBoundedFetch({ timeoutMs: 1_000, fetchImpl });
    const res = await bounded(URL_);
    expect(res.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('createBoundedFetch — cancelación del llamador', () => {
  it('respeta el abort del llamador: no lo convierte en timeout ni reintenta', async () => {
    const fetchImpl = hangingFetch();
    const bounded = createBoundedFetch({ timeoutMs: 5_000, fetchImpl });
    const controller = new AbortController();
    const pending = bounded(URL_, { signal: controller.signal });
    controller.abort(new Error('cliente se fue'));
    await expect(pending).rejects.toThrow('cliente se fue');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(snapshotLaunchMetrics().supabase_timeouts).toBe(0);
  });
});

describe('createBoundedFetch — reintento limitado e idempotente', () => {
  it('GET con error de red transitorio ⇒ un único reintento', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(networkError('ECONNRESET'))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }));
    const bounded = createBoundedFetch({ timeoutMs: 2_000, retryDelayMs: 5, fetchImpl });
    const res = await bounded(URL_);
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(snapshotLaunchMetrics().supabase_retries).toBe(1);
  });

  it('nunca reintenta más de una vez', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(networkError('ECONNRESET'));
    const bounded = createBoundedFetch({ timeoutMs: 2_000, retryDelayMs: 5, fetchImpl });
    await expect(bounded(URL_)).rejects.toThrow('fetch failed');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each(['POST', 'PATCH', 'DELETE'])('%s no se reintenta (no idempotente)', async (method) => {
    const fetchImpl = vi.fn().mockRejectedValue(networkError('ECONNRESET'));
    const bounded = createBoundedFetch({ timeoutMs: 2_000, retryDelayMs: 5, fetchImpl });
    await expect(bounded(URL_, { method })).rejects.toThrow('fetch failed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('un error no transitorio no se reintenta', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('invalid url'));
    const bounded = createBoundedFetch({ timeoutMs: 2_000, retryDelayMs: 5, fetchImpl });
    await expect(bounded(URL_)).rejects.toThrow('invalid url');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sin tiempo restante suficiente no reintenta', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(networkError('ECONNRESET'));
    const bounded = createBoundedFetch({ timeoutMs: 100, retryDelayMs: 80, fetchImpl });
    await expect(bounded(URL_)).rejects.toThrow('fetch failed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('clasifica códigos de red transitorios', () => {
    expect(isTransientNetworkError(networkError('UND_ERR_SOCKET'))).toBe(true);
    expect(isTransientNetworkError(networkError('ENOTFOUND'))).toBe(false);
    expect(isTransientNetworkError('ECONNRESET')).toBe(false);
  });
});
