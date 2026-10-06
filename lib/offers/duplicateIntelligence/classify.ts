import { identityFromOffer } from './identity';
import { compareOfferPrices } from './price';
import {
  DUPLICATE_ALGORITHM_VERSION,
  type DuplicateAssessment,
  type MatchSignal,
  type ProductIdentity,
} from './types';

export type OfferSnapshot = {
  id: string;
  title: string | null;
  offerUrl: string | null;
  price: number | string | null;
  currency: string | null;
};

const STRONG_CONFIDENCE = 0.96;
const UNCERTAIN_CONFIDENCE = 0.72;

function assessment(
  relation: DuplicateAssessment['relation'],
  confidence: number | null,
  signals: MatchSignal[],
  price: DuplicateAssessment['price'],
  matchedOfferId: string | null,
): DuplicateAssessment {
  return {
    relation,
    confidence,
    signals,
    price,
    algorithmVersion: DUPLICATE_ALGORITHM_VERSION,
    matchedOfferId,
  };
}

function sameIdentity(left: ProductIdentity, right: ProductIdentity): boolean {
  return Boolean(left.key && right.key && left.key === right.key && left.strength === right.strength);
}

export function classifyOfferMatch(input: {
  incoming: OfferSnapshot;
  candidate: OfferSnapshot | null;
}): DuplicateAssessment {
  if (!input.candidate || input.candidate.id === input.incoming.id) {
    return assessment('NO_MATCH', null, [], null, null);
  }

  const incoming = identityFromOffer({ offerUrl: input.incoming.offerUrl, title: input.incoming.title });
  const candidate = identityFromOffer({ offerUrl: input.candidate.offerUrl, title: input.candidate.title });
  if (!sameIdentity(incoming, candidate) || incoming.strength === 'none') {
    return assessment('NO_MATCH', null, [{ code: 'no_shared_identity' }], null, null);
  }

  if (incoming.variant && candidate.variant && incoming.variant !== candidate.variant) {
    return assessment(
      'NO_MATCH',
      null,
      [{ code: 'variant_conflict', detail: `${incoming.variant}!=${candidate.variant}` }],
      null,
      null,
    );
  }

  const signals: MatchSignal[] = [{ code: 'same_identity', detail: incoming.key ?? undefined }];
  const price = compareOfferPrices({
    newAmount: input.incoming.price,
    newCurrency: input.incoming.currency,
    existingAmount: input.candidate.price,
    existingCurrency: input.candidate.currency,
  });

  if (!incoming.variant || !candidate.variant) {
    if (incoming.strength !== 'strong') {
      return assessment('UNCERTAIN_MATCH', UNCERTAIN_CONFIDENCE, [...signals, { code: 'weak_listing' }], price, input.candidate.id);
    }
    if (!incoming.variant && !candidate.variant) {
      signals.push({ code: 'variant_not_declared' });
    } else {
      signals.push({ code: 'variant_missing_on_one_side' });
      return assessment('UNCERTAIN_MATCH', UNCERTAIN_CONFIDENCE, signals, price, input.candidate.id);
    }
  } else {
    signals.push({ code: 'same_variant', detail: incoming.variant });
  }

  if (incoming.strength !== 'strong') {
    return assessment('UNCERTAIN_MATCH', UNCERTAIN_CONFIDENCE, signals, price, input.candidate.id);
  }

  if (price.status === 'unknown') {
    return assessment('UNCERTAIN_MATCH', UNCERTAIN_CONFIDENCE, [...signals, { code: price.reason }], price, input.candidate.id);
  }

  if (input.incoming.offerUrl && input.candidate.offerUrl && incoming.key === candidate.key && price.direction === 'similar') {
    const sameUrl = input.incoming.offerUrl.trim() === input.candidate.offerUrl.trim();
    if (sameUrl) {
      return assessment('SAME_OFFER', STRONG_CONFIDENCE, [...signals, { code: 'same_url' }], price, input.candidate.id);
    }
  }

  if (price.direction === 'better') {
    return assessment('SAME_PRODUCT_BETTER_PRICE', STRONG_CONFIDENCE, signals, price, input.candidate.id);
  }
  if (price.direction === 'worse') {
    return assessment('SAME_PRODUCT_WORSE_PRICE', STRONG_CONFIDENCE, signals, price, input.candidate.id);
  }
  return assessment('SAME_PRODUCT_SIMILAR_PRICE', STRONG_CONFIDENCE, signals, price, input.candidate.id);
}
