/**
 * Discovery Experiment metrics — FACT / DERIVED only. No gates.
 */

export function productIdentityKey(input: {
  productFingerprint?: string | null;
  productIdentifier?: string | null;
  canonicalUrl?: string | null;
}): string | null {
  const fp = input.productFingerprint?.trim();
  if (fp) return fp;
  const id = input.productIdentifier?.trim();
  if (id) return id;
  const url = input.canonicalUrl?.trim().toLowerCase();
  if (url) return url;
  return null;
}

export function computeNovelProductRate(input: {
  runIdentities: readonly string[];
  historicalIdentities: ReadonlySet<string>;
}): {
  uniqueIdentities: number;
  novelIdentities: number;
  repeatedIdentities: number;
  novelProductRate: number | null;
} {
  const unique = [...new Set(input.runIdentities.filter(Boolean))];
  let novel = 0;
  for (const id of unique) {
    if (!input.historicalIdentities.has(id)) novel += 1;
  }
  const repeated = unique.length - novel;
  return {
    uniqueIdentities: unique.length,
    novelIdentities: novel,
    repeatedIdentities: repeated,
    novelProductRate: unique.length === 0 ? null : novel / unique.length,
  };
}

/** Jaccard similarity of two identity sets (0..1). Higher = more overlap / stickier. */
export function jaccardOverlap(
  a: ReadonlySet<string> | readonly string[],
  b: ReadonlySet<string> | readonly string[],
): number | null {
  const A = a instanceof Set ? a : new Set([...a].filter(Boolean));
  const B = b instanceof Set ? b : new Set([...b].filter(Boolean));
  if (A.size === 0 && B.size === 0) return null;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? null : inter / union;
}

export function repeatRate(discovered: number, unique: number): number | null {
  if (discovered <= 0) return null;
  return 1 - unique / discovered;
}
