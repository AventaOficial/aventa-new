/**
 * Enriquece un candidato de máquina antes de crear la oferta pending.
 * Usa el extractor único. No crea lotes, no publica y no toca dinero.
 */
import type { OfferExtractionOutcome } from '@/lib/offers/offerExtraction/extractOfferFromUrl';
import { extractOfferFromUrl } from '@/lib/offers/offerExtraction/extractOfferFromUrl';
import { classifyOfferPageKind, type OfferPageKind } from '@/lib/offers/retailerProductUrl';
import { mexicanRetailerCurrency } from '@/lib/offers/sourceCurrency';
import { isValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import { recordHunterEnrichment } from '@/lib/hunter/enrichment/metrics';
import { evaluateBatchExtraction } from '@/lib/offers/batch/contract';

export type ImageFailureCode =
  | 'IMAGE_NOT_FOUND'
  | 'IMAGE_FETCH_FAILED'
  | 'IMAGE_INVALID'
  | 'IMAGE_BLOCKED'
  | 'NO_PRODUCT_IMAGE_SOURCE'
  | 'RETAILER_UNSUPPORTED';

export type PreparedMachineCandidate = {
  pageKind: OfferPageKind;
  product: boolean;
  title: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  store: string | null;
  price: number | null;
  originalPrice: number | null;
  category: string | null;
  currency: string | null;
  retailer: string | null;
  imageFailure: ImageFailureCode | null;
  fetched: boolean;
};

function imageFailureOf(outcome: OfferExtractionOutcome, images: string[]): ImageFailureCode | null {
  if (images.length > 0) return null;
  const access = outcome.body.diagnostics?.accessFailure;
  if (access === 'ACCESS_BLOCKED' || outcome.adapter.blockedByHostPolicy) return 'IMAGE_BLOCKED';
  if (access === 'TIMEOUT') return 'IMAGE_FETCH_FAILED';
  const code = outcome.body.diagnostics?.extractionErrorCode;
  if (code === 'RETAILER_NOT_SUPPORTED') return 'RETAILER_UNSUPPORTED';
  if (code === 'IMAGE_EXTRACTION_FAILED') return 'IMAGE_NOT_FOUND';
  const raw = outcome.body.images ?? [];
  if (raw.length > 0) return 'IMAGE_INVALID';
  return 'IMAGE_NOT_FOUND';
}

/** La moderación solo recibe título, precio e imagen ya extraídos. */
export function machineOfferReadyForModeration(prepared: PreparedMachineCandidate): boolean {
  const images = prepared.imageUrl ? [prepared.imageUrl, ...prepared.imageUrls] : [];
  const evaluation = evaluateBatchExtraction({
    extractionStatus: images.length > 0 && prepared.title && prepared.price != null ? 'success' : 'partial',
    title: prepared.title,
    images,
    price: prepared.price,
    originalPrice: prepared.originalPrice,
    provider: prepared.retailer ?? 'unknown',
    identityConfidence: prepared.retailer && prepared.retailer !== 'unknown' ? 'high' : 'low',
    hasIdentity: Boolean(prepared.retailer && prepared.retailer !== 'unknown'),
    blockedByHostPolicy: prepared.imageFailure === 'IMAGE_BLOCKED',
    invalidUrl: !prepared.product,
    hintPrice: null,
    hintOriginalPrice: null,
    duplicate: null,
    storeHasAffiliate: true,
  });
  return (
    prepared.product &&
    evaluation.status !== 'ERROR' &&
    Boolean(prepared.title?.trim()) &&
    prepared.price != null &&
    prepared.price > 0 &&
    images.length > 0
  );
}

export async function prepareMachineCandidateOffer(
  url: string,
  extract: (input: string) => Promise<OfferExtractionOutcome> = extractOfferFromUrl,
): Promise<PreparedMachineCandidate> {
  const pageKind = classifyOfferPageKind(url);
  const currency = mexicanRetailerCurrency(url);
  if (pageKind !== 'PRODUCT') {
    recordHunterEnrichment({
      source: 'mcp:hunter',
      changed: false,
      skippedNetwork: true,
      imageFound: false,
      titleFound: false,
      priceFound: false,
      failed: true,
      fullyComplete: false,
    });
    return {
      pageKind,
      product: false,
      title: null,
      imageUrl: null,
      imageUrls: [],
      store: null,
      price: null,
      originalPrice: null,
      category: null,
      currency,
      retailer: null,
      imageFailure: 'NO_PRODUCT_IMAGE_SOURCE',
      fetched: false,
    };
  }

  const outcome = await extract(url);
  const images = (outcome.body.images ?? []).map((value) => value.trim()).filter((value) => isValidOfferImage(value));
  const imageFailure = imageFailureOf(outcome, images);
  const price = outcome.body.suggested_discount_price;
  recordHunterEnrichment({
    source: 'mcp:hunter',
    changed: images.length > 0,
    skippedNetwork: false,
    imageFound: images.length > 0,
    titleFound: Boolean(outcome.body.title?.trim()),
    priceFound: price != null && Number.isFinite(price) && price > 0,
    failed: imageFailure != null && outcome.body.extraction_status === 'failed',
    fullyComplete: images.length > 0 && price != null && Boolean(outcome.body.title?.trim()),
  });
  return {
    pageKind,
    product: true,
    title: outcome.body.title,
    imageUrl: images[0] ?? null,
    imageUrls: images.slice(1),
    store: outcome.body.store,
    price,
    originalPrice: outcome.body.suggested_original_price,
    category: outcome.body.suggested_category,
    currency,
    retailer: outcome.adapter.provider ?? outcome.core?.provider ?? null,
    imageFailure,
    fetched: true,
  };
}
