import { fetchParsedOfferMetadataDetailed } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

export type OfferHealthStatus = 'available' | 'price_changed' | 'out_of_stock' | 'unknown' | 'error';

const PRICE_DELTA_PCT_THRESHOLD = 5;
const PRICE_DELTA_MXN_THRESHOLD = 50;

/** Only a gone product page confirms unavailability; auto-expiry depends on this. */
const GONE_HTTP_STATUSES = new Set([404, 410]);

/** True when a stored diagnostic records a confirmed gone page (http_404 / http_410, optionally suffixed). */
export function isConfirmedGoneDiagnostic(diagnostic: string | null | undefined): boolean {
  return /^http_(404|410)(\||$)/.test(diagnostic ?? '');
}

export type OfferHealthEvaluation = {
  status: OfferHealthStatus;
  publishedPrice: number;
  livePrice: number | null;
  priceDeltaPct: number | null;
  diagnostic: string;
  skipped: boolean;
};

export function evaluateOfferHealthFromParse(
  publishedPrice: number,
  attempt: Awaited<ReturnType<typeof fetchParsedOfferMetadataDetailed>>
): OfferHealthEvaluation {
  const diagnostic = attempt.diagnostic;

  if (
    diagnostic === 'timeout' ||
    diagnostic === 'network_error' ||
    diagnostic === 'blocked_url' ||
    diagnostic === 'invalid_url'
  ) {
    return {
      status: 'available',
      publishedPrice,
      livePrice: null,
      priceDeltaPct: null,
      diagnostic,
      skipped: true,
    };
  }

  if (diagnostic === 'http_error' && attempt.httpStatus != null && GONE_HTTP_STATUSES.has(attempt.httpStatus)) {
    return {
      status: 'out_of_stock',
      publishedPrice,
      livePrice: null,
      priceDeltaPct: null,
      diagnostic: `http_${attempt.httpStatus}`,
      skipped: false,
    };
  }

  // Parse failures (missing_title, missing_discount_price) and non-gone HTTP errors
  // (403/429/5xx: bot walls, rate limits) are inconclusive, never out_of_stock.
  if (!attempt.meta) {
    return {
      status: 'unknown',
      publishedPrice,
      livePrice: null,
      priceDeltaPct: null,
      diagnostic:
        diagnostic === 'http_error' && attempt.httpStatus != null ? `http_${attempt.httpStatus}` : diagnostic,
      skipped: true,
    };
  }

  const livePrice = attempt.meta.discountPrice;
  const deltaMxn = Math.abs(livePrice - publishedPrice);
  const deltaPct =
    publishedPrice > 0 ? Math.round((Math.abs(livePrice - publishedPrice) / publishedPrice) * 10000) / 100 : null;

  const priceChanged =
    deltaMxn >= PRICE_DELTA_MXN_THRESHOLD ||
    (deltaPct != null && deltaPct >= PRICE_DELTA_PCT_THRESHOLD);

  if (priceChanged) {
    return {
      status: 'price_changed',
      publishedPrice,
      livePrice,
      priceDeltaPct: deltaPct,
      diagnostic: 'price_drift',
      skipped: false,
    };
  }

  return {
    status: 'available',
    publishedPrice,
    livePrice,
    priceDeltaPct: deltaPct,
    diagnostic: 'ok',
    skipped: false,
  };
}

export async function evaluateOfferHealth(input: {
  price: number;
  offerUrl: string;
}): Promise<OfferHealthEvaluation> {
  const publishedPrice = Number(input.price) || 0;
  const url = input.offerUrl?.trim();
  if (!url || publishedPrice <= 0) {
    return {
      status: 'error',
      publishedPrice,
      livePrice: null,
      priceDeltaPct: null,
      diagnostic: 'missing_offer_url',
      skipped: false,
    };
  }

  const attempt = await fetchParsedOfferMetadataDetailed(url);
  return evaluateOfferHealthFromParse(publishedPrice, attempt);
}
