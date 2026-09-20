import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { tryAcquireModerationLock, releaseModerationLockIfOwner } from './atomicModerationLock';
import { isModerationLockStale } from './moderationLock';
import { countClaimEligibleOffers, isOfferClaimEligible } from './offerClaimEligibility';
import type { ModerationQueueOffer } from './pickNextEligibleOffer';
import { sortPendingOffersForModeration } from './sortPendingOffers';
import type { ModerationLevel } from './classifyModerationLevel';
import { classifyOfferModerationLevel } from './classifyOfferModerationLevel';
import { moderationLevelWithinMax } from './moderationLevelRank';
import {
  fetchBannedCreatorIds,
  fetchPendingReportOfferIds,
} from './moderationQueueSignals';
import { CLAIM_EXCLUDE_IDS_MAX, CLAIM_QUEUE_HARD_CAP } from './slaContract';
import { releaseStaleModerationLocks } from './releaseStaleLocks';

/** Distingue ítem nuevo de cola vs reclaim tras lease expirado. */
export type ClaimKind = 'fresh' | 'stale_reclaim' | 'reclaim_own';

export function classifyClaimKind(params: {
  previousLockedBy: string | null | undefined;
  previousLockedAt: string | null | undefined;
  moderatorId: string;
}): ClaimKind {
  const prior = params.previousLockedBy ?? null;
  if (!prior) return 'fresh';
  if (prior === params.moderatorId) return 'reclaim_own';
  if (isModerationLockStale(params.previousLockedAt)) return 'stale_reclaim';
  // Elegible solo si no hay lock ajeno fresco; si llegamos aquí con prior ajeno no-stale,
  // tryAcquire debería fallar — clasificar como fresh por seguridad de telemetría.
  return 'fresh';
}

const CLAIM_SELECT_CORE =
  'id, title, price, original_price, store, category, bank_coupon, coupons, msi_months, image_url, image_urls, offer_url, description, hunter_comment, steps, conditions, created_at, created_by, risk_score, moderator_comment, locked_by, locked_at, snoozed_until, link_mod_ok, profiles:public_profiles_view!created_by(display_name, avatar_url)';

const CLAIM_SELECT_WITH_ORIGINAL = `${CLAIM_SELECT_CORE}, original_offer_url, bot_meta`;

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase());
}

export type ClaimSourceTab = 'all' | 'bot' | 'users';

function computeIsBot(
  row: {
    created_by?: string | null;
    moderator_comment?: string | null;
    description?: string | null;
  },
  botIds: Set<string>
): boolean {
  if (row.created_by && botIds.has(row.created_by)) return true;
  if ((row.moderator_comment ?? '').toLowerCase().includes('[bot-ingest]')) return true;
  if ((row.description ?? '').toLowerCase().includes('ingesta automática (bot)')) return true;
  return false;
}

function filterBySourceTab<T extends ModerationQueueOffer & { is_bot?: boolean }>(
  offers: T[],
  sourceTab: ClaimSourceTab
): T[] {
  if (sourceTab === 'bot') return offers.filter((o) => o.is_bot === true);
  if (sourceTab === 'users') return offers.filter((o) => o.is_bot !== true);
  return offers;
}

/**
 * Mueve al frente la oferta pedida por deep-link, conservando el orden editorial
 * del resto. Preferencia, no bypass: si no está en la lista de elegibles
 * (no pending, snoozed, con lock ajeno, fuera de nivel) el orden no cambia.
 */
export function preferOfferFirst<T extends { id: string }>(
  sorted: readonly T[],
  preferOfferId: string | null
): T[] {
  if (!preferOfferId) return [...sorted];
  const preferred = sorted.filter((o) => o.id === preferOfferId);
  if (preferred.length === 0) return [...sorted];
  return [...preferred, ...sorted.filter((o) => o.id !== preferOfferId)];
}

export type ClaimNextResult = {
  claimed: boolean;
  offer: Record<string, unknown> | null;
  /** Presente solo si claimed=true. */
  claimKind: ClaimKind | null;
  stats: {
    globalPending: number;
    availableEstimate: number;
    /** Cap de candidatos considerados en este claim (escala). */
    candidateCap: number;
    oldestPendingCreatedAt: string | null;
    pendingGt24h: number;
    claimedActive: number;
  };
};

export async function claimNextModerationOffer(
  supabase: SupabaseClient,
  moderatorId: string,
  options?: {
    releaseOfferId?: string | null;
    excludeOfferIds?: string[];
    sourceTab?: ClaimSourceTab;
    maxAttempts?: number;
    maxLevel?: ModerationLevel;
    /**
     * Oferta que el moderador quiere atender primero (deep-link desde otro panel).
     * Es una PREFERENCIA de orden, no un bypass: si no está pending, no es elegible
     * o ya tiene lock ajeno, se sigue con la cola normal sin error.
     */
    preferOfferId?: string | null;
  }
): Promise<ClaimNextResult> {
  const sourceTab = options?.sourceTab ?? 'all';
  const excludeRaw = (options?.excludeOfferIds ?? []).filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );
  const exclude = new Set(excludeRaw.slice(-CLAIM_EXCLUDE_IDS_MAX));
  const maxAttempts = options?.maxAttempts ?? 40;
  const maxLevel = options?.maxLevel ?? 'enforcement';

  if (options?.releaseOfferId) {
    await releaseModerationLockIfOwner(supabase, options.releaseOfferId, moderatorId);
  }

  // Recovery pasivo: locks abandonados vuelven a cola antes de ordenar.
  await releaseStaleModerationLocks(supabase, { limit: 100 });

  const [{ count: pendingCount }, { count: claimedActive }, { count: pendingGt24hCount }] =
    await Promise.all([
      supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase
        .from('offers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .not('locked_by', 'is', null),
      supabase
        .from('offers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);

  let rows: Record<string, unknown>[] | null = null;
  {
    // Escala: no traer toda la tabla; priorizar backlog (created_at ASC) hasta hard cap.
    const first = await supabase
      .from('offers')
      .select(CLAIM_SELECT_WITH_ORIGINAL)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(CLAIM_QUEUE_HARD_CAP);
    if (
      first.error &&
      (hasMissingColumn(first.error, 'original_offer_url') || hasMissingColumn(first.error, 'bot_meta'))
    ) {
      const fallback = await supabase
        .from('offers')
        .select(CLAIM_SELECT_CORE)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(CLAIM_QUEUE_HARD_CAP);
      if (fallback.error) throw new Error(fallback.error.message);
      rows = (fallback.data ?? []) as Record<string, unknown>[];
    } else if (first.error) {
      throw new Error(first.error.message);
    } else {
      rows = (first.data ?? []) as Record<string, unknown>[];
    }
  }

  const config = loadBotIngestConfig('standard');
  const botIds = new Set(config.botUserIdsForQuota);

  const normalized = (rows ?? []).map((row) => {
    const r = row;
    const profiles = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      ...r,
      profiles,
      is_bot: computeIsBot(
        r as { created_by?: string | null; moderator_comment?: string | null; description?: string | null },
        botIds
      ),
    } as unknown as ModerationQueueOffer & Record<string, unknown> & { is_bot: boolean };
  });

  const scoped = filterBySourceTab(normalized, sourceTab);
  const globalPending = pendingCount ?? scoped.length;
  const availableEstimate = countClaimEligibleOffers(scoped, moderatorId);
  const oldestPendingCreatedAt =
    scoped.length > 0
      ? scoped.reduce((a, b) =>
          new Date(a.created_at).getTime() < new Date(b.created_at).getTime() ? a : b,
        ).created_at
      : null;

  const emptyStats = {
    globalPending,
    availableEstimate,
    candidateCap: CLAIM_QUEUE_HARD_CAP,
    oldestPendingCreatedAt,
    pendingGt24h: pendingGt24hCount ?? 0,
    claimedActive: claimedActive ?? 0,
  };

  const eligible = scoped.filter((o) => isOfferClaimEligible(o, moderatorId, exclude));
  const offerIds = eligible.map((o) => o.id);
  const creatorIds = [
    ...new Set(
      eligible
        .map((o) => (o as { created_by?: string | null }).created_by)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const [reportedOfferIds, bannedCreatorIds] = await Promise.all([
    fetchPendingReportOfferIds(supabase, offerIds),
    fetchBannedCreatorIds(supabase, creatorIds),
  ]);

  const sorted = sortPendingOffersForModeration(eligible).filter((candidate) => {
    const createdBy = (candidate as { created_by?: string | null }).created_by;
    const { level } = classifyOfferModerationLevel(
      candidate as Parameters<typeof classifyOfferModerationLevel>[0],
      {
        authorBanned: Boolean(createdBy && bannedCreatorIds.has(createdBy)),
        hasPendingReport: reportedOfferIds.has(candidate.id),
        similarCount: 0,
      }
    );
    return moderationLevelWithinMax(level, maxLevel);
  });

  const ordered = preferOfferFirst(sorted, options?.preferOfferId ?? null);

  for (const candidate of ordered.slice(0, maxAttempts)) {
    const claimKind = classifyClaimKind({
      previousLockedBy: (candidate as { locked_by?: string | null }).locked_by,
      previousLockedAt: (candidate as { locked_at?: string | null }).locked_at,
      moderatorId,
    });

    const acquired = await tryAcquireModerationLock(supabase, candidate.id, moderatorId);
    if (!acquired.claimed) continue;

    let offerFresh: Record<string, unknown> | null = null;
    const withExtra = await supabase
      .from('offers')
      .select(CLAIM_SELECT_WITH_ORIGINAL)
      .eq('id', candidate.id)
      .maybeSingle();
    if (withExtra.error && hasMissingColumn(withExtra.error, 'original_offer_url')) {
      const core = await supabase
        .from('offers')
        .select(CLAIM_SELECT_CORE)
        .eq('id', candidate.id)
        .maybeSingle();
      offerFresh = (core.data as Record<string, unknown> | null) ?? null;
    } else {
      offerFresh = (withExtra.data as Record<string, unknown> | null) ?? null;
    }

    if (!offerFresh) {
      await releaseModerationLockIfOwner(supabase, candidate.id, moderatorId);
      continue;
    }

    const offerRow = offerFresh;
    const profiles = Array.isArray(offerRow.profiles) ? offerRow.profiles[0] : offerRow.profiles;
    return {
      claimed: true,
      claimKind,
      offer: {
        ...offerRow,
        profiles,
        is_bot: computeIsBot(
          offerRow as {
            created_by?: string | null;
            moderator_comment?: string | null;
            description?: string | null;
          },
          botIds
        ),
      },
      stats: {
        ...emptyStats,
        availableEstimate: Math.max(0, availableEstimate - 1),
      },
    };
  }

  return {
    claimed: false,
    offer: null,
    claimKind: null,
    stats: emptyStats,
  };
}
