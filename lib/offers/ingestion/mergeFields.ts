import { canonicalAvailability, recalculatedDiscount } from '@/lib/offers/ingestion/pdpFacts';
import type {
  DiscoveryOfferInput,
  EnrichmentSnapshot,
  FieldEvidence,
  FieldSource,
  MergedField,
} from '@/lib/offers/ingestion/types';
import { isHighConfidenceJunkImage } from '@/lib/offers/selectOfferImages';

function evidence<T>(
  field: string,
  value: T,
  source: FieldSource,
  confidence: number,
  observedAt: string,
  reason?: string | null,
): FieldEvidence<T> {
  return { field, value, source, observedAt, confidence, reason: reason ?? null };
}

function mergeScalar<T extends string | number | null>(input: {
  field: string;
  discovery: T;
  enrichment: T;
  discoverySource: FieldSource;
  enrichmentSource: FieldSource;
  observedAt: string;
  equals?: (a: T, b: T) => boolean;
}): MergedField<T> {
  const eq = input.equals ?? ((a, b) => a === b);
  const discoveryEmpty =
    input.discovery == null || input.discovery === '' || (typeof input.discovery === 'number' && !Number.isFinite(input.discovery));
  const enrichmentEmpty =
    input.enrichment == null || input.enrichment === '' || (typeof input.enrichment === 'number' && !Number.isFinite(input.enrichment));

  const list: FieldEvidence<T>[] = [];
  if (!discoveryEmpty) {
    list.push(
      evidence(input.field, input.discovery, input.discoverySource, 0.55, input.observedAt, 'discovery'),
    );
  }
  if (!enrichmentEmpty) {
    list.push(
      evidence(input.field, input.enrichment, input.enrichmentSource, 0.8, input.observedAt, 'pdp'),
    );
  }

  if (discoveryEmpty && enrichmentEmpty) {
    return {
      value: null as T,
      source: null,
      conflict: false,
      discoveryValue: input.discovery,
      enrichmentValue: input.enrichment,
      evidence: list,
    };
  }
  if (discoveryEmpty) {
    return {
      value: input.enrichment,
      source: input.enrichmentSource,
      conflict: false,
      discoveryValue: input.discovery,
      enrichmentValue: input.enrichment,
      evidence: list,
    };
  }
  if (enrichmentEmpty) {
    return {
      value: input.discovery,
      source: input.discoverySource,
      conflict: false,
      discoveryValue: input.discovery,
      enrichmentValue: input.enrichment,
      evidence: list,
    };
  }
  if (eq(input.discovery, input.enrichment)) {
    return {
      value: input.enrichment,
      source: input.enrichmentSource,
      conflict: false,
      discoveryValue: input.discovery,
      enrichmentValue: input.enrichment,
      evidence: list,
    };
  }
  // Conflict: PDP/enrichment is the canonical value. Both sides stay on the field.
  return {
    value: input.enrichment,
    source: input.enrichmentSource,
    conflict: true,
    discoveryValue: input.discovery,
    enrichmentValue: input.enrichment,
    evidence: list,
  };
}

function priceClose(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) < 0.01;
}

const SOURCE_STRENGTH: Record<FieldSource, number> = {
  json_ld: 0.9,
  retailer_api: 0.88,
  open_graph: 0.7,
  dom: 0.55,
  hunter: 0.55,
  paste: 0.5,
  url_resolver: 0.4,
  unknown: 0.2,
};

/** Prefer higher-confidence evidence; equal confidence keeps current (idempotent). */
export function preferStrongerEvidence<T>(
  current: FieldEvidence<T> | null,
  incoming: FieldEvidence<T>,
): FieldEvidence<T> {
  if (!current) return incoming;
  const currentScore = current.confidence || SOURCE_STRENGTH[current.source] || 0;
  const incomingScore = incoming.confidence || SOURCE_STRENGTH[incoming.source] || 0;
  if (incomingScore > currentScore) return incoming;
  return current;
}

function usableProductImage(url: string | null | undefined): string | null {
  const t = url?.trim() ?? '';
  if (!t) return null;
  let parsed: URL;
  try {
    parsed = new URL(t);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (isHighConfidenceJunkImage(t)) return null;
  return t;
}

function formatMergeConflicts(fields: {
  title: MergedField<string | null>;
  price: MergedField<number | null>;
  originalPrice: MergedField<number | null>;
  image: MergedField<string | null>;
  seller: MergedField<string | null>;
}): string {
  const lines: string[] = [];
  if (fields.price.conflict) {
    lines.push(`Precio: Hunter ${fields.price.discoveryValue} · PDP ${fields.price.enrichmentValue} · Usado ${fields.price.value}`);
  }
  if (fields.originalPrice.conflict) {
    lines.push(`Anterior: Hunter ${fields.originalPrice.discoveryValue} · PDP ${fields.originalPrice.enrichmentValue} · Usado ${fields.originalPrice.value}`);
  }
  if (fields.title.conflict) lines.push('Título distinto entre Hunter y PDP. Usado: PDP.');
  if (fields.image.conflict) lines.push('Imagen distinta entre Hunter y PDP. Usada: PDP.');
  if (fields.seller.conflict) {
    lines.push(`Seller: Hunter ${fields.seller.discoveryValue} · PDP ${fields.seller.enrichmentValue} · Usado ${fields.seller.value}`);
  }
  return lines.join(' ');
}

/** Merge hunter/paste discovery with PDP enrichment. PDP wins conflicts; both values stay. */
export function mergeDiscoveryWithEnrichment(
  discovery: DiscoveryOfferInput,
  enrichment: EnrichmentSnapshot,
  nowIso = new Date().toISOString(),
) {
  const discoverySource = discovery.source ?? 'hunter';
  const enrichmentSource = enrichment.source ?? 'json_ld';

  const title = mergeScalar({
    field: 'title',
    discovery: discovery.title?.trim() || null,
    enrichment: enrichment.title?.trim() || null,
    discoverySource,
    enrichmentSource,
    observedAt: nowIso,
  });
  const store = mergeScalar({
    field: 'store',
    discovery: discovery.store?.trim() || null,
    enrichment: enrichment.store?.trim() || null,
    discoverySource,
    enrichmentSource,
    observedAt: nowIso,
  });
  const price = mergeScalar({
    field: 'price',
    discovery: discovery.price ?? null,
    enrichment: enrichment.price ?? null,
    discoverySource,
    enrichmentSource,
    observedAt: nowIso,
    equals: priceClose,
  });
  const originalPrice = mergeScalar({
    field: 'originalPrice',
    discovery: discovery.originalPrice ?? null,
    enrichment: enrichment.originalPrice ?? null,
    discoverySource,
    enrichmentSource,
    observedAt: nowIso,
    equals: priceClose,
  });
  const image = mergeScalar({
    field: 'image',
    discovery: usableProductImage(discovery.image),
    enrichment: usableProductImage(enrichment.image),
    discoverySource,
    enrichmentSource,
    observedAt: nowIso,
  });
  const seller = mergeScalar({
    field: 'seller',
    discovery: discovery.seller?.trim() || null,
    enrichment: enrichment.seller?.trim() || null,
    discoverySource,
    enrichmentSource,
    observedAt: nowIso,
  });
  const availability = mergeScalar({
    field: 'availability',
    discovery: canonicalAvailability(discovery.availability),
    enrichment: canonicalAvailability(enrichment.availability),
    discoverySource,
    enrichmentSource,
    observedAt: nowIso,
  });
  const brand = mergeScalar({
    field: 'brand',
    discovery: discovery.brand?.trim() || null,
    enrichment: enrichment.brand?.trim() || null,
    discoverySource,
    enrichmentSource,
    observedAt: nowIso,
  });

  return {
    title,
    store,
    price,
    originalPrice,
    image,
    seller,
    availability,
    brand,
    rating: enrichment.rating ?? null,
    reviewCount: enrichment.reviewCount ?? null,
    discount: recalculatedDiscount(price.value, originalPrice.value),
    conflictNote: formatMergeConflicts({ title, price, originalPrice, image, seller }),
    images: enrichment.images ?? (image.value ? [String(image.value)] : []),
    category: enrichment.category ?? null,
    extractionStatus: enrichment.extractionStatus ?? null,
    missing: enrichment.missing ?? [],
    conflicts: [title, store, price, originalPrice, image, seller, availability, brand]
      .filter((field) => field.conflict)
      .map((field) => field.evidence[0]?.field ?? 'field'),
  };
}
