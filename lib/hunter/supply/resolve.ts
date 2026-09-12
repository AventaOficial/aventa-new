import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import {
  extractMercadoLibreItemId,
  resolveMercadoLibreItem,
} from '@/lib/offers/resolveMercadoLibreItem';
import type { IngestSourceId } from '@/lib/bots/ingest/types';
import type { HunterSourceId } from '@/lib/hunter/types';

export type CommunityUrlResolution =
  | {
      ok: true;
      url: string;
      ingestSourceId: IngestSourceId;
      hunterSourceId: HunterSourceId;
    }
  | { ok: false; reason: 'invalid_url' | 'blocked_protocol' };

/**
 * Resuelve una URL community con adapters existentes.
 * No scrapea. No crea lógica especial por retailer.
 */
export function resolveCommunityUrl(raw: string): CommunityUrlResolution {
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'blocked_protocol' };
  }

  const ml = resolveMercadoLibreItem(parsed.href);
  if (ml?.itemId || extractMercadoLibreItemId(parsed.href)) {
    return {
      ok: true,
      url: ml?.canonicalUrl ?? parsed.href,
      ingestSourceId: 'ml_api',
      hunterSourceId: 'ml_api_legacy',
    };
  }

  if (extractAmazonAsin(parsed.href)) {
    return {
      ok: true,
      url: parsed.href,
      ingestSourceId: 'amazon_asin',
      hunterSourceId: 'amazon_asin',
    };
  }

  return {
    ok: true,
    url: parsed.href,
    ingestSourceId: 'env_urls',
    hunterSourceId: 'env_urls',
  };
}
