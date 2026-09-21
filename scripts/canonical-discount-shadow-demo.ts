import {
  buildDiscountTruthShadow,
  getDiscountTruthMetrics,
  recordDiscountTruthShadow,
  resetDiscountTruthMetrics,
  resolveCanonicalDiscount,
} from '../lib/bots/ingest/canonicalDiscount';

resetDiscountTruthMetrics();

const cases = [
  { sale: 699, original: 1999, supplied: 0, title: 'Freidora SIGNA 5L' },
  { sale: 1899, original: 2855.71, supplied: 0, title: 'Smart TV 32 TFL' },
  { sale: 1949, original: 3465.81, supplied: 0, title: 'Smart TV 32 Cuory' },
  { sale: 5113, original: 8499, supplied: 0, title: 'Aiwa Roku 50' },
  { sale: 154.24, original: 237.3, supplied: 0, title: 'Audífonos IP55' },
  { sale: 100, original: 110, supplied: 9, title: 'REAL_LOW control' },
  { sale: 150, original: null as number | null, supplied: 0, title: 'UNKNOWN control' },
];

const rows = [];
for (const c of cases) {
  const after = resolveCanonicalDiscount({
    salePrice: c.sale,
    originalPrice: c.original,
    suppliedDiscountPercentage: c.supplied,
  });
  const shadow = buildDiscountTruthShadow({
    before: { discountPercentage: c.supplied, discountClass: null },
    after,
  });
  recordDiscountTruthShadow(shadow);
  rows.push({
    title: c.title,
    sale: c.sale,
    original: c.original,
    existing: shadow.existingDiscountPercentage,
    computed: shadow.computedDiscountPercentage,
    delta: shadow.delta,
    falseZero: shadow.falseZero,
    status: shadow.calculationStatus,
    classAfter: shadow.discountClassAfter,
    source: shadow.discountSource,
  });
}

console.log(JSON.stringify({ rows, metrics: getDiscountTruthMetrics() }, null, 2));
