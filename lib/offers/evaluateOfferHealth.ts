import { fetchParsedOfferMetadataDetailed } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

export type OfferHealthStatus = 'available' | 'price_changed' | 'out_of_stock';

const PRICE_DELTA_PCT_THRESHOLD = 5;
const PRICE_DELTA_MXN_THRESHOLD = 50;

const OUT_OF_STOCK_DIAGNOSTICS = new Set([
  'missing_discount_price',
  'missing_title',
  'http_error',
]);

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

  if (OUT_OF_STOCK_DIAGNOSTICS.has(diagnostic)) {
    const http404 = diagnostic === 'http_error' && attempt.httpStatus === 404;
    if (diagnostic !== 'http_error' || http404 || attempt.httpStatus == null || attempt.httpStatus >= 400) {
      return {
        status: 'out_of_stock',
        publishedPrice,
        livePrice: null,
        priceDeltaPct: null,
        diagnostic,
        skipped: false,
      };
    }
  }

  if (!attempt.meta) {
    return {
      status: 'out_of_stock',
      publishedPrice,
      livePrice: null,
      priceDeltaPct: null,
      diagnostic,
      skipped: false,
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
      status: 'out_of_stock',
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
