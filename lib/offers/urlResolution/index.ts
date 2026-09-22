import {
  isAmazonExpandableHost,
  isCoppelExpandableHost,
  isElektraExpandableHost,
  isLiverpoolExpandableHost,
  isOfferAmazonHost,
  isOfferCoppelHost,
  isOfferElektraHost,
  isOfferLiverpoolHost,
  isOfferMercadoLibreHost,
  isOfferWalmartHost,
  isWalmartExpandableHost,
} from '@/lib/offers/commerceHostAllowlist';
import { normalizeOfferUrl } from './normalizeOfferUrl';
import { resolveAmazonOfferUrl } from './amazonResolver';
import { resolveMercadoLibreOfferUrl } from './mercadoLibreResolver';
import { resolveWalmartOfferUrl } from './walmartResolver';
import { resolveLiverpoolOfferUrl } from './liverpoolResolver';
import { resolveCoppelOfferUrl } from './coppelResolver';
import { resolveElektraOfferUrl } from './elektraResolver';
import type { OfferUrlProvider, OfferUrlResolveResult } from './types';

function detectProvider(url: string): OfferUrlProvider {
  try {
    const h = new URL(url).hostname;
    if (isOfferMercadoLibreHost(h)) return 'mercado_libre';
    if (isOfferAmazonHost(h) || isAmazonExpandableHost(h)) return 'amazon';
    if (isOfferWalmartHost(h) || isWalmartExpandableHost(h)) return 'walmart';
    if (isOfferLiverpoolHost(h) || isLiverpoolExpandableHost(h)) return 'liverpool';
    if (isOfferCoppelHost(h) || isCoppelExpandableHost(h)) return 'coppel';
    if (isOfferElektraHost(h) || isElektraExpandableHost(h)) return 'elektra';
  } catch {
    /* fallthrough */
  }
  const lower = url.toLowerCase();
  if (lower.includes('mercadolibre') || lower.includes('meli.la')) return 'mercado_libre';
  if (
    lower.includes('amazon.') ||
    lower.includes('a.co') ||
    lower.includes('amzn.to') ||
    lower.includes('link.amazon')
  ) {
    return 'amazon';
  }
  if (lower.includes('walmart.')) return 'walmart';
  if (lower.includes('liverpool.')) return 'liverpool';
  if (lower.includes('coppel.')) return 'coppel';
  if (lower.includes('elektra.')) return 'elektra';
  return 'unknown';
}

/**
 * Provider-agnostic Offer URL resolver.
 * Coordinates retailer resolvers; does not invent identity.
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

  const provider =
    detectProvider(inputUrl) !== 'unknown' ? detectProvider(inputUrl) : detectProvider(rawUrl);

  if (provider === 'amazon') return resolveAmazonOfferUrl(rawUrl);
  if (provider === 'mercado_libre') return resolveMercadoLibreOfferUrl(rawUrl);
  if (provider === 'walmart') return resolveWalmartOfferUrl(rawUrl);
  if (provider === 'liverpool') return resolveLiverpoolOfferUrl(rawUrl);
  if (provider === 'coppel') return resolveCoppelOfferUrl(rawUrl);
  if (provider === 'elektra') return resolveElektraOfferUrl(rawUrl);

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
export { resolveWalmartOfferUrl, extractWalmartItemId } from './walmartResolver';
export { resolveLiverpoolOfferUrl, extractLiverpoolProductId } from './liverpoolResolver';
export { resolveCoppelOfferUrl, extractCoppelProductId } from './coppelResolver';
export { resolveElektraOfferUrl, extractElektraProductId } from './elektraResolver';
export { isAmazonExpandableHost } from '@/lib/offers/commerceHostAllowlist';
