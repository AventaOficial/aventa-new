/**
 * Señales de calidad / anti-abuso — Programa de Recompensas V1 (P0-1).
 * Hard gates fail-closed (constantes en config). Sin env opcional que desactive gates.
 *
 * Política de votantes banned: un voto positivo de un usuario con ban activo
 * NO cuenta hacia el umbral de distinct voters.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RewardsProgress } from '@/lib/rewards/eligibility';
import {
  REWARDS_MIN_ACCOUNT_AGE_DAYS,
  REWARDS_MIN_APPROVAL_DECISIONS,
  REWARDS_MIN_APPROVAL_RATE,
  REWARDS_REQUIRED_POSITIVE_VOTES,
} from '@/lib/rewards/config';
import { isUserBanned } from '@/lib/server/isUserBanned';

export type HunterQualitySignals = {
  approvedCount: number;
  rejectedCount: number;
  submittedDecisionCount: number;
  approvalRate: number | null;
  distinctPositiveVoters: number;
  /** false si el conteo de distinct no pudo completarse de forma confiable. */
  distinctVotersReliable: boolean;
  accountAgeDays: number | null;
  isBanned: boolean;
};

export type QualityGateResult = {
  ok: boolean;
  reasonCode: string | null;
  userMessage: string | null;
};

export type DistinctVotersResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'query_failed' | 'ban_lookup_failed' };

async function loadActiveBannedUserIds(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<{ ok: true; banned: Set<string> } | { ok: false }> {
  const banned = new Set<string>();
  if (userIds.length === 0) return { ok: true, banned };

  const nowIso = new Date().toISOString();
  const chunkSize = 40;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('user_bans')
      .select('user_id, expires_at')
      .in('user_id', chunk);

    if (error) {
      console.error('[rewards/quality] ban lookup', error.message);
      return { ok: false };
    }

    for (const row of data ?? []) {
      const uid = (row as { user_id?: string }).user_id;
      const expires = (row as { expires_at?: string | null }).expires_at;
      if (!uid) continue;
      if (expires == null || expires > nowIso) {
        banned.add(uid);
      }
    }
  }
  return { ok: true, banned };
}

/**
 * COUNT(DISTINCT voter) con value > 0 sobre ofertas approved/published del cazador.
 * Excluye votantes con ban activo. Unicidad offer+user ya existe en DB.
 */
export async function countDistinctPositiveVoters(
  supabase: SupabaseClient,
  creatorId: string,
): Promise<DistinctVotersResult> {
  const { data: offers, error: offersErr } = await supabase
    .from('offers')
    .select('id')
    .eq('created_by', creatorId)
    .in('status', ['approved', 'published']);

  if (offersErr) {
    console.error('[rewards/quality] list offers for voters', offersErr.message);
    return { ok: false, reason: 'query_failed' };
  }

  const offerIds = (offers ?? []).map((r: { id: string }) => r.id);
  if (offerIds.length === 0) {
    return { ok: true, count: 0 };
  }

  const voterIds = new Set<string>();
  const chunkSize = 40;
  for (let i = 0; i < offerIds.length; i += chunkSize) {
    const chunk = offerIds.slice(i, i + chunkSize);
    const { data: votes, error: votesErr } = await supabase
      .from('offer_votes')
      .select('user_id')
      .in('offer_id', chunk)
      .gt('value', 0);

    if (votesErr) {
      console.error('[rewards/quality] list votes', votesErr.message);
      return { ok: false, reason: 'query_failed' };
    }

    for (const v of votes ?? []) {
      const uid = (v as { user_id?: string }).user_id;
      if (uid) voterIds.add(uid);
    }
  }

  const banLookup = await loadActiveBannedUserIds(supabase, [...voterIds]);
  if (!banLookup.ok) {
    return { ok: false, reason: 'ban_lookup_failed' };
  }

  let count = 0;
  for (const uid of voterIds) {
    if (!banLookup.banned.has(uid)) count += 1;
  }
  return { ok: true, count };
}

export async function getHunterQualitySignals(
  supabase: SupabaseClient,
  userId: string,
): Promise<HunterQualitySignals> {
  const [approvedRes, rejectedRes, profileRes, banned, distinctResult] = await Promise.all([
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
    countDistinctPositiveVoters(supabase, userId),
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

  return {
    approvedCount,
    rejectedCount,
    submittedDecisionCount,
    approvalRate,
    distinctPositiveVoters: distinctResult.ok ? distinctResult.count : 0,
    distinctVotersReliable: distinctResult.ok,
    accountAgeDays,
    isBanned: banned,
  };
}

/** Hard gates V1 — cualquiera falla → no unlock. */
export function evaluateQualityGates(signals: HunterQualitySignals): QualityGateResult {
  if (signals.isBanned) {
    return {
      ok: false,
      reasonCode: 'banned',
      userMessage: 'No puedes desbloquear una nueva recompensa todavía.',
    };
  }

  if (!signals.distinctVotersReliable) {
    return {
      ok: false,
      reasonCode: 'distinct_voters_unreliable',
      userMessage: 'Continúa cazando ofertas de calidad.',
    };
  }

  if (signals.distinctPositiveVoters < REWARDS_REQUIRED_POSITIVE_VOTES) {
    return {
      ok: false,
      reasonCode: 'distinct_voters',
      userMessage: 'Continúa cazando ofertas de calidad.',
    };
  }

  if (signals.accountAgeDays == null || signals.accountAgeDays < REWARDS_MIN_ACCOUNT_AGE_DAYS) {
    return {
      ok: false,
      reasonCode: 'account_age',
      userMessage: 'Continúa cazando ofertas de calidad.',
    };
  }

  // Datos insuficientes → FAIL CLOSED (no se interpreta como aprobado).
  if (signals.submittedDecisionCount < REWARDS_MIN_APPROVAL_DECISIONS) {
    return {
      ok: false,
      reasonCode: 'insufficient_decisions',
      userMessage: 'Continúa cazando ofertas de calidad.',
    };
  }

  if (signals.approvalRate == null || signals.approvalRate < REWARDS_MIN_APPROVAL_RATE) {
    return {
      ok: false,
      reasonCode: 'approval_rate',
      userMessage: 'Continúa cazando ofertas de calidad.',
    };
  }

  return { ok: true, reasonCode: null, userMessage: null };
}

/** Progreso de volumen + calidad. No otorga recompensa monetaria. */
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
