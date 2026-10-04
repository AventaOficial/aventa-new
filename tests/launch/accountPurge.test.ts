import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runAccountDeletionPurge } from '@/lib/privacy/runAccountPurge';
import { deletionHoldReason, anonymizedProfilePatch } from '@/lib/privacy/accountDeletionPlan';

type Profile = {
  id: string;
  account_deletion_requested_at: string | null;
  deletion_purge_after: string | null;
  deletion_anonymized_at: string | null;
  deletion_hold_reason?: string | null;
  deletion_purged_at?: string | null;
};

function fakeClient(profiles: Profile[], blockers: Record<string, string[] | 'error'>) {
  const audits: { user_id: string; phase: string; detail: string | null }[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const deleteUser = vi.fn(async (id: string) => {
    const idx = profiles.findIndex((p) => p.id === id);
    if (idx >= 0) profiles.splice(idx, 1);
    return { error: null };
  });
  const updateUserById = vi.fn(async () => ({ error: null }));

  const client = {
    from(table: string) {
      if (table === 'account_deletion_audit') {
        return {
          insert: async (row: { user_id: string; phase: string; detail: string | null }) => {
            audits.push(row);
            return { error: null };
          },
        };
      }
      const query = {
        select: () => query,
        not: () => query,
        is: () => query,
        order: () => query,
        limit: async () => ({
          data: profiles.filter((p) => !p.deletion_hold_reason && !p.deletion_purged_at).map((p) => ({ ...p })),
          error: null,
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, id: string) => {
            updates.push({ id, patch });
            const p = profiles.find((x) => x.id === id);
            if (p) Object.assign(p, patch);
            return { error: null };
          },
        }),
      };
      return query;
    },
    rpc: async (_fn: string, args: { p_user_id: string }) => {
      const b = blockers[args.p_user_id];
      if (b === 'error') return { data: null, error: { message: 'boom' } };
      return { data: b ?? [], error: null };
    },
    auth: { admin: { deleteUser, updateUserById } },
  } as unknown as SupabaseClient;

  return { client, audits, updates, deleteUser, updateUserById };
}

const NOW = new Date('2026-10-20T00:00:00.000Z');
const due = (id: string): Profile => ({
  id,
  account_deletion_requested_at: '2026-10-01T00:00:00.000Z',
  deletion_purge_after: '2026-10-15T00:00:00.000Z',
  deletion_anonymized_at: null,
});

describe('account deletion purge', () => {
  it('skips accounts still inside the grace window', async () => {
    const f = fakeClient([{ ...due('a'), deletion_purge_after: '2026-10-30T00:00:00.000Z' }], {});
    const r = await runAccountDeletionPurge({ client: f.client, now: NOW });
    expect(r).toMatchObject({ examined: 1, skipped: 1, authDeleted: 0, held: 0, errors: 0 });
    expect(f.deleteUser).not.toHaveBeenCalled();
  });

  it('anonymizes and deletes the auth user when no evidence references it', async () => {
    const f = fakeClient([due('a')], { a: [] });
    const r = await runAccountDeletionPurge({ client: f.client, now: NOW });
    expect(r).toMatchObject({ anonymized: 1, authDeleted: 1, held: 0, errors: 0 });
    expect(f.deleteUser).toHaveBeenCalledWith('a');
    expect(f.audits.map((a) => a.phase)).toEqual(['anonymized', 'purged']);
  });

  it('holds accounts referenced by retained evidence: blocks sign-in, never deletes', async () => {
    const f = fakeClient([due('a')], { a: ['public.team_audit_log.actor_id', 'public.creator_rewards.creator_id'] });
    const r = await runAccountDeletionPurge({ client: f.client, now: NOW });
    expect(r).toMatchObject({ anonymized: 1, held: 1, authDeleted: 0, errors: 0 });
    expect(f.deleteUser).not.toHaveBeenCalled();
    expect(f.updateUserById).toHaveBeenCalledWith('a', { ban_duration: '876000h' });
    const hold = f.updates.find((u) => 'deletion_hold_reason' in u.patch);
    expect(hold?.patch.deletion_hold_reason).toBe('public.creator_rewards.creator_id,public.team_audit_log.actor_id');
    expect(f.audits.at(-1)?.phase).toBe('held_retained_evidence');
  });

  it('is idempotent: a held account is not reprocessed', async () => {
    const f = fakeClient([due('a')], { a: ['public.creator_rewards.creator_id'] });
    await runAccountDeletionPurge({ client: f.client, now: NOW });
    const second = await runAccountDeletionPurge({ client: f.client, now: NOW });
    expect(second).toMatchObject({ examined: 0, held: 0, authDeleted: 0 });
    expect(f.updateUserById).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the blocker check fails', async () => {
    const f = fakeClient([due('a')], { a: 'error' });
    const r = await runAccountDeletionPurge({ client: f.client, now: NOW });
    expect(r).toMatchObject({ errors: 1, authDeleted: 0, held: 0 });
    expect(f.deleteUser).not.toHaveBeenCalled();
    expect(f.audits.at(-1)?.phase).toBe('blocker_check_failed');
  });

  it('builds a deterministic hold reason and a complete PII patch', () => {
    expect(deletionHoldReason([])).toBeNull();
    expect(deletionHoldReason(['b', 'a', 'a', ''])).toBe('a,b');
    const patch = anonymizedProfilePatch('2026-10-20T00:00:00.000Z');
    expect(patch).toMatchObject({ username: null, slug: null, avatar_url: null, leader_badge: null });
    expect(patch).not.toHaveProperty('commission_rfc');
  });
});
