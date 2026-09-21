import { createHash, createHmac } from 'node:crypto';
import type { BotIngestConfig } from './config';
import type { IngestItem } from './types';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import { firstValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import { fetchWithTimeout, HUNTER_HTTP_TIMEOUT_MS } from '@/lib/server/fetchWithTimeout';
import { applyCanonicalDiscountToMetaFields } from './canonicalDiscount';

export type PaapiItem = {
  ASIN?: string;
  DetailPageURL?: string;
  ItemInfo?: {
    Title?: { DisplayValue?: string };
    ByLineInfo?: { Brand?: { DisplayValue?: string } };
  };
  Images?: {
    Primary?: {
      Large?: { URL?: string };
      Medium?: { URL?: string };
    };
  };
  Offers?: {
    Listings?: Array<{
      Price?: {
        Amount?: number;
        Savings?: { Amount?: number; Percentage?: number };
      };
    }>;
    Summaries?: Array<{
      LowestPrice?: { Amount?: number };
      HighestPrice?: { Amount?: number };
    }>;
  };
  CustomerReviews?: {
    Count?: number;
    StarRating?: { Value?: number };
  };
};

type PaapiResponse = {
  ItemsResult?: { Items?: PaapiItem[] };
};

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function signPaapiRequest(
  body: string,
  host: string,
  region: string,
  accessKey: string,
  secretKey: string
): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeaders =
    `content-encoding:amz-1.0\ncontent-type:application/json; charset=utf-8\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems\n`;
  const signedHeaders =
    'content-encoding;content-type;host;x-amz-date;x-amz-target';
  const canonicalRequest = [
    'POST',
    '/paapi5/getitems',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256Hex(body),
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/ProductAdvertisingAPI/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 'ProductAdvertisingAPI');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  return {
    'Content-Encoding': 'amz-1.0',
    'Content-Type': 'application/json; charset=utf-8',
    Host: host,
    'X-Amz-Date': amzDate,
    'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems',
    Authorization: authorization,
  };
}

export function normalizePaapiItem(item: PaapiItem): ParsedOfferMetadata | null {
  const title = item.ItemInfo?.Title?.DisplayValue?.trim();
  const canonicalUrl = item.DetailPageURL?.trim();
  const imageUrl =
    firstValidOfferImage([
      item.Images?.Primary?.Large?.URL,
      item.Images?.Primary?.Medium?.URL,
    ]) ?? '';
  const listing = item.Offers?.Listings?.[0];
  const discountPrice = listing?.Price?.Amount ?? null;
  const savingsAmount = listing?.Price?.Savings?.Amount ?? null;
  const originalPrice =
    discountPrice != null && savingsAmount != null && savingsAmount > 0
      ? discountPrice + savingsAmount
      : null;
  if (!title || !canonicalUrl || discountPrice == null || discountPrice <= 0) return null;
  const applied = applyCanonicalDiscountToMetaFields({
    salePrice: discountPrice,
    originalPrice,
    existingDiscountPercent: listing?.Price?.Savings?.Percentage ?? null,
    recordShadow: false,
  });
  const discountPercent = applied.discountPercent;

  return {
    canonicalUrl,
    title,
    store: 'Amazon',
    imageUrl,
    discountPrice,
    originalPrice,
    discountPercent,
    signals: {
      ratingAverage: item.CustomerReviews?.StarRating?.Value ?? null,
      ratingCount: item.CustomerReviews?.Count ?? null,
    },
  };
}

export type AmazonPaapiDiscoveryResult = {
  items: IngestItem[];
  skippedCandidates: Array<{
    url: string;
    title?: string | null;
    reason: string;
    itemId?: string | null;
  }>;
  skipReasonCounts: Record<string, number>;
};

export async function discoverAmazonPaapiIngestItems(
  config: BotIngestConfig,
): Promise<AmazonPaapiDiscoveryResult> {
  const empty = (): AmazonPaapiDiscoveryResult => ({
    items: [],
    skippedCandidates: [],
    skipReasonCounts: {},
  });

  if (
    !config.amazonPaapiEnabled ||
    config.amazonSource !== 'paapi' ||
    !config.amazonPaapiAccessKey ||
    !config.amazonPaapiSecretKey ||
    !config.amazonPaapiPartnerTag ||
    config.amazonAsins.length === 0
  ) {
    return empty();
  }

  const asins = config.amazonAsins.slice(0, 10);
  const truncated = config.amazonAsins.slice(10);
  const skippedCandidates: AmazonPaapiDiscoveryResult['skippedCandidates'] = [];
  const skipReasonCounts: Record<string, number> = {};
  const bump = (reason: string) => {
    skipReasonCounts[reason] = (skipReasonCounts[reason] ?? 0) + 1;
  };
  for (const asin of truncated) {
    skippedCandidates.push({
      url: `https://www.amazon.com.mx/dp/${asin}`,
      title: null,
      reason: 'amazon paapi: asin_cap truncated',
      itemId: asin,
    });
    bump('amazon paapi: asin_cap truncated');
  }

  const body = JSON.stringify({
    ItemIds: asins,
    ItemIdType: 'ASIN',
    LanguagesOfPreference: ['es_MX'],
    Marketplace: 'www.amazon.com.mx',
    PartnerTag: config.amazonPaapiPartnerTag,
    PartnerType: 'Associates',
    Resources: [
      'ItemInfo.Title',
      'ItemInfo.ByLineInfo',
      'Images.Primary.Large',
      'Images.Primary.Medium',
      'Offers.Listings.Price',
      'Offers.Summaries.LowestPrice',
      'Offers.Summaries.HighestPrice',
      'CustomerReviews.Count',
      'CustomerReviews.StarRating',
    ],
  });

  const headers = signPaapiRequest(
    body,
    config.amazonPaapiHost,
    config.amazonPaapiRegion,
    config.amazonPaapiAccessKey,
    config.amazonPaapiSecretKey
  );

  let res: Response;
  try {
    res = await fetchWithTimeout(`https://${config.amazonPaapiHost}/paapi5/getitems`, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
      timeoutMs: HUNTER_HTTP_TIMEOUT_MS,
    });
  } catch {
    return { items: [], skippedCandidates, skipReasonCounts };
  }
  if (!res.ok) return { items: [], skippedCandidates, skipReasonCounts };

  let json: PaapiResponse;
  try {
    json = (await res.json()) as PaapiResponse;
  } catch {
    return { items: [], skippedCandidates, skipReasonCounts };
  }

  const out: IngestItem[] = [];
  for (const row of json.ItemsResult?.Items ?? []) {
    const detailUrl = row.DetailPageURL?.trim() || null;
    const asin = row.ASIN?.trim() || null;
    const meta = normalizePaapiItem(row);
    if (!meta) {
      if (detailUrl) {
        skippedCandidates.push({
          url: detailUrl,
          title: row.ItemInfo?.Title?.DisplayValue?.trim() ?? null,
          reason: 'amazon paapi: normalize failed',
          itemId: asin,
        });
        bump('amazon paapi: normalize failed');
      }
      continue;
    }
    out.push({
      url: meta.canonicalUrl,
      source: 'amazon_asin',
      precomputedMeta: meta,
      sourceDetail: 'amazon:paapi',
    });
  }
  return { items: out, skippedCandidates, skipReasonCounts };
}
