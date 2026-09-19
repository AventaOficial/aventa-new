/**
 * CazaOfertasss — FASE 0. Identidad canónica y normalización de URL.
 *
 * Autoridad: esta capa decide CUÁNDO dos detecciones son el mismo producto.
 * Identidad primaria: `store + externalProductId`. Fallback: URL canónica
 * normalizada. El título NUNCA es identidad.
 */

import {
  CAZAOFERTAS_STORES,
  EXTERNAL_PRODUCT_ID_MAX_LENGTH,
  IDENTITY_STRIPPED_QUERY_KEYS,
  IDENTITY_STRIPPED_QUERY_PREFIXES,
  URL_MAX_LENGTH,
} from './constants';
import type { CazaResult, CazaStoreId, DealIdentity } from './types';
import { failResult, okResult } from './types';

const STORE_SET: ReadonlySet<string> = new Set<string>(CAZAOFERTAS_STORES);
const STRIPPED_KEYS: ReadonlySet<string> = new Set<string>(IDENTITY_STRIPPED_QUERY_KEYS);

/** Hosts aceptados por tienda. Lista cerrada: un host desconocido es un rechazo. */
const STORE_HOSTS: Readonly<Record<CazaStoreId, readonly string[]>> = {
  mercadolibre_mx: ['mercadolibre.com.mx', 'articulo.mercadolibre.com.mx', 'produto.mercadolibre.com.mx'],
  amazon_mx: ['amazon.com.mx'],
};

export function isSupportedStore(value: unknown): value is CazaStoreId {
  return typeof value === 'string' && STORE_SET.has(value);
}

/**
 * Hash FNV-1a 32-bit en hex. Determinista, sin dependencias y estable entre
 * runtimes. No es criptográfico y no se usa para seguridad, sólo para acortar
 * claves de identidad.
 */
export function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export interface NormalizedUrl {
  readonly url: string;
  readonly host: string;
  readonly path: string;
  readonly store: CazaStoreId | null;
}

/**
 * Canoniza una URL de producto no confiable.
 *
 * - sólo https
 * - host en minúsculas, sin `www.`
 * - fragmento eliminado
 * - query params de tracking/afiliación eliminados (no forman identidad)
 * - params restantes ordenados alfabéticamente
 */
export function normalizeProductUrl(raw: unknown): CazaResult<NormalizedUrl> {
  if (typeof raw !== 'string') return failResult([`url.type_invalid:${typeof raw}`]);
  const trimmed = raw.trim();
  if (trimmed.length === 0) return failResult(['url.empty']);
  if (trimmed.length > URL_MAX_LENGTH) return failResult(['url.too_long']);

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return failResult(['url.unparseable']);
  }

  if (parsed.protocol !== 'https:') {
    return failResult([`url.protocol_not_allowed:${parsed.protocol.replace(':', '')}`]);
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return failResult(['url.credentials_not_allowed']);
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host.length === 0) return failResult(['url.host_missing']);

  const search = new URLSearchParams();
  const keys = [...parsed.searchParams.keys()].sort();
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (STRIPPED_KEYS.has(lower)) continue;
    if (IDENTITY_STRIPPED_QUERY_PREFIXES.some((prefix) => lower.startsWith(prefix))) continue;
    const value = parsed.searchParams.get(key);
    if (value === null) continue;
    search.append(lower, value);
  }

  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  const query = search.toString();
  const url = `https://${host}${path}${query ? `?${query}` : ''}`;

  const store = resolveStoreFromHost(host);
  return okResult({ url, host, path, store });
}

export function resolveStoreFromHost(host: string): CazaStoreId | null {
  const normalized = host.toLowerCase().replace(/^www\./, '');
  for (const store of CAZAOFERTAS_STORES) {
    if (STORE_HOSTS[store].some((h) => normalized === h || normalized.endsWith(`.${h}`))) {
      return store;
    }
  }
  return null;
}

/**
 * Extrae el ID de producto de una URL cuando el patrón es público y estable.
 * No adivina: si el patrón no aparece, devuelve `null` y se usa el fallback.
 */
export function extractExternalProductIdFromUrl(
  store: CazaStoreId,
  normalizedUrl: string
): string | null {
  if (store === 'amazon_mx') {
    const asin = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i.exec(normalizedUrl);
    return asin ? asin[1].toUpperCase() : null;
  }

  if (store === 'mercadolibre_mx') {
    // Listing: /MLM-1234567890-slug   Catálogo: /p/MLM1234567890
    const listing = /\/(MLM)-?(\d{6,14})(?:[-/?]|$)/i.exec(normalizedUrl);
    if (listing) return `MLM${listing[2]}`;
    const catalog = /\/p\/(MLM\d{6,14})(?:[/?]|$)/i.exec(normalizedUrl);
    if (catalog) return catalog[1].toUpperCase();
    return null;
  }

  return null;
}

export function normalizeExternalProductId(raw: unknown): CazaResult<string> {
  if (raw === null || raw === undefined) return failResult(['external_product_id.absent']);
  if (typeof raw !== 'string') {
    return failResult([`external_product_id.type_invalid:${typeof raw}`]);
  }
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.length === 0) return failResult(['external_product_id.empty']);
  if (trimmed.length > EXTERNAL_PRODUCT_ID_MAX_LENGTH) {
    return failResult(['external_product_id.too_long']);
  }
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(trimmed)) {
    return failResult(['external_product_id.charset_invalid']);
  }
  return okResult(trimmed);
}

export interface BuildIdentityInput {
  readonly store: unknown;
  readonly url: unknown;
  readonly externalProductId?: unknown;
}

/**
 * Construye la identidad canónica.
 *
 * Precedencia:
 *  1. `externalProductId` provisto y válido
 *  2. `externalProductId` extraído de la URL canónica
 *  3. fallback: hash de la URL normalizada
 */
export function buildDealIdentity(input: BuildIdentityInput): CazaResult<DealIdentity> {
  if (!isSupportedStore(input.store)) {
    return failResult([`store.unsupported:${String(input.store)}`]);
  }
  const store = input.store;

  const normalized = normalizeProductUrl(input.url);
  if (!normalized.ok) return failResult(normalized.reasons);

  if (normalized.value.store !== null && normalized.value.store !== store) {
    return failResult([`identity.store_host_mismatch:${normalized.value.host}`]);
  }
  if (normalized.value.store === null) {
    return failResult([`identity.host_not_allowed:${normalized.value.host}`]);
  }

  let externalProductId: string | null = null;
  if (input.externalProductId !== null && input.externalProductId !== undefined) {
    const provided = normalizeExternalProductId(input.externalProductId);
    if (!provided.ok) return failResult(provided.reasons);
    externalProductId = provided.value;
  } else {
    externalProductId = extractExternalProductIdFromUrl(store, normalized.value.url);
  }

  if (externalProductId !== null) {
    return okResult({
      strategy: 'external_product_id',
      key: `${store}:pid:${externalProductId}`,
      store,
      externalProductId,
      normalizedUrl: normalized.value.url,
    });
  }

  return okResult({
    strategy: 'canonical_url',
    key: `${store}:url:${stableHash(normalized.value.url)}`,
    store,
    externalProductId: null,
    normalizedUrl: normalized.value.url,
  });
}

/** El id público del candidato deriva de la identidad, no de un contador. */
export function dealCandidateIdFromIdentity(identity: DealIdentity): string {
  return `caza_${identity.store}_${stableHash(identity.key)}`;
}
