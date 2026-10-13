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

/**
 * Una observación por oferta, item externo, alcance y ventana de 24 h. No depende del precio
 * ni del título: un reintento que lea otro precio en la misma ventana tampoco duplica.
 */
export function observationIdempotencyKey(input: {
  offerId: string;
  sourceId: CaptureSourceId;
  externalItemId: string;
  scope: ObservationScope;
  observedAtMs: number;
}): string {
  return [
    PRICE_OBSERVATION_POLICY.version,
    input.offerId,
    `${input.sourceId}:${input.externalItemId}`,
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

/**
 * Item externo de la oferta. Primero la huella guardada en la oferta (`amz:` / `ml:`),
 * luego la URL. Enlaces cortos (amzn.to, meli.la) no se resuelven: requieren red.
 */
export function externalItemFor(
  sourceId: CaptureSourceId,
  offer: { offerUrl: string | null; productFingerprint?: string | null },
): { externalItemId: string; canonicalUrl: string | null } | null {
  const fp = offer.productFingerprint?.trim() ?? '';
  if (sourceId === 'amazon_mx') {
    const fromFp = fp.startsWith('amz:') ? fp.slice(4).toUpperCase() : null;
    const asin = fromFp && /^[A-Z0-9]{10}$/.test(fromFp) ? fromFp : asinFromUrl(offer.offerUrl);
    return asin ? { externalItemId: asin, canonicalUrl: `https://www.amazon.com.mx/dp/${asin}` } : null;
  }
  const resolved = offer.offerUrl ? resolveMercadoLibreItem(offer.offerUrl) : null;
  const fromFp = fp.startsWith('ml:') ? fp.slice(3).replace(/-/g, '').toUpperCase() : null;
  const itemId =
    fromFp && isMercadoLibreApiItemId(fromFp)
      ? fromFp
      : resolved?.itemId && isMercadoLibreApiItemId(resolved.itemId)
        ? resolved.itemId.replace(/-/g, '').toUpperCase()
        : null;
  return itemId ? { externalItemId: itemId, canonicalUrl: resolved?.canonicalUrl ?? null } : null;
}

/** Mercado Libre y Amazon México publican un precio nacional en línea. */
export const ONLINE_NATIONAL_SCOPE: ObservationScope = { kind: 'online', label: 'MX' };
