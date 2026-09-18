import { normalizeCategoryForStorage } from '@/lib/categories';
import { offerHasCouponSignal } from './eligibility';
import type { DistributionDestinationRow, DistributionOfferSnapshot } from './types';

/**
 * Configuration-driven routing: which ENABLED destinations are eligible.
 * Does NOT publish. Does NOT call providers. Does NOT create rows.
 *
 * Conceptual mapping (via destination.kind + category_ids):
 * - kind=general → every distributable offer
 * - kind=category + category_ids includes offer.category → match
 * - kind=coupons → when offer has coupons / bank_coupon
 *
 * Example once destinations are seeded:
 * tecnologia → general + technology vertical
 * hogar → general + home vertical
 * coupons signal → general + coupons
 */
export function resolveEligibleDestinations(input: {
  offer: Pick<DistributionOfferSnapshot, 'category' | 'coupons' | 'bank_coupon'>;
  destinations: DistributionDestinationRow[];
}): DistributionDestinationRow[] {
  const active = input.destinations.filter((d) => d.status === 'active');
  if (active.length === 0) return [];

  const normalizedCategory = normalizeCategoryForStorage(input.offer.category);
  const hasCoupon = offerHasCouponSignal(input.offer);
  const out: DistributionDestinationRow[] = [];
  const seen = new Set<string>();

  for (const dest of active) {
    let eligible = false;
    if (dest.kind === 'general') {
      eligible = true;
    } else if (dest.kind === 'category') {
      if (normalizedCategory) {
        const ids = (dest.category_ids ?? []).map((c) =>
          normalizeCategoryForStorage(c),
        );
        eligible = ids.includes(normalizedCategory);
      }
    } else if (dest.kind === 'coupons') {
      eligible = hasCoupon;
    }

    if (eligible && !seen.has(dest.id)) {
      seen.add(dest.id);
      out.push(dest);
    }
  }

  return out;
}
