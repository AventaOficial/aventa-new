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
  isOfferMeliLaHost,
  isOfferWalmartHost,
  isWalmartExpandableHost,
} from '@/lib/offers/commerceHostAllowlist';
import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import {
  extractMercadoLibreItemId,
  extractMercadoLibreUserProductId,
} from '@/lib/offers/resolveMercadoLibreItem';
import { extractCoppelProductId } from '@/lib/offers/urlResolution/coppelResolver';
import { extractElektraProductId } from '@/lib/offers/urlResolution/elektraResolver';
import { extractLiverpoolProductId } from '@/lib/offers/urlResolution/liverpoolResolver';
import { extractWalmartItemId } from '@/lib/offers/urlResolution/walmartResolver';

/** Imágenes pegadas junto a la oferta no son una segunda oferta. */
export function isEmbeddedAssetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (
      host.includes('media-amazon.') ||
      host.includes('images-amazon.') ||
      host.includes('ssl-images-amazon.') ||
      host.includes('mlstatic.com') ||
      host.includes('fbcdn.net')
    ) {
      return true;
    }
    return /\.(?:jpg|jpeg|png|webp|gif|avif)(?:$)/i.test(u.pathname);
  } catch {
    return false;
  }
}

export type PastedUrlKind =
  | 'product'
  | 'unsupported'
  | 'reference'
  | 'image'
  | 'social'
  | 'text'
  | 'invalid';

const EDITORIAL_HOSTS = [
  'xataka.com',
  'debate.com.mx',
  'jointly.mx',
  'wikipedia.org',
  'medium.com',
  'reddit.com',
  'blogspot.com',
];

function isEditorialHost(hostname: string): boolean {
  const host = hostKey(hostname);
  return EDITORIAL_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`) || host.includes(domain));
}

function isStoreHomepage(url: URL): boolean {
  const path = url.pathname.replace(/\/+$/, '');
  return path === '' && [...url.searchParams.keys()].length === 0;
}

const SOCIAL_HOSTS = [
  'x.com',
  'twitter.com',
  'facebook.com',
  'fb.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  't.me',
  'telegram.me',
  'linkedin.com',
  'threads.net',
  'wa.me',
  'whatsapp.com',
];

function hostKey(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

function isSocialHost(hostname: string): boolean {
  const host = hostKey(hostname);
  return SOCIAL_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function hasPathToken(url: URL): boolean {
  return url.pathname.replace(/\/+$/, '').split('/').filter(Boolean).length > 0;
}

/** Product page or recognized short hop. News, blogs and bare https links are not products. */
export function isRecognizedProductUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname;
  if (isEmbeddedAssetUrl(rawUrl)) return false;
  if (isSocialHost(host)) return false;

  if (isOfferAmazonHost(host) && extractAmazonAsin(rawUrl)) return true;
  if (isAmazonExpandableHost(host) && hasPathToken(url)) return true;

  if (isOfferMeliLaHost(host) && hasPathToken(url)) return true;
  if (
    isOfferMercadoLibreHost(host) &&
    (extractMercadoLibreItemId(rawUrl) || extractMercadoLibreUserProductId(rawUrl))
  ) {
    return true;
  }

  if (isOfferWalmartHost(host) && extractWalmartItemId(rawUrl)) return true;
  if (isWalmartExpandableHost(host) && hasPathToken(url)) return true;

  if ((isOfferLiverpoolHost(host) || isLiverpoolExpandableHost(host)) && extractLiverpoolProductId(rawUrl)) {
    return true;
  }
  if ((isOfferCoppelHost(host) || isCoppelExpandableHost(host)) && extractCoppelProductId(rawUrl)) {
    return true;
  }
  if ((isOfferElektraHost(host) || isElektraExpandableHost(host)) && extractElektraProductId(rawUrl)) {
    return true;
  }

  return false;
}

export function classifyPastedUrl(rawUrl: string): PastedUrlKind {
  const trimmed = rawUrl.trim();
  if (!trimmed) return 'invalid';
  if (!/^https?:\/\//i.test(trimmed)) return 'text';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return 'invalid';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'invalid';
  if (!url.hostname.includes('.')) return 'invalid';
  if (isEmbeddedAssetUrl(trimmed)) return 'image';
  if (isSocialHost(url.hostname)) return 'social';
  if (isRecognizedProductUrl(trimmed)) return 'product';
  if (isEditorialHost(url.hostname) || isStoreHomepage(url)) return 'reference';
  const segments = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (segments.length >= 2) return 'unsupported';
  return 'reference';
}
