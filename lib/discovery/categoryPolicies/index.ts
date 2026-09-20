import { CATEGORY_DISCOVERY_POLICIES } from './perfume';
import type {
  CategoryDiscoveryPolicy,
  CategoryPolicyScore,
  CategoryPolicyScoreInput,
} from './types';

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function findCategoryPolicy(
  category: string | null | undefined,
): CategoryDiscoveryPolicy | null {
  if (!category?.trim()) return null;
  const c = fold(category);
  return (
    CATEGORY_DISCOVERY_POLICIES.find((p) => p.categoryIds.some((id) => fold(id) === c)) ?? null
  );
}

/**
 * Soft ranking only — never hard-rejects.
 * Brand + discount mediocre → multiplier ≈ 1 (no boost).
 * Brand + strong discount in band → boost.
 */
export function scoreCategoryPolicy(input: CategoryPolicyScoreInput): CategoryPolicyScore {
  const policy = findCategoryPolicy(input.category);
  if (!policy) {
    return { policyId: null, multiplier: 1, matchedBrand: null, reasons: [] };
  }

  const title = fold(input.title ?? '');
  const brandHint = fold(input.brandHint ?? '');
  const hay = `${title} ${brandHint}`;

  const matchedBrand =
    policy.preferredBrands.find((b) => hay.includes(fold(b))) ?? null;
  const keywordHit = policy.preferredProductKeywords.some((k) => hay.includes(fold(k)));

  if (!matchedBrand && !keywordHit) {
    return { policyId: policy.id, multiplier: 1, matchedBrand: null, reasons: ['policy_no_match'] };
  }

  const reasons: string[] = [];
  let multiplier = 1;

  if (matchedBrand) {
    reasons.push(`brand:${matchedBrand}`);
    multiplier *= 1.15;
  } else if (keywordHit) {
    reasons.push('keyword_perfume');
    multiplier *= 1.05;
  }

  const disc = Number(input.discountPercent ?? 0);
  const minDisc = policy.preferredMinDiscountPercent ?? 0;
  if (disc < minDisc) {
    return {
      policyId: policy.id,
      multiplier: 1,
      matchedBrand,
      reasons: [...reasons, 'weak_discount_no_boost'],
    };
  }

  if (disc >= minDisc + 15) {
    reasons.push('strong_discount');
    multiplier *= 1.2;
  } else {
    reasons.push('ok_discount');
    multiplier *= 1.08;
  }

  const price = Number(input.price ?? 0);
  if (
    price > 0 &&
    policy.preferredPriceMin != null &&
    policy.preferredPriceMax != null &&
    price >= policy.preferredPriceMin &&
    price <= policy.preferredPriceMax
  ) {
    reasons.push('price_band');
    multiplier *= 1.05;
  }

  multiplier *= policy.noveltyPreference > 1 ? 1.02 : 1;

  return {
    policyId: policy.id,
    multiplier: Math.min(1.6, multiplier),
    matchedBrand,
    reasons,
  };
}

export { CATEGORY_DISCOVERY_POLICIES, PERFUME_DISCOVERY_POLICY } from './perfume';
