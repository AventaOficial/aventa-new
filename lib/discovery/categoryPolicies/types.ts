export type CategoryDiscoveryPolicy = {
  id: string;
  /** CategoryId canónico o 'belleza' para perfumería. */
  categoryIds: readonly string[];
  preferredBrands: readonly string[];
  preferredProductKeywords: readonly string[];
  /** Soft: boost when discount ≥ this (uses existing ingest min as floor). */
  preferredMinDiscountPercent: number | null;
  /** Soft price band hints; null = no band. */
  preferredPriceMin: number | null;
  preferredPriceMax: number | null;
  noveltyPreference: number;
  notes?: string;
};

export type CategoryPolicyScoreInput = {
  title: string;
  category?: string | null;
  discountPercent?: number | null;
  price?: number | null;
  brandHint?: string | null;
};

export type CategoryPolicyScore = {
  policyId: string | null;
  multiplier: number;
  matchedBrand: string | null;
  reasons: string[];
};
