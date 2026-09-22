/**
 * Matriz viva de capacidad del parser "Subir oferta".
 * Mantener alineada con docs/SYSTEMS/SYSTEM_offer_url_extraction.md
 *
 * depth:
 * - full     → resolver identidad + extractor rico + galería multi
 * - generic  → allowlist + JSON-LD/og (enrichRetailOfferFromHtml)
 * - host_only→ allowlist para fetch; extracción mínima
 */

export type RetailerExtractionDepth = 'full' | 'generic' | 'host_only';

export type RetailerCapability = {
  id: string;
  label: string;
  depth: RetailerExtractionDepth;
  /** Dominios / hops documentados (referencia; allowlist canónica está en commerceHostAllowlist). */
  hostsNote: string;
  identity:
    | 'asin'
    | 'ml_item'
    | 'walmart_item'
    | 'liverpool_sku'
    | 'coppel_sku'
    | 'elektra_sku'
    | 'hostname'
    | 'none';
  multiImage: 'strong' | 'jsonld' | 'weak';
  notes: string;
};

export const OFFER_URL_EXTRACTION_CAPABILITIES: readonly RetailerCapability[] = [
  {
    id: 'amazon',
    label: 'Amazon',
    depth: 'full',
    hostsNote: 'amazon.* / a.co / amzn.to / link.amazon / amazon.app.link',
    identity: 'asin',
    multiImage: 'strong',
    notes: 'Resolver expandible + /dp/{ASIN}; galería colorImages/hiRes',
  },
  {
    id: 'mercado_libre',
    label: 'Mercado Libre',
    depth: 'full',
    hostsNote: 'mercadolibre.* / meli.la',
    identity: 'ml_item',
    multiImage: 'strong',
    notes: 'API pictures; CDN HTML solo meli.la|/social (PARSE_OFFER_MELI_LA_GALERIA)',
  },
  {
    id: 'walmart_mx',
    label: 'Walmart',
    depth: 'full',
    hostsNote: 'walmart.com.mx / walmart.page.link',
    identity: 'walmart_item',
    multiImage: 'strong',
    notes: 'Resolver /ip/{id} + JSON-LD/__NEXT_DATA__ gallery (estilo Amazon)',
  },
  {
    id: 'liverpool',
    label: 'Liverpool',
    depth: 'full',
    hostsNote: 'liverpool.com.mx / liverpool.app.link',
    identity: 'liverpool_sku',
    multiImage: 'strong',
    notes: 'Resolver PDP sku + JSON-LD multi-image + sscdn (estilo Amazon)',
  },
  {
    id: 'coppel',
    label: 'Coppel',
    depth: 'full',
    hostsNote: 'coppel.com / coppel.app.link',
    identity: 'coppel_sku',
    multiImage: 'strong',
    notes: 'Resolver SKU + JSON-LD/CDN multi-image (estilo Amazon)',
  },
  {
    id: 'elektra',
    label: 'Elektra',
    depth: 'full',
    hostsNote: 'elektra.mx / elektra.com.mx',
    identity: 'elektra_sku',
    multiImage: 'strong',
    notes: 'Resolver SKU + JSON-LD/CDN multi-image (estilo Amazon)',
  },
  {
    id: 'mx_retail_other',
    label: 'Retail MX allowlisted',
    depth: 'generic',
    hostsNote: 'MX_COMMERCE_REGISTERED_DOMAINS (Home Depot, Costco, Nike, …)',
    identity: 'hostname',
    multiImage: 'jsonld',
    notes: 'Mismo path enrichRetailOfferFromHtml; sin resolver SKU propio',
  },
  {
    id: 'affiliate_networks',
    label: 'AliExpress / Temu / Shein / eBay',
    depth: 'generic',
    hostsNote: 'ver ALIEXPRESS_/TEMU_/SHEIN_/EBAY_REGISTERED_DOMAINS',
    identity: 'hostname',
    multiImage: 'weak',
    notes: 'Fetch allowlisted; extracción genérica',
  },
] as const;

export function listFullDepthRetailers(): RetailerCapability[] {
  return OFFER_URL_EXTRACTION_CAPABILITIES.filter((c) => c.depth === 'full');
}

export function listGenericRetailers(): RetailerCapability[] {
  return OFFER_URL_EXTRACTION_CAPABILITIES.filter((c) => c.depth === 'generic');
}
