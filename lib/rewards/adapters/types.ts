import type { AffiliateLedgerNetwork } from '@/lib/commissions/affiliateLedger';
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';

export type AffiliateNetworkId = AffiliateLedgerNetwork;

export type OutboundTrackingContext = {
  offerId: string;
  clickId: string;
};

/** Capacidades reales por red (sin inventar APIs). */
export type AffiliateNetworkCapabilities = {
  id: AffiliateNetworkId;
  supportsSubId: boolean;
  supportsProductFingerprint: boolean;
};

export type AffiliateNetworkAdapter = {
  id: AffiliateNetworkId;
  capabilities: AffiliateNetworkCapabilities;
  detectNetwork(url: string): boolean;
  productFingerprint(url: string): string | null;
  /** Inyecta sub-id en URL cuando la red lo soporta. */
  applyOutboundTracking(url: string, tracking: OutboundTrackingContext): string;
  /** Extrae click_id de reporte CSV/meta si la red lo devolvió. */
  parseSubIdFromReport(raw: string | null | undefined): string | null;
};

const SUB_ID_PREFIX = 'av1';

export function encodeAventaSubId(offerId: string, clickId: string): string {
  return `${SUB_ID_PREFIX}.${offerId}.${clickId}`;
}

export function decodeAventaSubId(raw: string | null | undefined): {
  offerId: string;
  clickId: string;
} | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const parts = trimmed.split('.');
  if (parts.length >= 3 && parts[0] === 'av1') {
    const offerId = parts[1];
    const clickId = parts.slice(2).join('.');
    if (offerId && clickId) return { offerId, clickId };
  }
  return null;
}

function hostIncludes(url: string, fragment: string): boolean {
  try {
    return new URL(url.trim()).hostname.toLowerCase().includes(fragment);
  } catch {
    return false;
  }
}

export const amazonAdapter: AffiliateNetworkAdapter = {
  id: 'amazon',
  capabilities: {
    id: 'amazon',
    supportsSubId: true,
    supportsProductFingerprint: true,
  },
  detectNetwork(url) {
    return (
      hostIncludes(url, 'amazon.') ||
      hostIncludes(url, 'amzn.to') ||
      hostIncludes(url, 'a.co')
    );
  },
  productFingerprint(url) {
    const fp = offerUrlFingerprint(url);
    return fp?.startsWith('amz:') ? fp : null;
  },
  applyOutboundTracking(url, tracking) {
    try {
      const u = new URL(url);
      u.searchParams.set('ascsubtag', encodeAventaSubId(tracking.offerId, tracking.clickId));
      return u.toString();
    } catch {
      return url;
    }
  },
  parseSubIdFromReport(raw) {
    const decoded = decodeAventaSubId(raw);
    return decoded?.clickId ?? null;
  },
};

export const mercadoLibreAdapter: AffiliateNetworkAdapter = {
  id: 'mercadolibre',
  capabilities: {
    id: 'mercadolibre',
    supportsSubId: false,
    supportsProductFingerprint: true,
  },
  detectNetwork(url) {
    return hostIncludes(url, 'mercadolibre.') || hostIncludes(url, 'meli.la');
  },
  productFingerprint(url) {
    const fp = offerUrlFingerprint(url);
    return fp?.startsWith('ml:') ? fp : null;
  },
  applyOutboundTracking(url) {
    return url;
  },
  parseSubIdFromReport() {
    return null;
  },
};

const GENERIC_ADAPTERS: AffiliateNetworkAdapter[] = [
  {
    id: 'aliexpress',
    capabilities: { id: 'aliexpress', supportsSubId: false, supportsProductFingerprint: false },
    detectNetwork: (url) => hostIncludes(url, 'aliexpress.'),
    productFingerprint: () => null,
    applyOutboundTracking: (url) => url,
    parseSubIdFromReport: () => null,
  },
  {
    id: 'walmart',
    capabilities: { id: 'walmart', supportsSubId: false, supportsProductFingerprint: false },
    detectNetwork: (url) => hostIncludes(url, 'walmart.'),
    productFingerprint: () => null,
    applyOutboundTracking: (url) => url,
    parseSubIdFromReport: () => null,
  },
  {
    id: 'temu',
    capabilities: { id: 'temu', supportsSubId: false, supportsProductFingerprint: false },
    detectNetwork: (url) => hostIncludes(url, 'temu.'),
    productFingerprint: () => null,
    applyOutboundTracking: (url) => url,
    parseSubIdFromReport: () => null,
  },
  {
    id: 'shein',
    capabilities: { id: 'shein', supportsSubId: false, supportsProductFingerprint: false },
    detectNetwork: (url) => hostIncludes(url, 'shein.'),
    productFingerprint: () => null,
    applyOutboundTracking: (url) => url,
    parseSubIdFromReport: () => null,
  },
  {
    id: 'other',
    capabilities: { id: 'other', supportsSubId: false, supportsProductFingerprint: false },
    detectNetwork: () => false,
    productFingerprint: () => null,
    applyOutboundTracking: (url) => url,
    parseSubIdFromReport: () => null,
  },
];

export const AFFILIATE_ADAPTERS: AffiliateNetworkAdapter[] = [
  amazonAdapter,
  mercadoLibreAdapter,
  ...GENERIC_ADAPTERS,
];

export function getAdapterById(id: AffiliateNetworkId): AffiliateNetworkAdapter {
  return AFFILIATE_ADAPTERS.find((a) => a.id === id) ?? GENERIC_ADAPTERS[GENERIC_ADAPTERS.length - 1];
}

export function detectNetworkFromUrl(url: string): AffiliateNetworkId {
  for (const adapter of AFFILIATE_ADAPTERS) {
    if (adapter.detectNetwork(url)) return adapter.id;
  }
  return 'other';
}

export function applyAdapterOutboundTracking(
  url: string,
  tracking: OutboundTrackingContext,
): string {
  const network = detectNetworkFromUrl(url);
  const adapter = getAdapterById(network);
  return adapter.applyOutboundTracking(url, tracking);
}
