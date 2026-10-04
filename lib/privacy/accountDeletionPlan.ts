/** Grace before technical purge. Financial and audit rows are retained. */
export const ACCOUNT_DELETION_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

export const DELETED_ACCOUNT_LABEL = 'Cuenta eliminada';

export function deletionPurgeAfter(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_MS);
}

export function isDeletionGraceElapsed(input: {
  requestedAt: string | null;
  purgeAfter?: string | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  if (input.purgeAfter) {
    const t = new Date(input.purgeAfter).getTime();
    return Number.isFinite(t) && t <= now.getTime();
  }
  if (!input.requestedAt) return false;
  const requested = new Date(input.requestedAt).getTime();
  if (!Number.isFinite(requested)) return false;
  return requested + ACCOUNT_DELETION_GRACE_MS <= now.getTime();
}

/**
 * PII patch. Does not touch ledger, commissions, rewards, or moderation audit logs.
 * Fiscal fields (commission_*) are kept: they only survive when the account is held for
 * retained economic evidence; otherwise the profile is deleted with the auth user.
 */
export function anonymizedProfilePatch(nowIso: string): Record<string, unknown> {
  return {
    display_name: DELETED_ACCOUNT_LABEL,
    username: null,
    avatar_url: null,
    slug: null,
    ml_tracking_tag: null,
    amazon_tracking_tag: null,
    preferred_categories: [],
    leader_badge: null,
    featured_achievement_codes: [],
    deletion_anonymized_at: nowIso,
  };
}

/** ~100 years: Supabase Auth ban used to block sign-in of a held account. */
export const ACCOUNT_DELETION_SIGN_IN_BAN = '876000h';

/** Hold reason from account_deletion_blockers output; null when the account can be deleted. */
export function deletionHoldReason(blockers: readonly string[] | null | undefined): string | null {
  const list = [...new Set((blockers ?? []).filter((b) => typeof b === 'string' && b.trim().length > 0))].sort();
  if (list.length === 0) return null;
  return list.join(',').slice(0, 500);
}
