/**
 * Day 10 — Central deadline budget for Continuous Discovery.
 *
 * Soft wall-clock is owned by continuousCronContract
 * (SCHEDULED_CONTINUOUS_DEADLINE_MS). This module never redefines that total;
 * it only splits remaining time so no single stage (esp. hunter collect) can
 * consume 100% of the soft deadline. Persist reserve is always protected.
 */

import { SCHEDULED_CONTINUOUS_DEADLINE_MS } from './continuousCronContract';

export type DeadlineStage =
  | 'orchestration'
  | 'near_ready_measure'
  | 'hunter_collect'
  | 'sticky_pm'
  | 'enrich_eval'
  | 'persist';

/** Caps within the soft wall — sum may exceed wall; allocate clamps to remaining−persist. */
export const DEFAULT_CRON_STAGE_CAPS: Record<DeadlineStage, number> = {
  orchestration: 5_000,
  near_ready_measure: 10_000,
  /** Hunter must not own the full soft deadline (prod Day 9 ate 180s). */
  hunter_collect: 75_000,
  sticky_pm: 35_000,
  enrich_eval: 45_000,
  /** Reserved; allocate() never grants this to other stages. */
  persist: 15_000,
};

export type DeadlineBudgetSnapshot = {
  startedAt: number;
  deadlineAt: number;
  softDeadlineMs: number;
  remainingMs: number;
  expired: boolean;
  stageCaps: Record<DeadlineStage, number>;
  stageGrantedMs: Partial<Record<DeadlineStage, number>>;
  stageUsedMs: Partial<Record<DeadlineStage, number>>;
  endedBy: 'normal' | 'deadline' | null;
};

export type DeadlineContext = {
  startedAt: number;
  deadlineAt: number;
  remainingMs: () => number;
  hasTimeFor: (minMs: number) => boolean;
  /** Grant ms for a stage (clamped by cap, remaining, and persist reserve). */
  allocate: (stage: DeadlineStage, requestedMs?: number) => number;
  isExpired: () => boolean;
  recordUsed: (stage: DeadlineStage, usedMs: number) => void;
  markEndedBy: (reason: 'normal' | 'deadline') => void;
  snapshot: () => DeadlineBudgetSnapshot;
};

export function createDeadlineContext(input?: {
  now?: number;
  softDeadlineMs?: number;
  stageCaps?: Partial<Record<DeadlineStage, number>>;
  /** Injectable clock for tests (defaults to Date.now). */
  clock?: () => number;
}): DeadlineContext {
  const clock = input?.clock ?? (() => Date.now());
  const startedAt = input?.now ?? clock();
  const softDeadlineMs = Math.max(
    1_000,
    input?.softDeadlineMs ?? SCHEDULED_CONTINUOUS_DEADLINE_MS,
  );
  const deadlineAt = startedAt + softDeadlineMs;
  const stageCaps: Record<DeadlineStage, number> = {
    ...DEFAULT_CRON_STAGE_CAPS,
    ...(input?.stageCaps ?? {}),
  };
  const stageGrantedMs: Partial<Record<DeadlineStage, number>> = {};
  const stageUsedMs: Partial<Record<DeadlineStage, number>> = {};
  let endedBy: 'normal' | 'deadline' | null = null;

  const remainingMs = () => Math.max(0, deadlineAt - clock());
  const isExpired = () => clock() >= deadlineAt;

  const persistReserveLeft = () => {
    const used = stageUsedMs.persist ?? 0;
    return Math.max(0, stageCaps.persist - used);
  };

  const allocate = (stage: DeadlineStage, requestedMs?: number): number => {
    const rem = remainingMs();
    if (rem <= 0) {
      stageGrantedMs[stage] = 0;
      return 0;
    }
    const cap = stageCaps[stage];
    const want = Math.max(0, requestedMs ?? cap);
    // Protect persist reserve for every non-persist stage.
    const reserved =
      stage === 'persist' ? 0 : Math.min(persistReserveLeft(), rem);
    const available = Math.max(0, rem - reserved);
    const granted = Math.min(want, cap, available);
    stageGrantedMs[stage] = granted;
    return granted;
  };

  return {
    startedAt,
    deadlineAt,
    remainingMs,
    hasTimeFor: (minMs: number) => remainingMs() >= Math.max(0, minMs),
    allocate,
    isExpired,
    recordUsed: (stage, usedMs) => {
      stageUsedMs[stage] = Math.max(0, Math.floor(usedMs));
    },
    markEndedBy: (reason) => {
      endedBy = reason;
    },
    snapshot: () => ({
      startedAt,
      deadlineAt,
      softDeadlineMs,
      remainingMs: remainingMs(),
      expired: isExpired(),
      stageCaps,
      stageGrantedMs: { ...stageGrantedMs },
      stageUsedMs: { ...stageUsedMs },
      endedBy,
    }),
  };
}

/** Race a promise against a granted budget; resolves with null on timeout. */
export async function raceWithBudget<T>(
  work: Promise<T>,
  budgetMs: number,
  onTimeout?: () => void,
): Promise<{ ok: true; value: T } | { ok: false; reason: 'soft_deadline' }> {
  if (budgetMs <= 0) {
    onTimeout?.();
    return { ok: false, reason: 'soft_deadline' };
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const result = await Promise.race([
      work.then((value) => ({ tag: 'value' as const, value })),
      new Promise<{ tag: 'timeout' }>((resolve) => {
        timer = setTimeout(() => resolve({ tag: 'timeout' }), budgetMs);
      }),
    ]);
    if (result.tag === 'timeout') {
      onTimeout?.();
      return { ok: false, reason: 'soft_deadline' };
    }
    return { ok: true, value: result.value };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
