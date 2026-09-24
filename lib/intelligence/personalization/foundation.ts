/**
 * Segment affinity from interactions the caller already has.
 * No user id, no sensitive inference, and this does not reorder the live feed.
 */

export type PersonalizationFoundation = {
  categories: { key: string; weight: number }[];
  retailers: { key: string; weight: number }[];
  negativeRetailers: string[];
  priceBand: { p25: number; p75: number } | null;
  appliedToFeed: false;
  storesSensitiveAttributes: false;
};

function weights(rows: { key: string; positive: number; negative: number }[]): { key: string; weight: number }[] {
  return rows
    .filter((row) => row.positive + row.negative > 0)
    .map((row) => ({
      key: row.key,
      weight: Math.round((row.positive / (row.positive + row.negative)) * 1000) / 1000,
    }))
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
    .slice(0, 12);
}

export function buildPersonalizationFoundation(
  interactions: {
    category: string | null;
    retailer: string | null;
    price: number | null;
    negative: boolean;
  }[],
): PersonalizationFoundation {
  const bounded = interactions.slice(0, 100);
  const categories = new Map<string, { positive: number; negative: number }>();
  const retailers = new Map<string, { positive: number; negative: number }>();
  const prices: number[] = [];

  for (const row of bounded) {
    const bump = (map: Map<string, { positive: number; negative: number }>, key: string | null) => {
      const name = key?.trim().toLowerCase();
      if (!name) return;
      const current = map.get(name) ?? { positive: 0, negative: 0 };
      if (row.negative) current.negative += 1;
      else current.positive += 1;
      map.set(name, current);
    };
    bump(categories, row.category);
    bump(retailers, row.retailer);
    if (!row.negative && row.price != null && Number.isFinite(row.price) && row.price > 0) prices.push(row.price);
  }

  prices.sort((a, b) => a - b);
  const priceBand =
    prices.length >= 4
      ? {
          p25: prices[Math.floor((prices.length - 1) * 0.25)] ?? prices[0]!,
          p75: prices[Math.floor((prices.length - 1) * 0.75)] ?? prices[prices.length - 1]!,
        }
      : null;

  const retailerRows = [...retailers.entries()].map(([key, counts]) => ({ key, ...counts }));
  return {
    categories: weights([...categories.entries()].map(([key, counts]) => ({ key, ...counts }))),
    retailers: weights(retailerRows),
    negativeRetailers: retailerRows
      .filter((row) => row.negative > row.positive && row.negative >= 2)
      .map((row) => row.key)
      .sort(),
    priceBand,
    appliedToFeed: false,
    storesSensitiveAttributes: false,
  };
}
