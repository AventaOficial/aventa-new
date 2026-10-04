import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import {
  ACCOUNT_DELETION_SIGN_IN_BAN,
  anonymizedProfilePatch,
  deletionHoldReason,
  isDeletionGraceElapsed,
} from '@/lib/privacy/accountDeletionPlan';

export type AccountPurgeResult = {
  examined: number;
  anonymized: number;
  authDeleted: number;
  held: number;
  skipped: number;
  errors: number;
};

type ProfileRow = {
  id: string;
  account_deletion_requested_at: string | null;
  deletion_purge_after: string | null;
  deletion_anonymized_at: string | null;
};

async function audit(supabase: SupabaseClient, userId: string, phase: string, detail?: string): Promise<void> {
  const { error } = await supabase.from('account_deletion_audit').insert({
    user_id: userId,
    phase,
    detail: detail?.slice(0, 300) ?? null,
  });
  if (error) console.error('[account-purge] audit insert failed', phase, error.message);
}

/**
 * Idempotent purge after the grace window.
 * 1. Anonymizes profile PII.
 * 2. If retained evidence references the account (account_deletion_blockers), blocks sign-in and
 *    records deletion_hold_reason; the auth user and the evidence stay until the retention policy
 *    allows deletion.
 * 3. Otherwise deletes the auth user (profile and user-generated content cascade).
 * Never deletes ledger, rewards, payouts, moderation or team evidence.
 */
export async function runAccountDeletionPurge(opts?: {
  limit?: number;
  now?: Date;
  client?: SupabaseClient;
}): Promise<AccountPurgeResult> {
  const supabase = opts?.client ?? createServerClient();
  const now = opts?.now ?? new Date();
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 20));
  const result: AccountPurgeResult = {
    examined: 0,
    anonymized: 0,
    authDeleted: 0,
    held: 0,
    skipped: 0,
    errors: 0,
  };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, account_deletion_requested_at, deletion_purge_after, deletion_anonymized_at')
    .not('account_deletion_requested_at', 'is', null)
    .is('deletion_purged_at', null)
    .is('deletion_hold_reason', null)
    .order('deletion_purge_after', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error || !data) {
    console.error('[account-purge] candidate query failed', error?.code, error?.message);
    result.errors += 1;
    return result;
  }

  for (const raw of data as ProfileRow[]) {
    result.examined += 1;
    if (
      !isDeletionGraceElapsed({
        requestedAt: raw.account_deletion_requested_at,
        purgeAfter: raw.deletion_purge_after,
        now,
      })
    ) {
      result.skipped += 1;
      continue;
    }

    const nowIso = now.toISOString();
    try {
      if (!raw.deletion_anonymized_at) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(anonymizedProfilePatch(nowIso))
          .eq('id', raw.id);
        if (updateError) {
          result.errors += 1;
          await audit(supabase, raw.id, 'anonymize_failed', updateError.message);
          continue;
        }
        result.anonymized += 1;
        await audit(supabase, raw.id, 'anonymized');
      }

      const { data: blockers, error: blockersError } = await supabase.rpc('account_deletion_blockers', {
        p_user_id: raw.id,
      });
      if (blockersError || !Array.isArray(blockers)) {
        result.errors += 1;
        await audit(supabase, raw.id, 'blocker_check_failed', blockersError?.message ?? 'invalid response');
        continue;
      }

      const holdReason = deletionHoldReason(blockers as string[]);
      if (holdReason) {
        const { error: banError } = await supabase.auth.admin.updateUserById(raw.id, {
          ban_duration: ACCOUNT_DELETION_SIGN_IN_BAN,
        });
        const banGone = banError?.message?.toLowerCase().includes('not found') === true;
        if (banError && !banGone) {
          result.errors += 1;
          await audit(supabase, raw.id, 'sign_in_block_failed', banError.message);
          continue;
        }
        const { error: holdError } = await supabase
          .from('profiles')
          .update({ deletion_hold_reason: holdReason })
          .eq('id', raw.id);
        if (holdError) {
          result.errors += 1;
          await audit(supabase, raw.id, 'hold_failed', holdError.message);
          continue;
        }
        result.held += 1;
        await audit(supabase, raw.id, 'held_retained_evidence', holdReason);
        continue;
      }

      const { error: authError } = await supabase.auth.admin.deleteUser(raw.id);
      const alreadyGone = authError?.message?.toLowerCase().includes('not found') === true;
      if (authError && !alreadyGone) {
        result.errors += 1;
        await audit(supabase, raw.id, 'auth_delete_failed', authError.message);
        continue;
      }

      result.authDeleted += 1;
      // The profile normally cascades with the auth user; this marks it if it survives.
      await supabase
        .from('profiles')
        .update({ deletion_auth_deleted_at: nowIso, deletion_purged_at: nowIso })
        .eq('id', raw.id);
      await audit(supabase, raw.id, 'purged');
    } catch (err) {
      result.errors += 1;
      await audit(supabase, raw.id, 'error', err instanceof Error ? err.message : 'unknown');
    }
  }

  return result;
}
