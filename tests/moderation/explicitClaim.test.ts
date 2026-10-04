import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getModerationQueueStats } from '@/lib/moderation/claimNextModerationOffer';

const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);

function recordingClient(rows: Record<string, unknown>[]) {
  const calls: string[] = [];
  const builder = (table: string) => {
    let head = false;
    const q: Record<string, unknown> = {};
    const chain = (name: string) =>
      (...args: unknown[]) => {
        calls.push(`${table}.${name}`);
        if (WRITE_METHODS.has(name)) throw new Error(`write attempted: ${table}.${name}`);
        if (name === 'select') head = Boolean((args[1] as { head?: boolean } | undefined)?.head);
        return q;
      };
    for (const m of ['select', 'eq', 'not', 'lt', 'order', 'in', 'is', 'insert', 'update', 'upsert', 'delete']) {
      q[m] = chain(m);
    }
    q.limit = () => Promise.resolve({ data: rows, error: null });
    q.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(head ? { count: rows.length, error: null } : { data: rows, error: null }).then(resolve);
    return q;
  };
  const client = {
    from: (table: string) => builder(table),
    rpc: (fn: string) => {
      throw new Error(`rpc attempted: ${fn}`);
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('moderation: opening the queue never claims', () => {
  it('getModerationQueueStats is read-only (no writes, no lock RPCs)', async () => {
    const rows = [
      { id: 'o1', created_at: '2026-10-01T00:00:00Z', locked_by: null, locked_at: null, snoozed_until: null },
      { id: 'o2', created_at: '2026-10-02T00:00:00Z', locked_by: 'other', locked_at: new Date().toISOString(), snoozed_until: null },
    ];
    const { client, calls } = recordingClient(rows);
    const stats = await getModerationQueueStats(client, 'me', 'all');
    expect(stats.globalPending).toBe(2);
    expect(stats.availableEstimate).toBe(1);
    expect(stats.oldestPendingCreatedAt).toBe('2026-10-01T00:00:00Z');
    expect(calls.some((c) => /insert|update|upsert|delete/.test(c))).toBe(false);
  });

  it('claim-next GET returns stats only; claiming stays on POST', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/admin/moderation/claim-next/route.ts'), 'utf8');
    const getBlock = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
    expect(getBlock).toContain('getModerationQueueStats');
    expect(getBlock).not.toContain('claimNextModerationOffer');
    expect(getBlock).not.toContain('recordModerationOutcome');
  });

  it('focus queue bootstrap loads stats unless the moderator already started', () => {
    const hook = readFileSync(join(process.cwd(), 'lib/hooks/useModerationFocusQueue.ts'), 'utf8');
    const boot = hook.slice(hook.indexOf('// Bootstrap'), hook.indexOf('// Heartbeat'));
    expect(boot).toContain('await loadStats()');
    expect(boot).toMatch(/if \(startedRef\.current \|\| preferOfferIdRef\.current\) await start\(\)/);
  });

  it('pending panel has no mount-time claim effect', () => {
    const panel = readFileSync(join(process.cwd(), 'app/admin/moderation/panels/ModerationPendingPanel.tsx'), 'utf8');
    const effects = panel.split('useEffect(').slice(1).map((e) => e.slice(0, e.indexOf('}, [')));
    for (const body of effects) expect(body).not.toMatch(/claimNextFromServer\(\s*\)/);
  });
});
