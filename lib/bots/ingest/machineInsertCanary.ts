/**
 * S6.7 — Controlled machine insert canary helpers.
 *
 * Does NOT change S6.1 policy. Does NOT enable global writes by default.
 * Hard ceiling: 5 inserts per canary batch payload.
 */

export const S67_CANARY_HARD_CAP = 5;
export const S67_CANARY_DEFAULT_CAP = 3;

/** Kill switch remains env default OFF — see isMachinePendingWriteEnabled. */
export const S67_WRITES_ENV = 'BOT_INGEST_MACHINE_PENDING_WRITES';

/**
 * When `canaryCap` is provided on the batch payload, clamp insert budget to
 * min(budget, canaryCap, HARD_CAP). When omitted, budget is unchanged (non-canary).
 */
export function resolveCanaryInsertCap(
  budgetCap: number,
  canaryCap: number | null | undefined,
): number {
  const budget = Math.max(0, Math.floor(budgetCap));
  if (canaryCap == null || !Number.isFinite(Number(canaryCap))) return budget;
  const requested = Math.max(0, Math.floor(Number(canaryCap)));
  return Math.min(budget, requested, S67_CANARY_HARD_CAP);
}

/**
 * Process-scoped enable of machine pending writes. Always restores prior env.
 * Never leaves the flag ON after the callback.
 */
export async function withMachinePendingWritesEnabled<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const prev = process.env[S67_WRITES_ENV];
  process.env[S67_WRITES_ENV] = 'true';
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env[S67_WRITES_ENV];
    else process.env[S67_WRITES_ENV] = prev;
  }
}

export type CanarySelectionRow = {
  index: number;
  url: string;
  canonicalUrl: string;
  sourceEventId: string | null;
  idempotencyKey: string | null;
  productFingerprint: string | null;
  qualityDecision: string | null;
  wouldInsert: boolean;
  reasonCodes: string[];
  evidenceLevel: string | null;
  confidence: number | null;
  dealScore: number | null;
  verifierScore: number | null;
  originalPriceProvenance: string | null;
  cardDiscountSource: string | null;
  imageUrl: string | null;
  pdpBlocked: boolean | null;
  duplicate: boolean;
};

/** Explicit selection: VERIFIED ∧ wouldInsert ∧ !duplicate, stable order, capped. */
export function selectCanaryCandidates(
  rows: readonly CanarySelectionRow[],
  cap: number = S67_CANARY_DEFAULT_CAP,
): CanarySelectionRow[] {
  const limit = resolveCanaryInsertCap(cap, cap);
  const eligible = rows.filter(
    (r) =>
      r.qualityDecision === 'VERIFIED_OPPORTUNITY' &&
      r.wouldInsert === true &&
      r.duplicate !== true,
  );
  return eligible.slice(0, limit);
}
