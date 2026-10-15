import { ALIEXPRESS_REGISTERED_DOMAINS } from '@/lib/offers/commerceHostAllowlist';
import { isHostUnderAnyRegisteredDomain } from '@/lib/server/hostnameAllowlist';
import {
  isOfferCoppelHost,
  isOfferLiverpoolHost,
  isOfferMercadoLibreHost,
} from '@/lib/offers/commerceHostAllowlist';
/**
 * Parámetros de query que eligen el producto en la ficha de cada tienda.
 * Sólo tiendas con resolver o identidad que ya lee la query; el resto no conserva ninguno.
 */
const PRODUCT_PAGE_PARAMS: ReadonlyArray<{ matches: (host: string) => boolean; params: readonly string[] }> = [
  { matches: isOfferLiverpoolHost, params: ['productId', 'sku', 'skuId'] },
  { matches: isOfferCoppelHost, params: ['sku', 'productId', 'id', 'pid'] },
  { matches: isOfferMercadoLibreHost, params: ['wid', 'item_id', 'pdp_filters'] },
];

const PARAM_VALUE_RE = /^[A-Za-z0-9:_\-.|,]{1,128}$/;

export function productPageParamsForHost(hostname: string): readonly string[] {
  const host = hostname.trim().toLowerCase();
  return PRODUCT_PAGE_PARAMS.find((entry) => entry.matches(host))?.params ?? [];
}

export type ProductPageQuery =
  | { ok: true; params: Array<[string, string]> }
  | { ok: false };

/**
 * Parámetros de producto de la ficha, ordenados. Cualquier otro parámetro (rastreo, afiliado,
 * compartir), valor raro o clave repetida falla: puede cargar una etiqueta de afiliado ajena.
 */
export function productPageQuery(url: URL): ProductPageQuery {
  // AliExpress identifies the product in /item/{numeric-id}.html. Its long query is
  // tracking/affiliate noise, not product identity; strip it instead of rejecting the PDP.
  if (
    isHostUnderAnyRegisteredDomain(url.hostname, ALIEXPRESS_REGISTERED_DOMAINS) &&
    /^\\/item\\/\\d{8,}\\.html$/i.test(url.pathname)
  ) {
    return { ok: true, params: [] };
  }
  const allowed = productPageParamsForHost(url.hostname);
  const kept = new Map<string, [string, string]>();
  for (const [key, value] of url.searchParams) {
    const canonicalKey = allowed.find((p) => p.toLowerCase() === key.toLowerCase());
    if (!canonicalKey) return { ok: false };
    if (kept.has(canonicalKey.toLowerCase())) return { ok: false };
    if (!PARAM_VALUE_RE.test(value)) return { ok: false };
    kept.set(canonicalKey.toLowerCase(), [canonicalKey, value]);
  }
  const params = [...kept.values()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { ok: true, params };
}

/** Sufijo estable para llaves de identidad; vacío si la ficha no trae parámetros de producto. */
export function productPageQueryKey(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const allowed = productPageParamsForHost(url.hostname).map((p) => p.toLowerCase());
    if (allowed.length === 0 || !url.search) return '';
    const pairs: string[] = [];
    for (const [key, value] of url.searchParams) {
      const k = key.toLowerCase();
      if (allowed.includes(k) && value.trim()) pairs.push(`${k}=${value.trim().toLowerCase()}`);
    }
    return pairs.length ? `?${[...new Set(pairs)].sort().join('&')}` : '';
  } catch {
    return '';
  }
}
