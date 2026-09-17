/**
 * Deal identity — exact / probable / unknown.
 * Never auto-merge probable without confidence + method + evidence.
 */

import { createHash } from 'node:crypto';
import {
  extractAmazonAsin,
  extractMercadoLibreItemId,
  offerUrlFingerprint,
} from '@/lib/offers/offerUrlFingerprint';
import type { DealIdentity, DealIdentityMatch, EvidenceReference } from './types';

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function buildExactIdentity(input: {
  merchant: string | null;
  merchantProductId?: string | null;
  asin?: string | null;
  mlItemId?: string | null;
  sku?: string | null;
  gtin?: string | null;
  canonicalUrl?: string | null;
  variantKey?: string | null;
  seller?: string | null;
  productFingerprint?: string | null;
}): DealIdentity {
  const asin = input.asin?.trim().toUpperCase() || null;
  const mlItemId = input.mlItemId?.trim().toUpperCase() || null;
  let fingerprint = input.productFingerprint?.trim() || null;
  if (!fingerprint) {
    if (asin) fingerprint = `amz:${asin}`;
    else if (mlItemId) fingerprint = `ml:${mlItemId}`;
  }
  return {
    identityStatus: 'exact',
    merchant: input.merchant,
    merchantProductId: input.merchantProductId ?? asin ?? mlItemId,
    asin,
    mlItemId,
    sku: input.sku ?? null,
    gtin: input.gtin ?? null,
    canonicalUrl: input.canonicalUrl ?? null,
    variantKey: input.variantKey ?? null,
    seller: input.seller ?? null,
    productFingerprint: fingerprint,
    probableMatch: null,
  };
}

export function buildProbableIdentity(input: {
  merchant: string | null;
  confidence: number;
  matchMethod: string;
  evidence: EvidenceReference[];
  gtin?: string | null;
  canonicalUrl?: string | null;
  sku?: string | null;
  variantKey?: string | null;
  seller?: string | null;
  productFingerprint?: string | null;
}): DealIdentity {
  const confidence = clampConfidence(input.confidence);
  const match: DealIdentityMatch = {
    status: 'probable',
    confidence,
    matchMethod: input.matchMethod,
    evidence: input.evidence,
  };
  // Probable never upgrades to exact here — caller must keep status probable.
  if (confidence < 0.5 || input.evidence.length === 0) {
    return buildUnknownIdentity({
      merchant: input.merchant,
      canonicalUrl: input.canonicalUrl,
      seller: input.seller,
      productFingerprint: input.productFingerprint,
    });
  }
  return {
    identityStatus: 'probable',
    merchant: input.merchant,
    merchantProductId: null,
    asin: null,
    mlItemId: null,
    sku: input.sku ?? null,
    gtin: input.gtin ?? null,
    canonicalUrl: input.canonicalUrl ?? null,
    variantKey: input.variantKey ?? null,
    seller: input.seller ?? null,
    productFingerprint: input.productFingerprint ?? null,
    probableMatch: match,
  };
}

export function buildUnknownIdentity(input?: {
  merchant?: string | null;
  canonicalUrl?: string | null;
  seller?: string | null;
  productFingerprint?: string | null;
  variantKey?: string | null;
}): DealIdentity {
  return {
    identityStatus: 'unknown',
    merchant: input?.merchant ?? null,
    merchantProductId: null,
    asin: null,
    mlItemId: null,
    sku: null,
    gtin: null,
    canonicalUrl: input?.canonicalUrl ?? null,
    variantKey: input?.variantKey ?? null,
    seller: input?.seller ?? null,
    productFingerprint: input?.productFingerprint ?? null,
    probableMatch: null,
  };
}

/** Resolve identity from URL / fingerprint — exact for amz/ml strong IDs only. */
export function resolveIdentityFromUrl(input: {
  url: string;
  merchant?: string | null;
  seller?: string | null;
  variantKey?: string | null;
}): DealIdentity {
  const url = input.url.trim();
  const asin = extractAmazonAsin(url);
  if (asin) {
    return buildExactIdentity({
      merchant: input.merchant ?? 'amazon',
      asin,
      canonicalUrl: url,
      seller: input.seller ?? null,
      variantKey: input.variantKey ?? null,
      productFingerprint: `amz:${asin}`,
    });
  }
  const ml = extractMercadoLibreItemId(url);
  if (ml) {
    return buildExactIdentity({
      merchant: input.merchant ?? 'mercadolibre',
      mlItemId: ml,
      canonicalUrl: url,
      seller: input.seller ?? null,
      variantKey: input.variantKey ?? null,
      productFingerprint: `ml:${ml}`,
    });
  }
  const fp = offerUrlFingerprint(url);
  if (fp?.startsWith('amz:') || fp?.startsWith('ml:')) {
    const id = fp.slice(4);
    if (fp.startsWith('amz:')) {
      return buildExactIdentity({
        merchant: input.merchant ?? 'amazon',
        asin: id,
        canonicalUrl: url,
        seller: input.seller ?? null,
        variantKey: input.variantKey ?? null,
        productFingerprint: fp,
      });
    }
    return buildExactIdentity({
      merchant: input.merchant ?? 'mercadolibre',
      mlItemId: id,
      canonicalUrl: url,
      seller: input.seller ?? null,
      variantKey: input.variantKey ?? null,
      productFingerprint: fp,
    });
  }
  return buildUnknownIdentity({
    merchant: input.merchant ?? null,
    canonicalUrl: url,
    seller: input.seller ?? null,
    productFingerprint: fp,
    variantKey: input.variantKey ?? null,
  });
}

export function identitiesCompatibleForObservation(
  a: DealIdentity,
  b: DealIdentity,
): { ok: boolean; reason: string | null } {
  if (a.variantKey && b.variantKey && a.variantKey !== b.variantKey) {
    return { ok: false, reason: 'variant_mismatch' };
  }
  if (
    a.identityStatus === 'exact' &&
    b.identityStatus === 'exact' &&
    a.productFingerprint &&
    b.productFingerprint &&
    a.productFingerprint !== b.productFingerprint
  ) {
    return { ok: false, reason: 'fingerprint_mismatch' };
  }
  return { ok: true, reason: null };
}

export function hashStable(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}
