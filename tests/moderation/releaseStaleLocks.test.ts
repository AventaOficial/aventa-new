import { describe, expect, it, vi } from 'vitest';
import { releaseStaleModerationLocks } from '@/lib/moderation/releaseStaleLocks';

function mockClient(opts: {
  staleRows?: Array<{ id: string; locked_by: string | null; locked_at: string | null }>;
  updatedIds?: string[];
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const staleRows = opts.staleRows ?? [];
  const updatedIds = opts.updatedIds ?? staleRows.map((r) => r.id);
  const inserts: unknown[] = [];

  const offersChain: Record<string, unknown> = {};
  const oself = () => offersChain;
  offersChain.select = vi.fn(() => oself());
  offersChain.eq = vi.fn(() => oself());
  offersChain.not = vi.fn(() => oself());
  offersChain.lt = vi.fn(() => oself());
  offersChain.limit = vi.fn(async () => ({
    data: staleRows,
    error: opts.selectError ?? null,
  }));
  offersChain.update = vi.fn(() => {
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

  const logsChain = {
    insert: vi.fn(async (row: unknown) => {
      inserts.push(row);
      return { error: null };
    }),
  };

  return {
    inserts,
    from: vi.fn((table: string) => (table === 'moderation_logs' ? logsChain : offersChain)),
  };
}

describe('releaseStaleModerationLocks', () => {
  it('libera locks abandonados sin cambiar status y audita', async () => {
    const client = mockClient({
      staleRows: [
        { id: 'a', locked_by: 'u1', locked_at: '2020-01-01T00:00:00.000Z' },
        { id: 'b', locked_by: 'u2', locked_at: '2020-01-01T00:00:00.000Z' },
      ],
    });
    const result = await releaseStaleModerationLocks(client as never, { limit: 50 });
    expect(result.released).toBe(2);
    expect(result.audited).toBe(2);
    expect(result.offerIds).toEqual(['a', 'b']);
    expect(client.from).toHaveBeenCalledWith('offers');
    expect(client.from).toHaveBeenCalledWith('moderation_logs');
  });

  it('es idempotente cuando no hay stale', async () => {
    const client = mockClient({ staleRows: [] });
    const result = await releaseStaleModerationLocks(client as never);
    expect(result.released).toBe(0);
    expect(result.audited).toBe(0);
  });

  it('falla cerrado en error de select', async () => {
    const client = mockClient({
      staleRows: [{ id: 'x', locked_by: 'u', locked_at: '2020-01-01T00:00:00.000Z' }],
      selectError: { message: 'db down' },
    });
    const result = await releaseStaleModerationLocks(client as never);
    expect(result.released).toBe(0);
  });
});
