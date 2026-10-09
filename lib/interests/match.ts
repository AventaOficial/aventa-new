import { normalizeCategoryForStorage } from '@/lib/categories';
import { isPublicFeedStatus } from '@/lib/moderation/feedTakedown';
import {
  INTEREST_LIMITS,
  normalizeInterestText,
  significantTokens,
  type NormalizedInterest,
} from '@/lib/interests/normalize';
import { INTERESTS_SECTION } from '@/lib/interests/copy';

export type MatchKind = 'exact' | 'brand_model' | 'terms' | 'category';

const ACCESSORY_TERMS = [
  'funda',
  'case',
  'cover',
  'protector',
  'mica',
  'cargador',
  'cable',
  'repuesto',
  'carcasa',
  'templado',
  'adaptador',
  'forro',
  'estuche',
  'skin',
  'compatible',
];

const KIND_RANK: Record<MatchKind, number> = {
  exact: 4,
  brand_model: 3,
  terms: 2,
  category: 1,
};

export type MatchableOffer = {
  id: string;
  title: string;
  category?: string | null;
  status?: string | null;
  expiresAt?: string | null;
  upvotes?: number | null;
  rankingBlend?: number | null;
};

export type InterestMatch = {
  offerId: string;
  kind: MatchKind;
  confidence: 'high' | 'medium';
  interestLabel: string;
  label: string;
};

function containsPhrase(hay: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${hay} `.includes(` ${phrase} `);
}

function textIsAccessory(normalized: string): boolean {
  return ACCESSORY_TERMS.some((term) => containsPhrase(normalized, term));
}

export function isRecommendableOffer(offer: MatchableOffer, now: Date): boolean {
  if (!isPublicFeedStatus(offer.status)) return false;
  if (!offer.expiresAt) return true;
  const expires = new Date(offer.expiresAt);
  return !Number.isNaN(expires.getTime()) && expires.getTime() >= now.getTime();
}

function phrasesOf(interest: NormalizedInterest): string[] {
  return [interest.labelNorm, ...interest.aliasNorms].filter(Boolean);
}

function brandModelMatch(title: string, interest: NormalizedInterest): boolean {
  if (!interest.brandNorm || !interest.modelNorm) return false;
  return containsPhrase(title, interest.brandNorm) && containsPhrase(title, interest.modelNorm);
}

function termsMatch(title: string, interest: NormalizedInterest): boolean {
  for (const phrase of phrasesOf(interest)) {
    const tokens = significantTokens(phrase);
    if (tokens.length >= 2 && tokens.every((token) => containsPhrase(title, token))) return true;
    if (tokens.length === 1 && tokens[0].length >= 6 && containsPhrase(title, tokens[0])) return true;
  }
  return false;
}

function categoryMatch(offer: MatchableOffer, interest: NormalizedInterest): boolean {
  if (!interest.category) return false;
  const offerCategory = normalizeCategoryForStorage(offer.category);
  if (offerCategory !== interest.category) return false;
  const upvotes = offer.upvotes ?? 0;
  const blend = offer.rankingBlend ?? 0;
  return upvotes >= INTEREST_LIMITS.categoryMinUpvotes || blend >= 10;
}

export function matchInterestToOffer(
  interest: NormalizedInterest,
  offer: MatchableOffer,
  now: Date,
): InterestMatch | null {
  if (!isRecommendableOffer(offer, now)) return null;
  const title = normalizeInterestText(offer.title);
  if (!title) return null;
  const interestText = [interest.labelNorm, interest.brandNorm, interest.modelNorm].filter(Boolean).join(' ');
  if (textIsAccessory(title) && !textIsAccessory(interestText)) return null;

  let kind: MatchKind | null = null;
  if (phrasesOf(interest).some((phrase) => containsPhrase(title, phrase))) {
    const brandOk = !interest.brandNorm || containsPhrase(title, interest.brandNorm);
    const modelOk = !interest.modelNorm || containsPhrase(title, interest.modelNorm);
    if (brandOk && modelOk) kind = 'exact';
  }
  if (!kind && brandModelMatch(title, interest)) kind = 'brand_model';
  if (!kind && termsMatch(title, interest)) kind = 'terms';
  if (!kind && categoryMatch(offer, interest)) kind = 'category';
  if (!kind) return null;

  return {
    offerId: offer.id,
    kind,
    confidence: kind === 'terms' || kind === 'category' ? 'medium' : 'high',
    interestLabel: interest.label,
    label: INTERESTS_SECTION.matchLabels[kind],
  };
}

export function matchInterestsToOffers(
  interests: readonly NormalizedInterest[],
  offers: readonly MatchableOffer[],
  now: Date,
): InterestMatch[] {
  const best = new Map<string, InterestMatch>();
  for (const offer of offers) {
    for (const interest of interests) {
      const match = matchInterestToOffer(interest, offer, now);
      if (!match) continue;
      const current = best.get(offer.id);
      if (!current || KIND_RANK[match.kind] > KIND_RANK[current.kind]) best.set(offer.id, match);
    }
  }
  return [...best.values()].sort((a, b) => KIND_RANK[b.kind] - KIND_RANK[a.kind]);
}

export function hasDiscoveryQuality(offer: MatchableOffer): boolean {
  return (offer.upvotes ?? 0) >= INTEREST_LIMITS.discoveryMinUpvotes || (offer.rankingBlend ?? 0) >= 10;
}

export function pickDiscoveryOffers<T extends MatchableOffer>(
  offers: readonly T[],
  excludedIds: ReadonlySet<string>,
  now: Date,
  limit = INTEREST_LIMITS.discoveryInFeed,
): T[] {
  return offers
    .filter((offer) => !excludedIds.has(offer.id) && isRecommendableOffer(offer, now) && hasDiscoveryQuality(offer))
    .slice(0, limit);
}
