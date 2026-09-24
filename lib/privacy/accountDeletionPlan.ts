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

/** PII patch. Does not touch ledger, commissions, rewards, or moderation audit logs. */
export function anonymizedProfilePatch(nowIso: string): Record<string, unknown> {
  return {
    display_name: DELETED_ACCOUNT_LABEL,
    avatar_url: null,
    slug: null,
    ml_tracking_tag: null,
    amazon_tracking_tag: null,
    preferred_categories: null,
    deletion_anonymized_at: nowIso,
  };
}
