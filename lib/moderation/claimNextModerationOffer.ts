import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { tryAcquireModerationLock, releaseModerationLockIfOwner } from './atomicModerationLock';
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

const CLAIM_SELECT =
  'id, title, price, original_price, store, category, bank_coupon, coupons, image_url, image_urls, offer_url, description, steps, conditions, created_at, created_by, risk_score, moderator_comment, locked_by, locked_at, snoozed_until, link_mod_ok, profiles:public_profiles_view!created_by(display_name, avatar_url)';

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

export type ClaimNextResult = {
  claimed: boolean;
  offer: Record<string, unknown> | null;
  stats: {
    globalPending: number;
    availableEstimate: number;
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
  }
): Promise<ClaimNextResult> {
  const sourceTab = options?.sourceTab ?? 'all';
  const exclude = new Set(options?.excludeOfferIds ?? []);
  const maxAttempts = options?.maxAttempts ?? 40;
  const maxLevel = options?.maxLevel ?? 'enforcement';

  if (options?.releaseOfferId) {
    await releaseModerationLockIfOwner(supabase, options.releaseOfferId, moderatorId);
  }

  const { data: rows, error } = await supabase
    .from('offers')
    .select(CLAIM_SELECT)
    .eq('status', 'pending');

  if (error) {
    throw new Error(error.message);
  }

  const config = loadBotIngestConfig('standard');
  const botIds = new Set(config.botUserIdsForQuota);

  const normalized = (rows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
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
  const globalPending = scoped.length;
  const availableEstimate = countClaimEligibleOffers(scoped, moderatorId);

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

  for (const candidate of sorted.slice(0, maxAttempts)) {
    const acquired = await tryAcquireModerationLock(supabase, candidate.id, moderatorId);
    if (!acquired.claimed) continue;

    const { data: fresh } = await supabase
      .from('offers')
      .select(CLAIM_SELECT)
      .eq('id', candidate.id)
      .maybeSingle();

    if (!fresh) {
      await releaseModerationLockIfOwner(supabase, candidate.id, moderatorId);
      continue;
    }

    const offerRow = fresh as Record<string, unknown>;
    const profiles = Array.isArray(offerRow.profiles) ? offerRow.profiles[0] : offerRow.profiles;
    return {
      claimed: true,
      offer: {
        ...offerRow,
        profiles,
        is_bot: computeIsBot(
          offerRow as { created_by?: string | null; moderator_comment?: string | null; description?: string | null },
          botIds
        ),
      },
      stats: { globalPending, availableEstimate: Math.max(0, availableEstimate - 1) },
    };
  }

  return {
    claimed: false,
    offer: null,
    stats: { globalPending, availableEstimate },
  };
}
