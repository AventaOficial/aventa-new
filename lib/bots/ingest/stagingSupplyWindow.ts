/**
 * S7.2 — Controlled staging supply window constants.
 * Server-side cap authority reuses resolveCanaryInsertCap (hard ≤5).
 * Does not enable global machine writes. Does not change S6.1.
 */

import {
  S67_CANARY_HARD_CAP,
  resolveCanaryInsertCap,
} from './machineInsertCanary';

/** Max new pending offers in one S7.2 staging window. */
export const S72_STAGING_WINDOW_HARD_CAP = 5;

/** Default window size for S7.2 controlled runs. */
export const S72_STAGING_WINDOW_DEFAULT_CAP = 5;

/** Seed/admin author from S7.1 — must not be the permanent machine identity. */
export const S71_SEED_AUTHOR_ID = '6aa733d4-02cb-4c64-92fc-cf45fdcee344';

/**
 * Enforce staging window cap on the insert budget.
 * Always clamps to ≤ S72_STAGING_WINDOW_HARD_CAP (and ≤ S67 hard cap).
 */
export function resolveStagingSupplyWindowCap(
  budgetCap: number,
  windowCap: number | null | undefined = S72_STAGING_WINDOW_DEFAULT_CAP,
): number {
  const requested =
    windowCap == null || !Number.isFinite(Number(windowCap))
      ? S72_STAGING_WINDOW_DEFAULT_CAP
      : Math.floor(Number(windowCap));
  const capped = Math.min(
    Math.max(0, requested),
    S72_STAGING_WINDOW_HARD_CAP,
    S67_CANARY_HARD_CAP,
  );
  return resolveCanaryInsertCap(budgetCap, capped);
}

export function assertDedicatedMachineAuthor(authorId: string): {
  ok: boolean;
  reason: string | null;
} {
  const id = authorId.trim();
  if (!id) return { ok: false, reason: 'missing_author' };
  if (id === S71_SEED_AUTHOR_ID) {
    return { ok: false, reason: 'seed_admin_author_forbidden_for_s72' };
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    return { ok: false, reason: 'invalid_uuid' };
  }
  return { ok: true, reason: null };
}
