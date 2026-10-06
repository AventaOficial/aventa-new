import {
  flashAvailability,
  isBlackFridayWindow,
  isDawnHour,
  isNightHour,
  isSeasonWindow,
  longestConsecutiveDays,
  mexicoDayAndHour,
} from './calendar';
import { seasonIdAt } from './seasons';
import type { AchievementDomainEvent, ApprovedOfferFact, UserFacts } from './types';

export function emptyFacts(partial: Partial<UserFacts> = {}): UserFacts {
  return {
    banned: false,
    approvedOffers: 0,
    rejectedOffers: 0,
    cleanApprovals: 0,
    qualityOffers: 0,
    receivedPositiveVotes: 0,
    maxVotesOnSingleOffer: 0,
    usefulCommentsReceived: 0,
    validConversations: 0,
    distinctContributionDays: 0,
    longestConsecutiveDays: 0,
    reputationLevel: 1,
    votesCast: 0,
    favorites: 0,
    uniqueCategories: 0,
    uniqueStores: 0,
    commentLikesReceived: 0,
    dawnExceptional: false,
    nightExceptional: false,
    flashHunter: false,
    blackFridayHunter: false,
    seasonHunter: false,
    secretOffer: false,
    offers: [],
    ...partial,
  };
}

function normalizeBody(body: string | undefined): string {
  return (body ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeLabel(value: string | null | undefined): string | null {
  const label = (value ?? '').trim().toLowerCase();
  return label.length > 0 ? label : null;
}

function eventKey(event: AchievementDomainEvent): string {
  return `${event.type}:${event.eventId}`;
}

/**
 * Reduce eventos validados a hechos.
 * Un eventId repetido no mueve el progreso.
 * REWARD_UNLOCKED no entra: el dinero no es un logro.
 */
export function foldAchievementEvents(
  events: readonly AchievementDomainEvent[],
  options: { reputationLevel?: number; banned?: boolean; favorites?: number } = {},
): UserFacts {
  if (options.banned) return emptyFacts({ banned: true, reputationLevel: options.reputationLevel ?? 1 });

  const seen = new Set<string>();
  const approved = new Map<string, ApprovedOfferFact>();
  const rejected = new Set<string>();
  const votesByOffer = new Map<string, Set<string>>();
  const usefulComments = new Set<string>();
  const usefulBodies = new Set<string>();
  const conversationOffers = new Set<string>();
  const conversationBodies = new Set<string>();
  const contributionDays = new Set<string>();
  let level = options.reputationLevel ?? 1;
  let votesCast = 0;
  let commentLikes = 0;

  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at) || eventKey(a).localeCompare(eventKey(b)));

  for (const event of ordered) {
    if (!event.eventId || seen.has(eventKey(event))) continue;
    seen.add(eventKey(event));

    if (event.type === 'REWARD_UNLOCKED') continue;

    if (event.type === 'STREAK_DAY_COMPLETED') {
      const when = mexicoDayAndHour(event.at);
      if (when) contributionDays.add(when.day);
      continue;
    }

    if (event.type === 'LEVEL_REACHED' && typeof event.level === 'number' && event.level > level) {
      level = event.level;
      continue;
    }

    if (event.type === 'OFFER_REJECTED' && event.offerId) {
      rejected.add(event.offerId);
      approved.delete(event.offerId);
      continue;
    }

    if (event.type === 'OFFER_APPROVED' && event.offerId) {
      if (event.deleted || event.duplicate || event.gateFailed) {
        rejected.add(event.offerId);
        approved.delete(event.offerId);
        continue;
      }
      rejected.delete(event.offerId);
      const current = approved.get(event.offerId);
      approved.set(event.offerId, {
        offerId: event.offerId,
        at: current?.at ?? event.at,
        clean: event.clean === true,
        qualifies: event.qualifies === true || current?.qualifies === true,
        secret: event.secret === true || current?.secret === true,
        expiresAt: event.expiresAt ?? current?.expiresAt ?? null,
        votes: current?.votes ?? 0,
        category: normalizeLabel(event.category) ?? current?.category ?? null,
        store: normalizeLabel(event.store) ?? current?.store ?? null,
        seasonId: current?.seasonId ?? seasonIdAt(current?.at ?? event.at),
      });
      const when = mexicoDayAndHour(event.at);
      if (when) contributionDays.add(when.day);
      continue;
    }

    if (event.type === 'QUALITY_THRESHOLD_REACHED' && event.offerId) {
      const current = approved.get(event.offerId);
      if (!current) continue;
      approved.set(event.offerId, {
        ...current,
        qualifies: event.qualifies !== false,
        secret: event.secret === true || current.secret,
      });
      continue;
    }

    if (event.type === 'OFFER_RECEIVED_VOTE' || event.type === 'USER_VOTED') {
      const positive = (event.value ?? 0) > 0;
      const valid = positive && event.self !== true && event.voterBanned !== true && event.approved !== false;
      if (!valid || !event.offerId) continue;
      const bucket = votesByOffer.get(event.offerId) ?? new Set<string>();
      bucket.add(event.eventId);
      votesByOffer.set(event.offerId, bucket);
      if (event.type === 'USER_VOTED') {
        votesCast += 1;
        const when = mexicoDayAndHour(event.at);
        if (when) contributionDays.add(when.day);
      }
      continue;
    }

    if (event.type === 'OFFER_RECEIVED_COMMENT' || event.type === 'USER_COMMENTED') {
      const body = normalizeBody(event.commentBody);
      const valid =
        event.approved === true
        && event.authorBanned !== true
        && event.onOwnOffer !== true
        && body.length > 0;
      if (!valid) continue;
      if (
        event.type === 'OFFER_RECEIVED_COMMENT'
        && event.useful === true
        && event.eventId
        && !usefulBodies.has(body)
      ) {
        usefulBodies.add(body);
        usefulComments.add(event.eventId);
      }
      if (event.type === 'USER_COMMENTED' && event.offerId && !conversationBodies.has(body)) {
        conversationBodies.add(body);
        conversationOffers.add(event.offerId);
        if (event.useful === true) commentLikes += 1;
        const when = mexicoDayAndHour(event.at);
        if (when) contributionDays.add(when.day);
      }
    }
  }

  const offers = [...approved.values()].map((offer) => ({
    ...offer,
    votes: votesByOffer.get(offer.offerId)?.size ?? offer.votes,
  }));
  let received = 0;
  let maxVotes = 0;
  let dawn = false;
  let night = false;
  let flash = false;
  let blackFriday = false;
  let season = false;
  let secret = false;
  let clean = 0;
  let quality = 0;

  for (const offer of offers) {
    received += offer.votes;
    if (offer.votes > maxVotes) maxVotes = offer.votes;
    if (offer.clean) clean += 1;
    if (offer.qualifies) quality += 1;
    if (offer.secret) secret = true;
    const when = mexicoDayAndHour(offer.at);
    if (offer.qualifies && when) {
      if (isDawnHour(when.hour)) dawn = true;
      if (isNightHour(when.hour)) night = true;
      if (isBlackFridayWindow(when.day)) blackFriday = true;
      if (isSeasonWindow(when.day)) season = true;
    }
    if (offer.qualifies && flashAvailability(offer.at, offer.expiresAt)) flash = true;
  }

  return emptyFacts({
    approvedOffers: offers.length,
    rejectedOffers: rejected.size,
    cleanApprovals: clean,
    qualityOffers: quality,
    receivedPositiveVotes: received,
    maxVotesOnSingleOffer: maxVotes,
    usefulCommentsReceived: usefulComments.size,
    validConversations: conversationOffers.size,
    distinctContributionDays: contributionDays.size,
    longestConsecutiveDays: longestConsecutiveDays([...contributionDays]),
    reputationLevel: level,
    votesCast,
    favorites: Math.max(0, options.favorites ?? 0),
    uniqueCategories: new Set(offers.map((offer) => offer.category).filter((value): value is string => Boolean(value))).size,
    uniqueStores: new Set(offers.map((offer) => offer.store).filter((value): value is string => Boolean(value))).size,
    commentLikesReceived: commentLikes,
    dawnExceptional: dawn,
    nightExceptional: night,
    flashHunter: flash,
    blackFridayHunter: blackFriday,
    seasonHunter: season,
    secretOffer: secret,
    offers,
  });
}
