import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestModerationLock } from '@/lib/moderation/moderationLockClient';

describe('requestModerationLock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no lanza ante TypeError Failed to fetch (heartbeat)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      requestModerationLock({
        offerId: 'o1',
        action: 'heartbeat',
        headers: { Authorization: 'Bearer x' },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ ok: false, transient: true });

    expect(warn).not.toHaveBeenCalled();
  });

  it('marca transient en acquire sin lanzar; warn solo en development', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const result = await requestModerationLock({
      offerId: 'o1',
      action: 'acquire',
      headers: {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ ok: false, transient: true });
    expect(warn).toHaveBeenCalledTimes(1);
    process.env.NODE_ENV = prev;
  });

  it('preserva conflicto 409', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 409,
      ok: false,
      json: async () => ({}),
    });
    await expect(
      requestModerationLock({
        offerId: 'o1',
        action: 'acquire',
        headers: {},
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ ok: false, conflict: true });
  });

  it('preserva lockSupported: false', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ lockSupported: false }),
    });
    await expect(
      requestModerationLock({
        offerId: 'o1',
        action: 'acquire',
        headers: {},
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ ok: true, lockSupported: false });
  });

  it('ok en 200', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ ok: true }),
    });
    await expect(
      requestModerationLock({
        offerId: 'o1',
        action: 'heartbeat',
        headers: {},
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ ok: true, lockSupported: true });
  });
});
