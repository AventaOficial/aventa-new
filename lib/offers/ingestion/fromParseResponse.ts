import { mergeDiscoveryWithEnrichment } from '@/lib/offers/ingestion/mergeFields';
import { evaluateOfferQuality } from '@/lib/offers/ingestion/qualityGate';
import type { DiscoveryOfferInput, EnrichmentSnapshot } from '@/lib/offers/ingestion/types';
import { processOfferUrl } from '@/lib/offers/ingestion/urlPipeline';

/** Map /api/parse-offer-url JSON into enrichment snapshot. */
export function enrichmentFromParseResponse(data: Record<string, unknown>): EnrichmentSnapshot {
  const images = Array.isArray(data.images)
    ? data.images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const image = typeof data.image === 'string' ? data.image : images[0] ?? null;
  return {
    title: typeof data.title === 'string' ? data.title : null,
    image,
    images,
    store: typeof data.store === 'string' ? data.store : null,
    price: typeof data.suggested_discount_price === 'number' ? data.suggested_discount_price : null,
    originalPrice: typeof data.suggested_original_price === 'number' ? data.suggested_original_price : null,
    category: typeof data.suggested_category === 'string' ? data.suggested_category : null,
    extractionStatus:
      data.extraction_status === 'success' ||
      data.extraction_status === 'partial' ||
      data.extraction_status === 'failed'
        ? data.extraction_status
        : null,
    missing: Array.isArray(data.missing)
      ? data.missing.filter((item): item is string => typeof item === 'string')
      : [],
    source: 'json_ld',
    observedAt: new Date().toISOString(),
  };
}

export function buildLotRowFromDiscoveryAndParse(input: {
  discovery: DiscoveryOfferInput;
  parseData: Record<string, unknown> | null;
  pdpAttempted: boolean;
}) {
  const url = processOfferUrl(input.discovery.rawUrl, input.discovery.store);
  const enrichment = input.parseData
    ? enrichmentFromParseResponse(input.parseData)
    : { source: 'unknown' as const };
  const merged = mergeDiscoveryWithEnrichment(input.discovery, enrichment);
  const quality = evaluateOfferQuality({
    url,
    title: merged.title.value,
    image: merged.image.value,
    price: merged.price.value,
    store: merged.store.value ?? url.store,
    extractionStatus: merged.extractionStatus,
    conflicts: merged.conflicts,
    pdpAttempted: input.pdpAttempted,
  });
  return { url, merged, quality };
}
