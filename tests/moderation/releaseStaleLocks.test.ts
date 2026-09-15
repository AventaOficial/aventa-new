import { describe, expect, it, vi } from 'vitest';
import { releaseStaleModerationLocks } from '@/lib/moderation/releaseStaleLocks';

function mockClient(opts: {
  staleIds?: string[];
  updatedIds?: string[];
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const staleIds = opts.staleIds ?? [];
  const updatedIds = opts.updatedIds ?? staleIds;
  const chain: Record<string, unknown> = {};
  const self = () => chain;

  chain.select = vi.fn(() => self());
  chain.eq = vi.fn(() => self());
  chain.not = vi.fn(() => self());
  chain.lt = vi.fn(() => self());
  chain.limit = vi.fn(async () => ({
    data: staleIds.map((id) => ({ id })),
    error: opts.selectError ?? null,
  }));
  chain.in = vi.fn(() => self());
  chain.update = vi.fn(() => {
    const updateChain: Record<string, unknown> = {};
    const uself = () => updateChain;
    updateChain.in = vi.fn(() => uself());
    updateChain.eq = vi.fn(() => uself());
    updateChain.lt = vi.fn(() => uself());
    updateChain.select = vi.fn(async () => ({
      data: updatedIds.map((id) => ({ id })),
      error: opts.updateError ?? null,
    }));
    return updateChain;
  });

  return {
    from: vi.fn(() => chain),
  };
}

describe('releaseStaleModerationLocks', () => {
  it('libera locks abandonados sin cambiar status', async () => {
    const client = mockClient({ staleIds: ['a', 'b'] });
    const result = await releaseStaleModerationLocks(client as never, { limit: 50 });
    expect(result.released).toBe(2);
    expect(client.from).toHaveBeenCalledWith('offers');
  });

  it('es idempotente cuando no hay stale', async () => {
    const client = mockClient({ staleIds: [] });
    const result = await releaseStaleModerationLocks(client as never);
    expect(result.released).toBe(0);
  });

  it('falla cerrado en error de select', async () => {
    const client = mockClient({
      staleIds: ['x'],
      selectError: { message: 'db down' },
    });
    // limit chain returns error — released 0
    const result = await releaseStaleModerationLocks(client as never);
    expect(result.released).toBe(0);
  });
});
