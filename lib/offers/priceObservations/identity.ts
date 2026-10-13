import { classifyDespensaText } from '@/lib/despensa/classify';
import { parsePresentation, type Presentation } from '@/lib/despensa/presentation';
import { isMercadoLibreApiItemId, resolveMercadoLibreItem } from '@/lib/offers/resolveMercadoLibreItem';
import { PRICE_OBSERVATION_POLICY, type CaptureSourceId, type ObservationScope } from './policy';

/**
 * Identidad canónica de una observación. Dos observaciones solo son comparables si coinciden
 * el item externo (ASIN, item de Mercado Libre), la necesidad, la variante, la presentación
 * y el alcance (en línea, sucursal o zona). Nada se infiere si no se puede leer.
 */

export function presentationKey(p: Presentation | null): string | null {
  if (!p) return null;
  return `${p.dimension}:${p.totalBase}:${p.countUnit ?? '-'}`;
}

export type ProductReading = {
  needId: string | null;
  variantId: string | null;
  presentationKey: string | null;
};

export function readProduct(title: string | null | undefined): ProductReading {
  const hit = classifyDespensaText(title ?? '');
  return {
    needId: hit?.needId ?? null,
    variantId: hit?.variantId ?? null,
    presentationKey: presentationKey(parsePresentation(title)),
  };
}

export function identityKey(input: {
  sourceId: CaptureSourceId;
  externalItemId: string;
  needId: string | null;
  variantId: string | null;
  presentationKey: string | null;
}): string {
  return [
    `${input.sourceId}:${input.externalItemId}`,
    input.needId ?? '-',
    input.variantId ?? '-',
    input.presentationKey ?? 'unknown',
  ].join('|');
}

export function scopeKey(scope: ObservationScope): string {
  return `${scope.kind}:${scope.label ?? '-'}`;
}

export function dedupeBucket(observedAtMs: number): number {
  return Math.floor(observedAtMs / (PRICE_OBSERVATION_POLICY.dedupeWindowHours * 3_600_000));
}

/** Ancla del producto: el item externo en su tienda. Sobrevive a la caducidad de cada oferta. */
export type ProductAnchor = { sourceId: CaptureSourceId; externalItemId: string };

export function anchorKey(a: ProductAnchor): string {
  return `${a.sourceId}:${a.externalItemId}`;
}

/**
 * Una observación por producto (item externo), alcance y ventana de 24 h, sin importar cuántas
 * ofertas lo anclen. No depende del precio ni del título: un reintento que lea otro precio en
 * la misma ventana tampoco duplica.
 */
export function observationIdempotencyKey(input: ProductAnchor & { scope: ObservationScope; observedAtMs: number }): string {
  return [
    PRICE_OBSERVATION_POLICY.version,
    anchorKey(input),
    scopeKey(input.scope),
    `w${dedupeBucket(input.observedAtMs)}`,
  ].join('|');
}

const ASIN_PATH = /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})(?:[/?#]|$)/i;

export function asinFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)amazon\.com\.mx$/i.test(u.hostname)) return null;
    const m = u.pathname.match(ASIN_PATH);
    return m ? m[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

export type CaptureItemResolution =
  | { ok: true; externalItemId: string; canonicalUrl: string | null; catalogProductId: string | null }
  | { ok: false; reason: 'item_id_unresolved' | 'catalog_without_item' };

const normMlId = (s: string) => s.replace(/-/g, '').toUpperCase();

/**
 * Item externo de la oferta. Primero la huella guardada en la oferta (`amz:` / `ml:`),
 * luego la URL. Enlaces cortos (amzn.to, meli.la) no se resuelven: requieren red.
 *
 * Mercado Libre: un enlace de catálogo (`/p/MLM…`) sin item (`wid`, `item_id`) solo identifica
 * el producto de catálogo, no la publicación cuyo precio se observaría; elegir una sería
 * inventar. `catalogProductId` se devuelve solo junto a un item distinto, y la API confirma
 * después que ese item pertenece a ese catálogo (`pickExactCatalogItem`).
 */
export function resolveCaptureItem(
  sourceId: CaptureSourceId,
  offer: { offerUrl: string | null; productFingerprint?: string | null },
): CaptureItemResolution {
  const fp = offer.productFingerprint?.trim() ?? '';
  if (sourceId === 'amazon_mx') {
    const fromFp = fp.startsWith('amz:') ? fp.slice(4).toUpperCase() : null;
    const asin = fromFp && /^[A-Z0-9]{10}$/.test(fromFp) ? fromFp : asinFromUrl(offer.offerUrl);
    return asin
      ? { ok: true, externalItemId: asin, canonicalUrl: `https://www.amazon.com.mx/dp/${asin}`, catalogProductId: null }
      : { ok: false, reason: 'item_id_unresolved' };
  }
  const resolved = offer.offerUrl ? resolveMercadoLibreItem(offer.offerUrl) : null;
  const catalog = resolved?.catalogProductId && isMercadoLibreApiItemId(resolved.catalogProductId) ? normMlId(resolved.catalogProductId) : null;
  const urlItem =
    resolved?.itemId && isMercadoLibreApiItemId(resolved.itemId) && resolved.resolutionMethod !== 'path_catalog'
      ? normMlId(resolved.itemId)
      : null;
  const raw = fp.startsWith('ml:') ? normMlId(fp.slice(3)) : null;
  const fpItem = raw && isMercadoLibreApiItemId(raw) ? raw : null;
  const itemId = fpItem && fpItem !== catalog ? fpItem : urlItem;
  if (!itemId) return { ok: false, reason: catalog ? 'catalog_without_item' : 'item_id_unresolved' };
  return {
    ok: true,
    externalItemId: itemId,
    canonicalUrl: resolved?.canonicalUrl ?? null,
    catalogProductId: catalog && catalog !== itemId ? catalog : null,
  };
}

/** Ancla de producto de una oferta, o null si su tienda no tiene item externo resoluble. */
export function productAnchorFor(
  sourceId: CaptureSourceId | null,
  offer: { offerUrl: string | null; productFingerprint?: string | null },
): ProductAnchor | null {
  if (!sourceId) return null;
  const r = resolveCaptureItem(sourceId, offer);
  return r.ok ? { sourceId, externalItemId: r.externalItemId } : null;
}

export function captureSourceIdOf(despensaSourceId: string | null | undefined): CaptureSourceId | null {
  return despensaSourceId === 'mercadolibre_mx' || despensaSourceId === 'amazon_mx' ? despensaSourceId : null;
}

/** Mercado Libre y Amazon México publican un precio nacional en línea. */
export const ONLINE_NATIONAL_SCOPE: ObservationScope = { kind: 'online', label: 'MX' };
