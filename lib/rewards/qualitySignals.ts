/**
 * Señales de calidad / anti-abuso para el Programa de Recompensas.
 * Capa encima de V1 (15+15): no reemplaza el umbral básico.
 * Gates opcionales vía env — por defecto OFF para no romper claim actual.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RewardsProgress } from '@/lib/rewards/eligibility';
import { isUserBanned } from '@/lib/server/isUserBanned';

/** Tasa mínima de aprobación (0–1). Vacío/ausente = desactivado. */
export function rewardsMinApprovalRate(): number | null {
  const raw = process.env.REWARDS_MIN_APPROVAL_RATE?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 1) return null;
  return n;
}

/** Días mínimos de antigüedad de cuenta. Vacío = desactivado. */
export function rewardsMinAccountAgeDays(): number | null {
  const raw = process.env.REWARDS_MIN_ACCOUNT_AGE_DAYS?.trim();
  if (!raw) return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Mínimo de votantes positivos distintos. Vacío = desactivado. */
export function rewardsMinDistinctPositiveVoters(): number | null {
  const raw = process.env.REWARDS_MIN_DISTINCT_VOTERS?.trim();
  if (!raw) return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export type HunterQualitySignals = {
  approvedCount: number;
  rejectedCount: number;
  submittedDecisionCount: number;
  approvalRate: number | null;
  distinctPositiveVoters: number;
  accountAgeDays: number | null;
  isBanned: boolean;
};

export type QualityGateResult = {
  ok: boolean;
  reasonCode: string | null;
  userMessage: string | null;
};

export async function getHunterQualitySignals(
  supabase: SupabaseClient,
  userId: string,
): Promise<HunterQualitySignals> {
  const [approvedRes, rejectedRes, profileRes, banned, votesRes] = await Promise.all([
    supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .in('status', ['approved', 'published']),
    supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .eq('status', 'rejected'),
    supabase.from('profiles').select('created_at').eq('id', userId).maybeSingle(),
    isUserBanned(supabase, userId),
    supabase
      .from('offers')
      .select('id')
      .eq('created_by', userId)
      .in('status', ['approved', 'published']),
  ]);

  const approvedCount = approvedRes.count ?? 0;
  const rejectedCount = rejectedRes.count ?? 0;
  const submittedDecisionCount = approvedCount + rejectedCount;
  const approvalRate =
    submittedDecisionCount > 0 ? approvedCount / submittedDecisionCount : null;

  const createdAt = (profileRes.data as { created_at?: string } | null)?.created_at;
  const accountAgeDays = createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
    : null;

  const offerIds = (votesRes.data ?? []).map((r: { id: string }) => r.id);
  let distinctPositiveVoters = 0;
  if (offerIds.length > 0) {
    const voterIds = new Set<string>();
    const chunkSize = 40;
    for (let i = 0; i < offerIds.length; i += chunkSize) {
      const chunk = offerIds.slice(i, i + chunkSize);
      const { data: votes } = await supabase
        .from('offer_votes')
        .select('user_id')
        .in('offer_id', chunk)
        .gt('value', 0);
      for (const v of votes ?? []) {
        const uid = (v as { user_id?: string }).user_id;
        if (uid) voterIds.add(uid);
      }
    }
    distinctPositiveVoters = voterIds.size;
  }

  return {
    approvedCount,
    rejectedCount,
    submittedDecisionCount,
    approvalRate,
    distinctPositiveVoters,
    accountAgeDays,
    isBanned: banned,
  };
}

/** Si no hay gates en env, solo bloquea bans. */
export function evaluateQualityGates(signals: HunterQualitySignals): QualityGateResult {
  if (signals.isBanned) {
    return {
      ok: false,
      reasonCode: 'banned',
      userMessage: 'No puedes desbloquear una nueva recompensa todavía.',
    };
  }

  const minAge = rewardsMinAccountAgeDays();
  if (minAge != null && (signals.accountAgeDays == null || signals.accountAgeDays < minAge)) {
    return {
      ok: false,
      reasonCode: 'account_age',
      userMessage: 'Continúa cazando ofertas de calidad.',
    };
  }

  const minRate = rewardsMinApprovalRate();
  if (
    minRate != null &&
    signals.submittedDecisionCount >= 5 &&
    signals.approvalRate != null &&
    signals.approvalRate < minRate
  ) {
    return {
      ok: false,
      reasonCode: 'approval_rate',
      userMessage: 'Continúa cazando ofertas de calidad.',
    };
  }

  const minDistinct = rewardsMinDistinctPositiveVoters();
  if (minDistinct != null && signals.distinctPositiveVoters < minDistinct) {
    return {
      ok: false,
      reasonCode: 'distinct_voters',
      userMessage: 'Continúa cazando ofertas de calidad.',
    };
  }

  return { ok: true, reasonCode: null, userMessage: null };
}

/** Progreso V1 + calidad opcional. No otorga recompensa. */
export function isEligibleForRewardUnlock(
  progress: RewardsProgress,
  quality: QualityGateResult,
): { eligible: boolean; reasonCode: string | null; userMessage: string | null } {
  if (!progress.unlockEligible) {
    const near =
      progress.approvedOffersCount >= Math.max(1, progress.requiredOffers - 3) ||
      progress.positiveVotesTotal >= Math.max(1, progress.requiredVotes - 3);
    return {
      eligible: false,
      reasonCode: 'progress',
      userMessage: near
        ? '¡Estás cada vez más cerca!'
        : 'Continúa cazando ofertas de calidad.',
    };
  }
  if (!quality.ok) {
    return {
      eligible: false,
      reasonCode: quality.reasonCode,
      userMessage: quality.userMessage,
    };
  }
  return { eligible: true, reasonCode: null, userMessage: null };
}
