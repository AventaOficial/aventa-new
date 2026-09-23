import { createServerClient } from '@/lib/supabase/server';
import {
  anonymizedProfilePatch,
  isDeletionGraceElapsed,
} from '@/lib/privacy/accountDeletionPlan';

export type AccountPurgeResult = {
  examined: number;
  anonymized: number;
  authDeleted: number;
  skipped: number;
  errors: number;
};

type ProfileRow = {
  id: string;
  account_deletion_requested_at: string | null;
  deletion_purge_after: string | null;
  deletion_anonymized_at: string | null;
  deletion_purged_at: string | null;
};

async function audit(userId: string, phase: string, detail?: string): Promise<void> {
  const supabase = createServerClient();
  await supabase.from('account_deletion_audit').insert({
    user_id: userId,
    phase,
    detail: detail?.slice(0, 300) ?? null,
  });
}

/**
 * Idempotent purge after the grace window.
 * Anonymizes profile PII and deletes the auth user.
 * Does not delete ledger, commissions, rewards, or moderation logs.
 */
export async function runAccountDeletionPurge(opts?: { limit?: number; now?: Date }): Promise<AccountPurgeResult> {
  const supabase = createServerClient();
  const now = opts?.now ?? new Date();
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 20));
  const result: AccountPurgeResult = {
    examined: 0,
    anonymized: 0,
    authDeleted: 0,
    skipped: 0,
    errors: 0,
  };

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, account_deletion_requested_at, deletion_purge_after, deletion_anonymized_at, deletion_purged_at'
    )
    .not('account_deletion_requested_at', 'is', null)
    .is('deletion_purged_at', null)
    .limit(limit);

  if (error || !data) {
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
          await audit(raw.id, 'anonymize_failed', updateError.message);
          continue;
        }
        result.anonymized += 1;
        await audit(raw.id, 'anonymized');
      }

      const { error: authError } = await supabase.auth.admin.deleteUser(raw.id);
      const alreadyGone = authError?.message?.toLowerCase().includes('not found') === true;
      if (authError && !alreadyGone) {
        result.errors += 1;
        await audit(raw.id, 'auth_delete_failed', authError.message);
        continue;
      }

      result.authDeleted += 1;
      await supabase
        .from('profiles')
        .update({
          deletion_auth_deleted_at: nowIso,
          deletion_purged_at: nowIso,
        })
        .eq('id', raw.id);
      await audit(raw.id, 'purged');
    } catch (err) {
      result.errors += 1;
      await audit(raw.id, 'error', err instanceof Error ? err.message : 'unknown');
    }
  }

  return result;
}
