/**
 * Hechos comerciales del Product JSON-LD cuyo identificador es el ya resuelto.
 * Un producto vecino de la misma página no aporta marca, vendedor ni reseñas.
 */

export type VerifiedCommercialFacts = {
  seller: string | null;
  brand: string | null;
  rating: number | null;
  reviewCount: number | null;
  availability: string | null;
  category: string | null;
};

export const EMPTY_COMMERCIAL_FACTS: VerifiedCommercialFacts = {
  seller: null,
  brand: null,
  rating: null,
  reviewCount: null,
  availability: null,
  category: null,
};

function positiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/** Valoración solo si es un número dentro de la escala declarada, o de 5 si no hay escala. */
export function acceptedRating(value: unknown, bestRating?: unknown): number | null {
  const rating = positiveNumber(value);
  if (rating == null) return null;
  const best = positiveNumber(bestRating);
  const ceiling = best != null && best >= 1 && best <= 10 ? best : 5;
  if (rating > ceiling) return null;
  return Math.round(rating * 100) / 100;
}

/** Conteo entero positivo. Cero, fracciones y texto no cuentan como reseñas verificadas. */
export function acceptedReviewCount(value: unknown): number | null {
  const count = positiveNumber(value);
  if (count == null) return null;
  const rounded = Math.round(count);
  if (Math.abs(count - rounded) > 0.001 || rounded < 1 || rounded > 50_000_000) return null;
  return rounded;
}

function cleanName(value: unknown, max: number): string | null {
  if (value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string') {
    return cleanName((value as { name: string }).name, max);
  }
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  if (!name || name.length > max) return null;
  return name;
}

function normId(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function idFrom(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return normId(value);
  if (typeof value === 'number' && Number.isFinite(value)) return normId(String(Math.trunc(value)));
  return null;
}

function same(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => Boolean(value));
  if (present.length === 0) return null;
  return present.every((value) => value === present[0]) ? present[0] : null;
}

function sameNumber(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (present.length === 0) return null;
  return present.every((value) => value === present[0]) ? present[0] : null;
}

function sellerFromOffers(offers: unknown): string | null {
  const names: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = node as Record<string, unknown>;
    const name = cleanName(record.seller, 120);
    if (name) names.push(name);
    if (record.offers) visit(record.offers);
  };
  visit(offers);
  return same(names);
}

function availabilityFromOffers(offers: unknown): string | null {
  if (!offers || typeof offers !== 'object') return null;
  const record = Array.isArray(offers) ? (offers[0] as Record<string, unknown> | undefined) : (offers as Record<string, unknown>);
  const raw = record && typeof record.availability === 'string' ? record.availability : '';
  const leaf = raw.split('/').pop()?.trim() || '';
  return leaf ? cleanName(leaf, 40) : null;
}

function factsFromProduct(record: Record<string, unknown>): VerifiedCommercialFacts {
  const aggregate = record.aggregateRating;
  const ratingNode = aggregate && typeof aggregate === 'object' ? (aggregate as Record<string, unknown>) : null;
  return {
    seller: sellerFromOffers(record.offers),
    brand: cleanName(record.brand, 80),
    rating: ratingNode ? acceptedRating(ratingNode.ratingValue, ratingNode.bestRating) : null,
    reviewCount: ratingNode ? acceptedReviewCount(ratingNode.reviewCount ?? ratingNode.ratingCount) : null,
    availability: availabilityFromOffers(record.offers),
    category: typeof record.category === 'string' ? cleanName(record.category, 80) : null,
  };
}

function productMatches(record: Record<string, unknown>, wanted: string): boolean {
  const ids = [record.sku, record.mpn, record.gtin, record.productID, record.productId]
    .map(idFrom)
    .filter((id): id is string => Boolean(id));
  return ids.includes(wanted);
}

/** Solo el producto cuyo sku, mpn o gtin coincide con el id resuelto. */
export function verifiedCommercialFactsFromHtml(html: string, productId: string): VerifiedCommercialFacts {
  const wanted = normId(productId);
  if (!wanted) return EMPTY_COMMERCIAL_FACTS;
  const matches: VerifiedCommercialFacts[] = [];
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1] ?? '');
    } catch {
      continue;
    }
    const stack: unknown[] = [parsed];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        stack.push(...node);
        continue;
      }
      const record = node as Record<string, unknown>;
      if (record['@graph']) stack.push(record['@graph']);
      const typeValue = record['@type'];
      const typeName = Array.isArray(typeValue) ? typeValue.map(String).join(',') : String(typeValue ?? '');
      if (!typeName.includes('Product') || !productMatches(record, wanted)) continue;
      matches.push(factsFromProduct(record));
    }
  }
  if (matches.length === 0) return EMPTY_COMMERCIAL_FACTS;
  return {
    seller: same(matches.map((item) => item.seller)),
    brand: same(matches.map((item) => item.brand)),
    rating: sameNumber(matches.map((item) => item.rating)),
    reviewCount: sameNumber(matches.map((item) => item.reviewCount)),
    availability: same(matches.map((item) => item.availability)),
    category: same(matches.map((item) => item.category)),
  };
}
