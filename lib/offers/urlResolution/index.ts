import {
  isOfferAmazonHost,
  isOfferMercadoLibreHost,
} from '@/lib/offers/commerceHostAllowlist';
import { normalizeOfferUrl } from './normalizeOfferUrl';
import { resolveAmazonOfferUrl } from './amazonResolver';
import { resolveMercadoLibreOfferUrl } from './mercadoLibreResolver';
import type { OfferUrlResolveResult } from './types';

function detectProvider(url: string): 'amazon' | 'mercado_libre' | 'unknown' {
  try {
    const h = new URL(url).hostname;
    if (isOfferMercadoLibreHost(h)) return 'mercado_libre';
    if (isOfferAmazonHost(h)) return 'amazon';
  } catch {
    /* fallthrough */
  }
  const lower = url.toLowerCase();
  if (lower.includes('mercadolibre') || lower.includes('meli.la')) return 'mercado_libre';
  if (lower.includes('amazon.') || lower.includes('a.co') || lower.includes('amzn.to')) {
    return 'amazon';
  }
  return 'unknown';
}

/**
 * Provider-agnostic Offer URL resolver.
 * Coordinates Amazon + Mercado Libre resolvers; does not duplicate identity authorities.
 */
export async function resolveOfferUrl(rawUrl: string): Promise<OfferUrlResolveResult> {
  const inputUrl = normalizeOfferUrl(rawUrl) || rawUrl.trim();
  if (!inputUrl) {
    return {
      provider: 'unknown',
      canonicalUrl: '',
      productFingerprint: null,
      productIdentity: null,
      variantIdentity: null,
      resolvedUrl: null,
      confidence: 'low',
      provenance: ['empty_input'],
      inputUrl: '',
    };
  }

  const provider = detectProvider(inputUrl) !== 'unknown'
    ? detectProvider(inputUrl)
    : detectProvider(rawUrl);

  if (provider === 'amazon') {
    return resolveAmazonOfferUrl(rawUrl);
  }
  if (provider === 'mercado_libre') {
    return resolveMercadoLibreOfferUrl(rawUrl);
  }

  return {
    provider: 'unknown',
    canonicalUrl: inputUrl,
    productFingerprint: null,
    productIdentity: null,
    variantIdentity: null,
    resolvedUrl: null,
    confidence: 'low',
    provenance: ['unsupported_provider'],
    inputUrl,
  };
}

export { normalizeOfferUrl } from './normalizeOfferUrl';
export { classifyOfferUrlQueryParam, shouldDropQueryParam } from './classifyQueryParam';
export type { OfferUrlResolveResult, OfferUrlProvider, QueryParamClass } from './types';
export { resolveAmazonOfferUrl } from './amazonResolver';
export { resolveMercadoLibreOfferUrl } from './mercadoLibreResolver';
