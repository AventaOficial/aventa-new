import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { isLowQualityTitle } from '@/lib/bots/ingest/isLowQualityTitle';
import type { DealCheckResult, DealVerifierChecks } from './types';
import { DEAL_VERIFIER_THRESHOLDS } from './thresholds';

function pass(detail: string): DealCheckResult {
  return { status: 'pass', detail };
}
function warn(detail: string): DealCheckResult {
  return { status: 'warn', detail };
}
function fail(detail: string): DealCheckResult {
  return { status: 'fail', detail };
}
function unknown(detail: string): DealCheckResult {
  return { status: 'unknown', detail };
}

export function checkUrl(meta: ParsedOfferMetadata, url: string): DealCheckResult {
  const candidate = (meta.canonicalUrl || url || '').trim();
  if (!candidate) return fail('URL vacía');
  if (!/^https?:\/\//i.test(candidate)) return fail('URL inválida (sin http/https)');
  if (/account-verification|\/login|\/gz\/|\/registration/i.test(candidate)) {
    return fail('URL no es producto (login/verificación)');
  }
  return pass('URL de producto válida');
}

export function checkQuality(meta: ParsedOfferMetadata, config: BotIngestConfig): DealCheckResult {
  const title = meta.title?.trim() ?? '';
  if (!title) return fail('Título vacío');
  if (title.length < DEAL_VERIFIER_THRESHOLDS.minTitleLength) {
    return fail(`Título demasiado corto (${title.length})`);
  }
  if (isLowQualityTitle(title, config)) {
    return fail('Título marcado como baja calidad o spam');
  }
  if (!meta.imageUrl?.trim() || meta.imageUrl === '/placeholder.png') {
    return warn('Imagen ausente o placeholder');
  }
  return pass('Calidad básica OK');
}

export function checkPrice(meta: ParsedOfferMetadata): DealCheckResult {
  const price = Number(meta.discountPrice);
  if (!Number.isFinite(price) || price <= 0) return fail('Precio actual inválido');
  const original = meta.originalPrice;
  if (original == null || !Number.isFinite(original)) {
    return fail('Sin precio original verificable');
  }
  if (original <= price) return fail('Precio actual >= precio original');
  return pass('Precios coherentes');
}

/** Gap card vs effective cuando ambos son números finitos. */
export function discountGap(meta: ParsedOfferMetadata): number | null {
  const card = Number(meta.discountPercent);
  const effective = meta.signals?.effectiveDiscountPercent;
  if (!Number.isFinite(card)) return null;
  if (effective == null || !Number.isFinite(Number(effective))) return null;
  return card - Number(effective);
}

export function hasSuspiciousDiscountGap(meta: ParsedOfferMetadata): boolean {
  const gap = discountGap(meta);
  if (gap == null) return false;
  return gap >= DEAL_VERIFIER_THRESHOLDS.discountGapReview;
}

export function checkDiscount(meta: ParsedOfferMetadata, config: BotIngestConfig): DealCheckResult {
  const d = Number(meta.discountPercent);
  if (!Number.isFinite(d)) return fail('Descuento no numérico');
  if (d <= 0) return fail('Descuento 0% — no es oferta');
  if (d < config.minDiscountPercent) {
    return fail(`Descuento ${d}% < mínimo ${config.minDiscountPercent}%`);
  }
  if (d > DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap) {
    return fail(`Descuento ${d}% por encima del tope ${DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap}%`);
  }

  const gap = discountGap(meta);
  if (gap != null && gap >= DEAL_VERIFIER_THRESHOLDS.discountGapReview) {
    const effective = Number(meta.signals?.effectiveDiscountPercent);
    return warn(
      `suspicious_discount_gap: card ${d}% vs effective ${effective}% (gap ${gap} ≥ ${DEAL_VERIFIER_THRESHOLDS.discountGapReview})`
    );
  }

  if (meta.signals?.suspectedArtificialListPrice) {
    return warn('Descuento de etiqueta con lista artificial sospechosa — no auto-approve');
  }

  return pass(`Descuento ${d}% dentro de rango`);
}

export function checkRisk(meta: ParsedOfferMetadata): DealCheckResult {
  if (meta.signals?.suspectedArtificialListPrice) {
    return warn('Price Engine sospecha precio de lista artificial');
  }
  if (hasSuspiciousDiscountGap(meta)) {
    return warn('Gap grande entre descuento de card y effectiveDiscountPercent');
  }
  return pass('Sin señales de riesgo fuertes');
}

export function checkSeller(meta: ParsedOfferMetadata, source: string): DealCheckResult {
  const store = meta.store?.trim();
  if (!store) return unknown('Tienda/fuente desconocida');
  if (source === 'ml_worker' || source === 'ml_api') {
    return unknown('Marketplace ML: reputación de vendedor no disponible en este path');
  }
  if (source === 'amazon_asin' || store.toLowerCase().includes('amazon')) {
    const avg = meta.signals?.ratingAverage;
    const count = meta.signals?.ratingCount;
    if (avg != null && count != null && count > 0) {
      return pass(`Amazon rating ${avg} (${count} reviews)`);
    }
    return unknown('Amazon sin rating en señales');
  }
  return unknown(`Fuente ${source}: sin señales de vendedor`);
}

export function checkAvailability(): DealCheckResult {
  // Sin requests externos en FASE 3.
  return unknown('Disponibilidad no verificada (sin fetch extra)');
}

/**
 * Dedupe pre-check del Verifier (honesto).
 * - duplicateOfferId → fail
 * - duplicateChecked === true sin id → pass (comprobación real sin match)
 * - sin comprobación → unknown (NO pass)
 */
export function checkDuplicateKnown(opts: {
  duplicateOfferId?: string | null;
  duplicateChecked?: boolean;
}): DealCheckResult {
  if (opts.duplicateOfferId) {
    return fail(`Duplicado de oferta existente (${opts.duplicateOfferId})`);
  }
  if (opts.duplicateChecked === true) {
    return pass('Sin duplicado en pre-check');
  }
  return unknown('duplicate_not_checked');
}

export function emptyChecks(): DealVerifierChecks {
  return {
    price: unknown('no evaluado'),
    discount: unknown('no evaluado'),
    duplicate: unknown('no evaluado'),
    seller: unknown('no evaluado'),
    availability: unknown('no evaluado'),
    quality: unknown('no evaluado'),
    risk: unknown('no evaluado'),
  };
}
