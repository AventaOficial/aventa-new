export const DUPLICATE_ALGORITHM_VERSION = 'duplicate-intelligence-v1';

export const MATCH_RELATIONS = [
  'NO_MATCH',
  'POSSIBLE_DUPLICATE',
  'SAME_PRODUCT_BETTER_PRICE',
  'SAME_PRODUCT_WORSE_PRICE',
  'SAME_PRODUCT_SIMILAR_PRICE',
  'SAME_OFFER',
  'UNCERTAIN_MATCH',
] as const;

export type MatchRelation = (typeof MATCH_RELATIONS)[number];

export type IdentityStrength = 'strong' | 'listing' | 'none';

export type ProductIdentity = {
  key: string | null;
  strength: IdentityStrength;
  variant: string | null;
};

export type PriceComparison =
  | {
      status: 'compared';
      direction: 'better' | 'worse' | 'similar';
      absoluteDifferenceMinor: bigint;
      percentage: number;
    }
  | { status: 'unknown'; reason: 'missing_price' | 'invalid_price' | 'missing_currency' | 'currency_mismatch' };

export type MatchSignal = {
  code: string;
  detail?: string;
};

export type DuplicateAssessment = {
  relation: MatchRelation;
  confidence: number | null;
  signals: MatchSignal[];
  price: PriceComparison | null;
  algorithmVersion: typeof DUPLICATE_ALGORITHM_VERSION;
  matchedOfferId: string | null;
};
