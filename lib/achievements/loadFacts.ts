import type { SupabaseClient } from '@supabase/supabase-js';
import { isBotUserId } from '@/lib/bots/ingest/isBotUserId';
import { lookupUserBan } from '@/lib/server/isUserBanned';
import { foldAchievementEvents } from './fold';
import { offerWasCorrected, readOfferQuality } from './quality';
import type { AchievementDomainEvent, UserFacts } from './types';

type OfferRow = {
  id: string;
  status: string | null;
  deleted_at: string | null;
  moderator_comment?: string | null;
  rejection_reason?: string | null;
  bot_meta?: unknown;
  created_at: string | null;
  expires_at?: string | null;
};

type VoteRow = {
  id?: string;
  offer_id: string;
  user_id: string;
  value: number;
  created_at?: string | null;
};

type CommentRow = {
  id: string;
  offer_id: string;
  user_id: string;
  content: string | null;
  status: string | null;
  created_at: string | null;
};

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

async function selectIn<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  ids: string[],
): Promise<{ rows: T[]; missingColumn: boolean }> {
  const rows: T[] = [];
  for (const group of chunks(ids, 80)) {
    const { data, error } = await supabase.from(table).select(columns).in(column, group);
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('column') || message.includes('schema')) {
        return { rows, missingColumn: true };
      }
      throw new Error(error.message);
    }
    rows.push(...((data ?? []) as T[]));
  }
  return { rows, missingColumn: false };
}

function validStatus(status: string | null): boolean {
  return status === 'approved' || status === 'published';
}

export type LoadedAchievementFacts = {
  facts: UserFacts;
  banned: boolean;
  unavailable: boolean;
};

export async function loadUserAchievementFacts(
  supabase: SupabaseClient,
  userId: string,
): Promise<LoadedAchievementFacts> {
  if (isBotUserId(userId)) {
    return { facts: foldAchievementEvents([], { banned: true }), banned: true, unavailable: false };
  }

  const ban = await lookupUserBan(supabase, userId);
  if (!ban.ok) return { facts: foldAchievementEvents([]), banned: false, unavailable: true };
  if (ban.banned) {
    return { facts: foldAchievementEvents([], { banned: true }), banned: true, unavailable: false };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('reputation_level')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  const reputationLevel = Math.max(1, (profile as { reputation_level?: number } | null)?.reputation_level ?? 1);

  const offerQuery = await supabase
    .from('offers')
    .select('id, status, deleted_at, moderator_comment, rejection_reason, bot_meta, created_at, expires_at')
    .eq('created_by', userId);

  let offerRows = (offerQuery.data ?? []) as OfferRow[];
  if (offerQuery.error) {
    const fallback = await supabase
      .from('offers')
      .select('id, status, deleted_at, created_at, expires_at')
      .eq('created_by', userId);
    if (fallback.error) throw new Error(fallback.error.message);
    offerRows = (fallback.data ?? []) as OfferRow[];
  }

  const events: AchievementDomainEvent[] = [];
  const approvedIds: string[] = [];

  for (const offer of offerRows) {
    if (!offer.id || !offer.created_at) continue;
    if (offer.deleted_at) continue;
    const quality = readOfferQuality(offer.bot_meta);
    if (offer.status === 'rejected') {
      events.push({
        type: 'OFFER_REJECTED',
        eventId: offer.id,
        at: offer.created_at,
        offerId: offer.id,
      });
      continue;
    }
    if (!validStatus(offer.status)) continue;
    if (quality.duplicate || quality.gateFailed) {
      events.push({
        type: 'OFFER_REJECTED',
        eventId: offer.id,
        at: offer.created_at,
        offerId: offer.id,
        duplicate: quality.duplicate,
        gateFailed: quality.gateFailed,
      });
      continue;
    }
    approvedIds.push(offer.id);
    events.push({
      type: 'OFFER_APPROVED',
      eventId: offer.id,
      at: offer.created_at,
      offerId: offer.id,
      clean: !offerWasCorrected(offer.moderator_comment) && !offer.rejection_reason?.trim(),
      qualifies: quality.qualifies,
      secret: quality.secret,
      expiresAt: offer.expires_at ?? null,
      deleted: false,
      duplicate: false,
      gateFailed: false,
    });
  }

  const receivedVotes = approvedIds.length
    ? await selectIn<VoteRow>(supabase, 'offer_votes', 'id, offer_id, user_id, value', 'offer_id', approvedIds)
    : { rows: [] as VoteRow[], missingColumn: false };

  const voterIds = [...new Set(receivedVotes.rows.map((vote) => vote.user_id).filter(Boolean))];
  const bannedVoters = await activeBanSet(supabase, voterIds);

  for (const vote of receivedVotes.rows) {
    const voteId = vote.id ?? `${vote.offer_id}:${vote.user_id}`;
    events.push({
      type: 'OFFER_RECEIVED_VOTE',
      eventId: voteId,
      at: vote.created_at ?? '1970-01-01T00:00:00.000Z',
      offerId: vote.offer_id,
      value: vote.value,
      self: vote.user_id === userId,
      voterBanned: bannedVoters.has(vote.user_id),
      approved: true,
    });
  }

  const cast = await supabase
    .from('offer_votes')
    .select('id, offer_id, user_id, value, created_at')
    .eq('user_id', userId)
    .gt('value', 0);
  let castRows = (cast.data ?? []) as VoteRow[];
  if (cast.error) {
    const fallback = await supabase
      .from('offer_votes')
      .select('id, offer_id, user_id, value')
      .eq('user_id', userId)
      .gt('value', 0);
    if (fallback.error) throw new Error(fallback.error.message);
    castRows = (fallback.data ?? []) as VoteRow[];
  }

  const castOfferIds = [...new Set(castRows.map((vote) => vote.offer_id))];
  const castOffers = castOfferIds.length
    ? await selectIn<{ id: string; status: string | null; deleted_at: string | null; created_by: string | null }>(
        supabase,
        'offers',
        'id, status, deleted_at, created_by',
        'id',
        castOfferIds,
      )
    : { rows: [], missingColumn: false };
  const castOfferById = new Map(castOffers.rows.map((offer) => [offer.id, offer]));

  for (const vote of castRows) {
    if (!vote.created_at) continue;
    const offer = castOfferById.get(vote.offer_id);
    const approved = Boolean(offer && validStatus(offer.status) && !offer.deleted_at && offer.created_by !== userId);
    events.push({
      type: 'USER_VOTED',
      eventId: vote.id ?? `${vote.offer_id}:${vote.user_id}`,
      at: vote.created_at,
      offerId: vote.offer_id,
      value: vote.value,
      self: offer?.created_by === userId,
      voterBanned: false,
      approved,
    });
  }

  const ownComments = await supabase
    .from('comments')
    .select('id, offer_id, user_id, content, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'approved');
  if (ownComments.error) throw new Error(ownComments.error.message);
  const ownRows = (ownComments.data ?? []) as CommentRow[];
  const ownOfferIds = [...new Set(ownRows.map((comment) => comment.offer_id))];
  const ownOfferRows = ownOfferIds.length
    ? await selectIn<{ id: string; created_by: string | null; status: string | null; deleted_at: string | null }>(
        supabase,
        'offers',
        'id, created_by, status, deleted_at',
        'id',
        ownOfferIds,
      )
    : { rows: [], missingColumn: false };
  const ownOfferById = new Map(ownOfferRows.rows.map((offer) => [offer.id, offer]));

  for (const comment of ownRows) {
    const offer = ownOfferById.get(comment.offer_id);
    const onOwnOffer = offer?.created_by === userId;
    const live = Boolean(offer && validStatus(offer.status) && !offer.deleted_at);
    events.push({
      type: 'USER_COMMENTED',
      eventId: comment.id,
      at: comment.created_at ?? '1970-01-01T00:00:00.000Z',
      offerId: comment.offer_id,
      approved: comment.status === 'approved' && live,
      onOwnOffer,
      authorBanned: false,
      commentBody: comment.content ?? '',
    });
  }

  const receivedComments = approvedIds.length
    ? await selectIn<CommentRow>(
        supabase,
        'comments',
        'id, offer_id, user_id, content, status, created_at',
        'offer_id',
        approvedIds,
      )
    : { rows: [] as CommentRow[], missingColumn: false };
  const foreign = receivedComments.rows.filter((comment) => comment.user_id !== userId && comment.status === 'approved');
  const commentIds = foreign.map((comment) => comment.id);
  const likes = commentIds.length
    ? await selectIn<{ comment_id: string; user_id: string }>(
        supabase,
        'comment_likes',
        'comment_id, user_id',
        'comment_id',
        commentIds,
      )
    : { rows: [], missingColumn: false };
  const likerIds = [...new Set(likes.rows.map((like) => like.user_id))];
  const bannedLikers = await activeBanSet(supabase, likerIds);
  const usefulIds = new Set<string>();
  const authorByComment = new Map(foreign.map((comment) => [comment.id, comment.user_id]));
  for (const like of likes.rows) {
    if (like.user_id === authorByComment.get(like.comment_id)) continue;
    if (bannedLikers.has(like.user_id)) continue;
    usefulIds.add(like.comment_id);
  }
  const bannedAuthors = await activeBanSet(supabase, foreign.map((comment) => comment.user_id));

  for (const comment of foreign) {
    events.push({
      type: 'OFFER_RECEIVED_COMMENT',
      eventId: comment.id,
      at: comment.created_at ?? '1970-01-01T00:00:00.000Z',
      offerId: comment.offer_id,
      approved: true,
      useful: usefulIds.has(comment.id),
      onOwnOffer: false,
      authorBanned: bannedAuthors.has(comment.user_id),
      commentBody: comment.content ?? '',
    });
  }

  events.push({
    type: 'LEVEL_REACHED',
    eventId: `level:${userId}:${reputationLevel}`,
    at: '1970-01-01T00:00:00.000Z',
    level: reputationLevel,
  });

  return {
    facts: foldAchievementEvents(events, { reputationLevel }),
    banned: false,
    unavailable: false,
  };
}

async function activeBanSet(supabase: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const now = new Date().toISOString();
  const banned = new Set<string>();
  for (const group of chunks(ids, 80)) {
    const { data, error } = await supabase
      .from('user_bans')
      .select('user_id, expires_at')
      .in('user_id', group);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ user_id: string; expires_at: string | null }>) {
      if (!row.expires_at || row.expires_at > now) banned.add(row.user_id);
    }
  }
  return banned;
}
