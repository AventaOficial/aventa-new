/**
 * CazaOfertasss — FASE 0. Preparación de tarjeta de Telegram.
 *
 * Autoridad: esta capa PRESENTA. No valida, no puntúa, no publica.
 * `CAZAOFERTAS_PUBLICATION_BOUNDARY.telegramPublishEnabled` es `false`: aquí no
 * hay cliente HTTP, token ni envío.
 */

import { CAZAOFERTAS_PUBLICATION_BOUNDARY } from '../constants';
import type { CazaCurrency, CazaResult, DealCandidate, DealGrade } from '../types';
import { failResult, okResult } from '../types';

export const AFFILIATE_DISCLOSURE_ES =
  'Contenido con enlaces de afiliado. CazaOfertasss puede recibir una comisión por tu compra, sin costo extra para ti.';

export const PRICE_DISCLAIMER_ES =
  'Precio y disponibilidad verificados al momento de la detección; pueden cambiar sin aviso en la tienda.';

const STORE_LABELS: Readonly<Record<DealCandidate['store'], string>> = {
  mercadolibre_mx: 'Mercado Libre México',
  amazon_mx: 'Amazon México',
};

const GRADE_LABELS: Readonly<Record<DealGrade, string>> = {
  GREAT_DEAL: 'Oferta excelente',
  GOOD_DEAL: 'Buena oferta',
  REJECT: 'No publicable',
};

export interface TelegramDealCard {
  readonly dealId: string;
  readonly title: string;
  readonly storeLabel: string;
  readonly currentPriceLabel: string;
  readonly referencePriceLabel: string | null;
  readonly discountLabel: string;
  readonly scoreLabel: string;
  readonly gradeLabel: string;
  readonly ctaLabel: string;
  readonly ctaUrl: string;
  readonly affiliateDisclosure: string;
  readonly priceDisclaimer: string;
  readonly capturedAt: string;
  /** Texto plano listo para render; el provider decide el parse_mode. */
  readonly text: string;
}

/** Escapa lo mínimo para no romper renders HTML de Telegram ni inyectar markup. */
export function escapeTelegramText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatCazaPrice(value: number, currency: CazaCurrency): string {
  const formatted = value.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${formatted} ${currency}`;
}

/**
 * Genera la tarjeta. Rechaza explícitamente:
 *  - grade REJECT
 *  - candidato no monetizable (sin affiliate elegible)
 *  - descuento 0
 *
 * Un candidato sin elegibilidad de afiliado queda fuera de publicación
 * monetizada por contrato, no por olvido del llamador.
 */
export function generateTelegramCard(candidate: DealCandidate): CazaResult<TelegramDealCard> {
  const reasons: string[] = [];

  if (candidate.score.grade === 'REJECT') reasons.push('card.grade_reject');
  if (candidate.status === 'REJECTED' || candidate.status === 'EXPIRED') {
    reasons.push(`card.status_not_publishable:${candidate.status}`);
  }
  if (candidate.affiliate === null || candidate.affiliateUrl === null) {
    reasons.push('card.not_monetizable');
  }
  if (candidate.discountPercent <= 0) reasons.push('card.no_discount');

  if (reasons.length > 0) return failResult(reasons);

  const affiliateUrl = candidate.affiliateUrl as string;
  const title = escapeTelegramText(candidate.title);
  const storeLabel = STORE_LABELS[candidate.store];
  const currentPriceLabel = formatCazaPrice(candidate.currentPrice, candidate.currency);
  const referencePriceLabel =
    candidate.referencePrice === null
      ? null
      : formatCazaPrice(candidate.referencePrice, candidate.currency);
  const discountLabel = `-${candidate.discountPercent}%`;
  const scoreLabel = `${candidate.score.score}/100`;
  const gradeLabel = GRADE_LABELS[candidate.score.grade];
  const ctaLabel = 'Ver oferta';

  const lines = [
    `🔥 ${title}`,
    '',
    `Precio: ${currentPriceLabel}`,
    ...(referencePriceLabel ? [`Antes: ${referencePriceLabel}`] : []),
    `Descuento: ${discountLabel}`,
    `Tienda: ${storeLabel}`,
    `Score: ${scoreLabel} (${gradeLabel})`,
    '',
    `${ctaLabel}: ${affiliateUrl}`,
    '',
    AFFILIATE_DISCLOSURE_ES,
    PRICE_DISCLAIMER_ES,
  ];

  return okResult({
    dealId: candidate.id,
    title,
    storeLabel,
    currentPriceLabel,
    referencePriceLabel,
    discountLabel,
    scoreLabel,
    gradeLabel,
    ctaLabel,
    ctaUrl: affiliateUrl,
    affiliateDisclosure: AFFILIATE_DISCLOSURE_ES,
    priceDisclaimer: PRICE_DISCLAIMER_ES,
    capturedAt: candidate.evidence.capturedAt,
    text: lines.join('\n'),
  });
}

/** FASE 0: la publicación está apagada por contrato, no por configuración. */
export function assertTelegramPublishDisabled(): void {
  if (CAZAOFERTAS_PUBLICATION_BOUNDARY.telegramPublishEnabled) {
    throw new Error('CazaOfertasss FASE 0: la publicación en Telegram debe permanecer apagada');
  }
}
