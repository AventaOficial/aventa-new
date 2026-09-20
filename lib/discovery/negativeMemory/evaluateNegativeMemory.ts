import {
  classifyRejectionSignal,
  isSpamSignal,
} from './classifyRejection';
import {
  NEGATIVE_MEMORY_TTL_MS,
  type NegativeMemoryDecision,
  type NegativeMemoryEvent,
  type NegativeMemoryLevel,
} from './types';

function parseTs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Evalúa Negative Memory para un fingerprint en `now`.
 *
 * Política productiva (DQ-03 72h):
 * - SUPPRESS: (spam≥1 OR reject_count≥2) AND última señal disparadora dentro del TTL
 * - PENALIZE: visto antes OR ≥1 reject (cualquier edad), sin cumplir SUPPRESS
 * - ALLOW: primera vez sin negativo
 *
 * auto_rejected_timeout cuenta en reject_count pero NO como spam.
 * Un único reject genérico NO es blacklist permanente.
 */
export function evaluateNegativeMemory(params: {
  fingerprint: string;
  events: readonly NegativeMemoryEvent[];
  now?: Date;
  ttlMs?: number;
}): NegativeMemoryDecision {
  const now = params.now ?? new Date();
  const ttlMs = params.ttlMs ?? NEGATIVE_MEMORY_TTL_MS;
  const nowMs = now.getTime();
  const fp = params.fingerprint;

  const prior = [...params.events]
    .filter((e) => e.fingerprint === fp)
    .filter((e) => parseTs(e.createdAt) > 0 && parseTs(e.createdAt) < nowMs)
    .sort((a, b) => parseTs(a.createdAt) - parseTs(b.createdAt));

  const seenBefore = prior.length > 0;
  let rejectCount = 0;
  let spamCount = 0;
  let lastRejectAt: string | null = null;
  let lastSpamAt: string | null = null;

  for (const ev of prior) {
    if (ev.status !== 'rejected') continue;
    const kind = classifyRejectionSignal({
      status: ev.status,
      rejectionReason: ev.rejectionReason,
    });
    rejectCount += 1;
    lastRejectAt = ev.createdAt;
    if (isSpamSignal(kind)) {
      spamCount += 1;
      lastSpamAt = ev.createdAt;
    }
  }

  // Trigger timestamp for SUPPRESS TTL: spam event, or last reject when count≥2
  const triggerAt =
    lastSpamAt ?? (rejectCount >= 2 ? lastRejectAt : null);
  const triggerMs = triggerAt ? parseTs(triggerAt) : 0;
  const withinTtl = triggerAt != null && nowMs - triggerMs <= ttlMs;
  const suppressEligible = (spamCount >= 1 || rejectCount >= 2) && withinTtl;

  let level: NegativeMemoryLevel = 'ALLOW';
  let reason = 'first_seen';
  let suppressTtlRemainingMs: number | null = null;

  if (suppressEligible) {
    level = 'SUPPRESS';
    reason = spamCount >= 1 ? 'spam_within_ttl' : 'reject_count_gte_2_within_ttl';
    suppressTtlRemainingMs = Math.max(0, ttlMs - (nowMs - triggerMs));
  } else if (seenBefore || rejectCount >= 1) {
    level = 'PENALIZE';
    reason = rejectCount >= 1 ? 'prior_reject' : 'seen_before';
  }

  return {
    level,
    fingerprint: fp,
    reason,
    rejectCount,
    spamCount,
    seenBefore,
    suppressTtlRemainingMs,
    lastStrongSignalAt: triggerAt ?? lastRejectAt,
  };
}

/** Multiplicador de score para PENALIZE (baja prioridad, no elimina). */
export function negativeMemoryScoreMultiplier(decision: NegativeMemoryDecision): number {
  if (decision.level === 'SUPPRESS') return 0;
  if (decision.level === 'PENALIZE') {
    const depth = Math.min(4, Math.max(1, decision.rejectCount || (decision.seenBefore ? 1 : 0)));
    return Math.max(0.35, 1 - 0.15 * depth);
  }
  return 1;
}
