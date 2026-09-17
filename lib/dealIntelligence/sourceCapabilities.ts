/**
 * Source capability matrix — SUPPORTED | UNSUPPORTED | UNKNOWN.
 * Never upgrade UNKNOWN → SUPPORTED without evidence.
 */

import type { HunterSource, HunterSourceId } from '@/lib/hunter/types';
import type { CapabilityStatus, DealSourceCapabilities, DealSourceCapabilityKey } from './types';

const ALL_KEYS: DealSourceCapabilityKey[] = [
  'productLookup',
  'priceObservation',
  'historicalPrice',
  'coupon',
  'promotion',
  'stock',
  'seller',
  'merchant',
  'affiliateLink',
  'attribution',
  'economicReporting',
  'api',
  'feed',
  'browser',
  'rateLimits',
  'authentication',
];

export function unknownCapabilities(): DealSourceCapabilities {
  return Object.fromEntries(ALL_KEYS.map((k) => [k, 'UNKNOWN'])) as DealSourceCapabilities;
}

function set(
  base: DealSourceCapabilities,
  patch: Partial<DealSourceCapabilities>,
): DealSourceCapabilities {
  return { ...base, ...patch };
}

/**
 * Declared capabilities by source id — conservative.
 * economicReporting stays UNSUPPORTED for Amazon/ML affiliate (confirmed research).
 */
export const SOURCE_CAPABILITY_REGISTRY: Partial<
  Record<HunterSourceId | 'community', DealSourceCapabilities>
> = {
  ml_api_legacy: set(unknownCapabilities(), {
    productLookup: 'SUPPORTED',
    priceObservation: 'SUPPORTED',
    historicalPrice: 'SUPPORTED', // via own Price Memory snapshots — not ML affiliate API
    coupon: 'UNKNOWN',
    promotion: 'UNKNOWN',
    stock: 'UNKNOWN',
    seller: 'UNKNOWN',
    merchant: 'SUPPORTED',
    affiliateLink: 'SUPPORTED',
    attribution: 'SUPPORTED', // click tagging path exists
    economicReporting: 'UNSUPPORTED',
    api: 'SUPPORTED',
    feed: 'UNSUPPORTED',
    browser: 'UNSUPPORTED',
    rateLimits: 'SUPPORTED',
    authentication: 'SUPPORTED',
  }),
  ml_worker: set(unknownCapabilities(), {
    productLookup: 'SUPPORTED',
    priceObservation: 'UNKNOWN', // discovery cards — weak price evidence
    historicalPrice: 'UNSUPPORTED',
    coupon: 'UNSUPPORTED',
    promotion: 'UNSUPPORTED',
    stock: 'UNKNOWN',
    seller: 'UNKNOWN',
    merchant: 'SUPPORTED',
    affiliateLink: 'SUPPORTED',
    attribution: 'SUPPORTED',
    economicReporting: 'UNSUPPORTED',
    api: 'UNSUPPORTED',
    feed: 'UNSUPPORTED',
    browser: 'SUPPORTED', // justified discovery-only worker
    rateLimits: 'SUPPORTED',
    authentication: 'UNKNOWN',
  }),
  amazon_paapi: set(unknownCapabilities(), {
    productLookup: 'SUPPORTED',
    priceObservation: 'SUPPORTED',
    historicalPrice: 'UNKNOWN', // Keepa may be OFF — do not claim SUPPORTED
    coupon: 'UNKNOWN',
    promotion: 'UNKNOWN',
    stock: 'UNKNOWN',
    seller: 'UNKNOWN',
    merchant: 'SUPPORTED',
    affiliateLink: 'SUPPORTED',
    attribution: 'SUPPORTED',
    economicReporting: 'UNSUPPORTED',
    api: 'SUPPORTED',
    feed: 'UNSUPPORTED',
    browser: 'UNSUPPORTED',
    rateLimits: 'SUPPORTED',
    authentication: 'SUPPORTED',
  }),
  amazon_asin: set(unknownCapabilities(), {
    productLookup: 'SUPPORTED',
    priceObservation: 'SUPPORTED',
    historicalPrice: 'UNKNOWN',
    coupon: 'UNKNOWN',
    promotion: 'UNKNOWN',
    stock: 'UNKNOWN',
    seller: 'UNKNOWN',
    merchant: 'SUPPORTED',
    affiliateLink: 'SUPPORTED',
    attribution: 'SUPPORTED',
    economicReporting: 'UNSUPPORTED',
    api: 'SUPPORTED',
    feed: 'UNSUPPORTED',
    browser: 'UNSUPPORTED',
    rateLimits: 'SUPPORTED',
    authentication: 'SUPPORTED',
  }),
  env_urls: set(unknownCapabilities(), {
    productLookup: 'UNKNOWN',
    priceObservation: 'UNKNOWN',
    historicalPrice: 'UNSUPPORTED',
    coupon: 'UNKNOWN',
    promotion: 'UNKNOWN',
    stock: 'UNKNOWN',
    seller: 'UNKNOWN',
    merchant: 'UNKNOWN',
    affiliateLink: 'UNKNOWN',
    attribution: 'SUPPORTED',
    economicReporting: 'UNSUPPORTED',
    api: 'UNSUPPORTED',
    feed: 'UNSUPPORTED',
    browser: 'UNSUPPORTED',
    rateLimits: 'UNKNOWN',
    authentication: 'UNSUPPORTED',
  }),
  community: set(unknownCapabilities(), {
    productLookup: 'UNKNOWN',
    priceObservation: 'UNKNOWN',
    historicalPrice: 'UNSUPPORTED',
    coupon: 'UNKNOWN',
    promotion: 'UNKNOWN',
    stock: 'UNKNOWN',
    seller: 'UNKNOWN',
    merchant: 'UNKNOWN',
    affiliateLink: 'UNKNOWN',
    attribution: 'SUPPORTED',
    economicReporting: 'UNSUPPORTED',
    api: 'UNSUPPORTED',
    feed: 'UNSUPPORTED',
    browser: 'UNSUPPORTED',
    rateLimits: 'UNKNOWN',
    authentication: 'UNSUPPORTED',
  }),
  walmart_mx: set(unknownCapabilities(), {
    productLookup: 'UNKNOWN',
    priceObservation: 'UNKNOWN',
    historicalPrice: 'UNKNOWN',
    coupon: 'UNKNOWN',
    promotion: 'UNKNOWN',
    economicReporting: 'UNSUPPORTED',
    api: 'UNKNOWN',
    feed: 'UNKNOWN',
    browser: 'UNKNOWN',
  }),
  bodega_aurrera_mx: set(unknownCapabilities(), {
    economicReporting: 'UNSUPPORTED',
  }),
  chedraui_mx: set(unknownCapabilities(), {
    economicReporting: 'UNSUPPORTED',
  }),
};

export function resolveDealSourceCapabilities(
  source: Pick<HunterSource, 'id' | 'capabilities' | 'dealCapabilities' | 'discoveryMethod' | 'affiliateStatus'> | {
    id: string;
    dealCapabilities?: DealSourceCapabilities;
  },
): DealSourceCapabilities {
  if (source.dealCapabilities) {
    return { ...unknownCapabilities(), ...source.dealCapabilities };
  }
  const fromRegistry = SOURCE_CAPABILITY_REGISTRY[source.id as HunterSourceId | 'community'];
  if (fromRegistry) return { ...fromRegistry };

  // Legacy boolean capabilities → map carefully (true→SUPPORTED, false→UNSUPPORTED, missing→UNKNOWN)
  const legacy = 'capabilities' in source ? source.capabilities : undefined;
  if (!legacy) return unknownCapabilities();

  const base = unknownCapabilities();
  base.productLookup = legacy.productLookup ? 'SUPPORTED' : 'UNSUPPORTED';
  base.priceObservation = legacy.price ? 'SUPPORTED' : 'UNSUPPORTED';
  base.merchant = legacy.productLookup ? 'SUPPORTED' : 'UNKNOWN';
  return base;
}

export function capabilityIs(
  caps: DealSourceCapabilities,
  key: DealSourceCapabilityKey,
  status: CapabilityStatus,
): boolean {
  return caps[key] === status;
}

export function assertCapabilitySupported(
  caps: DealSourceCapabilities,
  key: DealSourceCapabilityKey,
): { ok: boolean; status: CapabilityStatus } {
  const status = caps[key];
  return { ok: status === 'SUPPORTED', status };
}
