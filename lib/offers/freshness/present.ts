import { isOfferExpiredByExpiresAt } from '@/lib/votes/offerVoteEligibility';
import { FRESHNESS_STALE_AFTER_MS } from '@/lib/offers/freshness/policy';

/**
 * Public freshness. Canonical DB statuses stay available | price_changed | out_of_stock | unknown | error.
 * healthy === available and recently checked. unavailable === out_of_stock.
 * announce=false when there is no health row yet, so the catalog is not bannered before the queue runs.
 */
export type PublicFreshnessState =
  | 'healthy'
  | 'price_changed'
  | 'unavailable'
  | 'expired'
  | 'unknown'
  | 'error';

export type OfferFreshnessPresentation = {
  state: PublicFreshnessState;
  indexable: boolean;
  ctaEnabled: boolean;
  ctaLabel: string;
  announce: boolean;
  label: string;
  detail: string;
  schemaAvailability: string;
  lastCheckedAt: string | null;
};

export function presentOfferFreshness(input: {
  expiresAt: string | null;
  deletedAt?: string | null;
  healthStatus?: string | null;
  lastCheckedAt?: string | null;
  /** True only when the stored diagnostic is a confirmed http 404 or 410. */
  confirmedGone?: boolean;
  now?: Date;
  staleAfterMs?: number;
}): OfferFreshnessPresentation {
  const now = input.now ?? new Date();
  const staleAfter = input.staleAfterMs ?? FRESHNESS_STALE_AFTER_MS;
  const lastCheckedAt = input.lastCheckedAt ?? null;

  if (input.deletedAt) {
    return {
      state: 'expired',
      indexable: false,
      ctaEnabled: false,
      ctaLabel: 'Oferta retirada',
      announce: false,
      label: 'Oferta retirada',
      detail: 'Esta publicación ya no está disponible.',
      schemaAvailability: 'https://schema.org/Discontinued',
      lastCheckedAt,
    };
  }

  if (isOfferExpiredByExpiresAt(input.expiresAt, now.getTime())) {
    return {
      state: 'expired',
      indexable: false,
      ctaEnabled: true,
      ctaLabel: 'Comprobar oferta',
      announce: true,
      label: 'Puede haber cambiado',
      detail: 'El precio puede haber cambiado desde que se publicó. La ficha sigue como referencia.',
      schemaAvailability: 'https://schema.org/OutOfStock',
      lastCheckedAt,
    };
  }

  if (input.healthStatus === 'out_of_stock') {
    if (input.confirmedGone) {
      return {
        state: 'unavailable',
        indexable: false,
        ctaEnabled: false,
        ctaLabel: 'Oferta no disponible',
        announce: true,
        label: 'Oferta no disponible',
        detail: 'La tienda respondió que esta página ya no existe.',
        schemaAvailability: 'https://schema.org/OutOfStock',
        lastCheckedAt,
      };
    }
    return {
      state: 'unavailable',
      indexable: true,
      ctaEnabled: true,
      ctaLabel: 'Comprobar oferta',
      announce: true,
      label: 'Sin confirmación',
      detail: 'El precio puede haber cambiado desde que se publicó. No confirmamos que esté agotada.',
      schemaAvailability: 'https://schema.org/LimitedAvailability',
      lastCheckedAt,
    };
  }

  if (input.healthStatus === 'price_changed') {
    return {
      state: 'price_changed',
      indexable: true,
      ctaEnabled: true,
      ctaLabel: 'Verificar precio',
      announce: true,
      label: 'El precio cambió',
      detail: 'El precio en la tienda ya no coincide con el publicado. Revisa el precio actual antes de comprar.',
      schemaAvailability: 'https://schema.org/LimitedAvailability',
      lastCheckedAt,
    };
  }

  if (input.healthStatus === 'error') {
    return {
      state: 'error',
      indexable: true,
      ctaEnabled: true,
      ctaLabel: 'Comprobar oferta',
      announce: true,
      label: 'No pudimos verificar',
      detail: 'La última revisión falló. La oferta puede seguir activa; confirma el precio en la tienda.',
      schemaAvailability: 'https://schema.org/LimitedAvailability',
      lastCheckedAt,
    };
  }

  const checkedMs = lastCheckedAt ? now.getTime() - new Date(lastCheckedAt).getTime() : Number.POSITIVE_INFINITY;
  const stale = !Number.isFinite(checkedMs) || checkedMs > staleAfter;
  const awaiting = !input.healthStatus || input.healthStatus === 'unknown' || stale;

  if (awaiting) {
    const instrumented = Boolean(input.healthStatus) || Boolean(lastCheckedAt);
    return {
      state: 'unknown',
      indexable: true,
      ctaEnabled: true,
      ctaLabel: 'Comprobar oferta',
      announce: instrumented,
      label: 'Sin verificación reciente',
      detail: 'Aún no tenemos una verificación reciente de precio y disponibilidad.',
      schemaAvailability: 'https://schema.org/LimitedAvailability',
      lastCheckedAt,
    };
  }

  return {
    state: 'healthy',
    indexable: true,
    ctaEnabled: true,
    ctaLabel: 'Cazar oferta',
    announce: false,
    label: 'Verificada',
    detail: 'La última revisión encontró la oferta disponible cerca del precio publicado.',
    schemaAvailability: 'https://schema.org/InStock',
    lastCheckedAt,
  };
}
