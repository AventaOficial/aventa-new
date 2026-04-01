import type { BotIngestConfig } from './config';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import { fetchKeepaPriceIntel } from './keepa';

function extractAmazonAsin(url: string): string | null {
  const match = url.toUpperCase().match(/\/DP\/(B[0-9A-Z]{9})\b/);
  return match?.[1] ?? null;
}

export async function enrichWithPriceIntel(
  meta: ParsedOfferMetadata,
  config: BotIngestConfig
): Promise<ParsedOfferMetadata> {
  if (!config.keepaEnabled || !config.keepaApiKey) return meta;
  if (!/amazon/i.test(meta.store)) return meta;

  const asin = extractAmazonAsin(meta.canonicalUrl);
  if (!asin) return meta;

  const intel = await fetchKeepaPriceIntel({
    apiKey: config.keepaApiKey,
    domainId: config.keepaDomainId,
    asin,
  });
  if (!intel) return meta;

  return {
    ...meta,
    signals: {
      ...(meta.signals ?? {}),
      priceLowest30d: intel.lowest30d,
      priceLowest90d: intel.lowest90d,
      priceVsLowest90dPct: intel.priceVsLowest90dPct,
      priceIntelSource: 'keepa',
      suspectedArtificialListPrice:
        meta.originalPrice != null &&
        intel.current != null &&
        meta.originalPrice >= intel.current * 1.45,
    },
  };
}
