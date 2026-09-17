/**
 * Mercado Libre Afiliados y Creadores — capability matrix (official sources only).
 *
 * CRITICAL: Developers API (seller OAuth / orders / billing) ≠ Programa de Afiliados.
 * Do NOT use seller tokens or seller webhooks as affiliate economic authority.
 */

export type CapabilitySupport =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'NOT_SUPPORTED'
  | 'UNKNOWN';

export type MercadoLibreCapabilityRow = {
  capability: string;
  support: CapabilitySupport;
  officialSource: string;
  exactEndpointOrMechanism: string;
  authMethod: string;
  dataShape: string;
  limitations: string;
  aventaImplication: string;
};

/**
 * Evidence base (MX / program pages + Developers catalog search, 2026-09-16):
 * - https://www.mercadolibre.com.mx/l/como-se-calculan-tus-ganancias
 * - https://www.mercadolibre.com.mx/l/primerospasos-recorre-la-central-de-afiliados
 * - https://www.mercadolibre.com.mx/l/primerospasos-organiza-tus-links
 * - https://www.mercadolibre.com.mx/l/primerospasos-checklist
 * - https://www.mercadolibre.com.mx/landing/afiliados
 * - https://developers.mercadolibre.com.mx (no documented affiliate conversions API found)
 * - Seller notifications (orders/payments) are seller-scoped, not affiliate-scoped
 */
export const MERCADOLIBRE_AFFILIATE_CAPABILITY_MATRIX: readonly MercadoLibreCapabilityRow[] = [
  {
    capability: 'generate affiliate link',
    support: 'PARTIALLY_SUPPORTED',
    officialSource: 'Central de Afiliados / Barra / Generador de links (program UX)',
    exactEndpointOrMechanism:
      'Manual UI link generation; Aventa applies tag/matt_word/matt_tool query params server-side',
    authMethod: 'Affiliate account session in ML UI (not Developers API)',
    dataShape: 'Share URL with tracking query params',
    limitations: 'No official Developers API to mint affiliate links programmatically documented',
    aventaImplication:
      'Keep using lib/affiliate applyPlatformAffiliateTags; do NOT invent link API client',
  },
  {
    capability: 'affiliate click tracking',
    support: 'PARTIALLY_SUPPORTED',
    officialSource: 'Program metrics UI (Central); Aventa Attribution Foundation',
    exactEndpointOrMechanism:
      'ML tracks clicks on affiliate links internally; Aventa records reward_outbound_clicks',
    authMethod: 'N/A for Aventa outbound; ML UI session for Central metrics',
    dataShape: 'Aventa: click_id; ML Central: aggregated metrics',
    limitations: 'No official API exposing ML click IDs to third parties found',
    aventaImplication: 'Aventa click_id remains Attribution SoT; cannot join to ML click id',
  },
  {
    capability: 'conversion reporting',
    support: 'NOT_SUPPORTED',
    officialSource: 'No Developers endpoint documented for affiliate conversions',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API',
    authMethod: '—',
    dataShape: '—',
    limitations: 'Central Métricas shows aggregated ventas/ganancias UI only (≈24h refresh)',
    aventaImplication: 'Cannot auto-ingest conversions; refuse invented payloads',
  },
  {
    capability: 'commission reporting',
    support: 'NOT_SUPPORTED',
    officialSource: 'No Developers endpoint documented for affiliate commission amounts',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API',
    authMethod: '—',
    dataShape: '—',
    limitations: 'Category % pages are marketing; not confirmed per-sale amounts via API',
    aventaImplication: 'NEVER invent commission = sale × category%; no monetary commission ingest',
  },
  {
    capability: 'conversion ID',
    support: 'NOT_SUPPORTED',
    officialSource: 'Not exposed via official affiliate API',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API',
    authMethod: '—',
    dataShape: '—',
    limitations: 'Without stable external_conversion_id, economic persist is forbidden',
    aventaImplication: 'Block persist until official ID exists',
  },
  {
    capability: 'commission ID',
    support: 'NOT_SUPPORTED',
    officialSource: 'Not exposed via official affiliate API',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API',
    authMethod: '—',
    dataShape: '—',
    limitations: 'No external_commission_id from ML affiliate program API',
    aventaImplication: 'Block commission persist',
  },
  {
    capability: 'click ID (provider)',
    support: 'NOT_SUPPORTED',
    officialSource: 'Not documented as exportable affiliate click identifier',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API',
    authMethod: '—',
    dataShape: '—',
    limitations: 'Cannot map ML-side click to Aventa click_id',
    aventaImplication: 'Attribution to Aventa click remains unresolved without provider evidence',
  },
  {
    capability: 'attribution window',
    support: 'SUPPORTED',
    officialSource: 'https://www.mercadolibre.com.mx/l/como-se-calculan-tus-ganancias',
    exactEndpointOrMechanism: 'Program rule: 24h last-click window',
    authMethod: 'N/A (policy)',
    dataShape: 'Policy constant: 24 hours',
    limitations: 'Policy text; not an API field',
    aventaImplication: 'Document 24h window; do not invent attribution beyond policy',
  },
  {
    capability: 'campaign/tag ID',
    support: 'PARTIALLY_SUPPORTED',
    officialSource: 'https://www.mercadolibre.com.mx/l/primerospasos-organiza-tus-links',
    exactEndpointOrMechanism: 'Etiquetas in Central (max 100, ≤30 chars, no spaces)',
    authMethod: 'Affiliate UI session',
    dataShape: 'Tag name string',
    limitations: 'Tags not deletable; no API to list/create tags found',
    aventaImplication: 'Map Aventa campaign_key ↔ ML tag only manually / by convention',
  },
  {
    capability: 'product/item ID',
    support: 'PARTIALLY_SUPPORTED',
    officialSource: 'Program link generator (item URL / ID share)',
    exactEndpointOrMechanism: 'Item IDs in ML catalog URLs; Developers /items is seller/catalog API',
    authMethod: 'Public item pages / seller API (different product)',
    dataShape: 'MLM… item id',
    limitations: 'Catalog item API ≠ affiliate conversion confirmation',
    aventaImplication: 'May enrich offers; never prove affiliate conversion',
  },
  {
    capability: 'buyer/order ID',
    support: 'NOT_SUPPORTED',
    officialSource: 'Affiliate program docs do not expose buyer/order IDs to affiliates via API',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API',
    authMethod: '—',
    dataShape: '—',
    limitations: 'Seller orders API is not affiliate authority',
    aventaImplication: 'Do not use seller order webhooks as affiliate conversions',
  },
  {
    capability: 'status',
    support: 'PARTIALLY_SUPPORTED',
    officialSource: 'Program: validation after delivery; cancel/return void earnings',
    exactEndpointOrMechanism: 'Central Ingresos/Métricas statuses (UI)',
    authMethod: 'Affiliate UI',
    dataShape: 'UI aggregates (en revisión / proceso de pago / verificadas)',
    limitations: 'No machine-readable per-event status API found',
    aventaImplication: 'Cannot drive conversion status machine from ML automatically',
  },
  {
    capability: 'cancellation',
    support: 'PARTIALLY_SUPPORTED',
    officialSource: 'https://www.mercadolibre.com.mx/l/como-se-calculan-tus-ganancias',
    exactEndpointOrMechanism: 'Policy: cancelations prevent validated earnings',
    authMethod: 'N/A',
    dataShape: 'Policy',
    limitations: 'No affiliate cancellation webhook/API found',
    aventaImplication: 'Revision path ready; no live cancel feed',
  },
  {
    capability: 'refund/reversal',
    support: 'PARTIALLY_SUPPORTED',
    officialSource: 'Program FAQ / earnings calculation (returns void gains)',
    exactEndpointOrMechanism: 'Policy-level; UI metrics may reflect adjustments',
    authMethod: 'N/A',
    dataShape: 'Policy',
    limitations: 'No official per-commission reversal event API',
    aventaImplication: 'affiliate_commission_revisions ready; ingest NOT connected',
  },
  {
    capability: 'commission correction',
    support: 'UNKNOWN',
    officialSource: 'Not explicitly documented as API events',
    exactEndpointOrMechanism: 'UNKNOWN / likely UI-only adjustments',
    authMethod: '—',
    dataShape: '—',
    limitations: 'Insufficient official machine contract',
    aventaImplication: 'Do not invent correction payloads',
  },
  {
    capability: 'amount',
    support: 'NOT_SUPPORTED',
    officialSource: 'No API returning confirmed affiliate commission cents',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API',
    authMethod: '—',
    dataShape: '—',
    limitations: 'Category % is not a confirmed economic amount',
    aventaImplication: 'Refuse monetary commission without official amount',
  },
  {
    capability: 'currency',
    support: 'PARTIALLY_SUPPORTED',
    officialSource: 'MX program pages reference MXN payouts',
    exactEndpointOrMechanism: 'Program policy (MXN Mercado Pago)',
    authMethod: 'N/A',
    dataShape: 'MXN assumed for MX program',
    limitations: 'Not an event-level API field',
    aventaImplication: 'If/when API exists, trust provider currency field only',
  },
  {
    capability: 'timestamp',
    support: 'NOT_SUPPORTED',
    officialSource: 'No per-event timestamp API for affiliate sales found',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API',
    authMethod: '—',
    dataShape: '—',
    limitations: 'Metrics refresh ~24h in UI',
    aventaImplication: 'Cannot timestamp individual conversions from ML API',
  },
  {
    capability: 'webhook',
    support: 'NOT_SUPPORTED',
    officialSource: 'Developers notifications are seller topics (orders/items/…)',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API (affiliate topic)',
    authMethod: 'Seller app notifications ≠ affiliate',
    dataShape: 'Seller resource URLs',
    limitations: 'Using seller webhooks as affiliate truth would be incorrect',
    aventaImplication: 'No affiliate webhook route; fail-closed',
  },
  {
    capability: 'polling API',
    support: 'NOT_SUPPORTED',
    officialSource: 'No affiliate conversions/commissions poll endpoint found',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API',
    authMethod: '—',
    dataShape: '—',
    limitations: '—',
    aventaImplication: 'No MercadoLibreClient poll loop',
  },
  {
    capability: 'CSV/export',
    support: 'UNKNOWN',
    officialSource: 'Central UI may allow human export; not confirmed as official API contract',
    exactEndpointOrMechanism: 'UNKNOWN — do not scrape Central',
    authMethod: 'UI session if any',
    dataShape: 'UNKNOWN',
    limitations: 'Scraping / session cookies forbidden by mission rules',
    aventaImplication: 'No automated CSV import from ML Central',
  },
  {
    capability: 'metrics API',
    support: 'NOT_SUPPORTED',
    officialSource: 'Central Métricas is UI; Developers “métricas del negocio” is seller-scoped',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API (affiliate metrics)',
    authMethod: '—',
    dataShape: '—',
    limitations: 'Seller metrics ≠ affiliate earnings',
    aventaImplication: 'CEO revenue stays not connected',
  },
  {
    capability: 'authentication',
    support: 'PARTIALLY_SUPPORTED',
    officialSource: 'Affiliate: ML account + Central; Developers: OAuth for seller apps',
    exactEndpointOrMechanism: 'Seller OAuth already in Aventa for supply — separate concern',
    authMethod: 'OAuth seller vs UI affiliate session',
    dataShape: 'Bearer for seller API only',
    limitations: 'Seller OAuth does not authorize affiliate economic ingest',
    aventaImplication: 'Never reuse mercadolibre_oauth_tokens for affiliate commissions',
  },
  {
    capability: 'signature verification',
    support: 'NOT_SUPPORTED',
    officialSource: 'No affiliate webhook signature scheme documented',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API',
    authMethod: '—',
    dataShape: '—',
    limitations: 'Cannot implement invent HMAC/header',
    aventaImplication: 'verifySignature → network_not_connected / not_supported',
  },
  {
    capability: 'pagination',
    support: 'NOT_SUPPORTED',
    officialSource: 'No affiliate event list API',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API',
    authMethod: '—',
    dataShape: '—',
    limitations: '—',
    aventaImplication: 'No cursor/checkpoint sync',
  },
  {
    capability: 'rate limits',
    support: 'UNKNOWN',
    officialSource: 'Seller API has rate limits; affiliate API N/A',
    exactEndpointOrMechanism: 'N/A until affiliate API exists',
    authMethod: '—',
    dataShape: '—',
    limitations: '—',
    aventaImplication: 'Backoff scaffolding deferred until real endpoint exists',
  },
  {
    capability: 'historical backfill',
    support: 'NOT_SUPPORTED',
    officialSource: 'No affiliate historical event API found',
    exactEndpointOrMechanism: 'NOT_SUPPORTED_BY_OFFICIAL_API',
    authMethod: '—',
    dataShape: '—',
    limitations: 'UI metrics only',
    aventaImplication: 'historical_backfill = unsupported',
  },
] as const;

export const MERCADOLIBRE_ATTRIBUTION_WINDOW_HOURS = 24 as const;

export const MERCADOLIBRE_AFFILIATE_ECONOMIC_INGEST_SUPPORTED = false as const;

export function summarizeMercadoLibreAffiliateCapabilities(): {
  supported: string[];
  partiallySupported: string[];
  notSupported: string[];
  unknown: string[];
  economicIngestSupported: false;
} {
  const supported: string[] = [];
  const partiallySupported: string[] = [];
  const notSupported: string[] = [];
  const unknown: string[] = [];
  for (const row of MERCADOLIBRE_AFFILIATE_CAPABILITY_MATRIX) {
    if (row.support === 'SUPPORTED') supported.push(row.capability);
    else if (row.support === 'PARTIALLY_SUPPORTED') partiallySupported.push(row.capability);
    else if (row.support === 'NOT_SUPPORTED') notSupported.push(row.capability);
    else unknown.push(row.capability);
  }
  return {
    supported,
    partiallySupported,
    notSupported,
    unknown,
    economicIngestSupported: false,
  };
}
