import { despensaSourceForUrl } from '@/lib/despensa/sources';
import { compareWithListPrice, observedDropPercent } from '@/lib/offers/listPriceComparison';
import type { PriceInsight } from '@/lib/offers/priceHistory';

/**
 * Nivel de evidencia del precio con los datos que el feed tiene de verdad.
 *
 * - `published_with_validity`: tienda identificable y vigencia conocida y futura.
 * - `published_source`: tienda identificable por el dominio de la oferta.
 * - `reported`: precio enviado sin tienda identificable (comunidad u otro origen).
 * - `incomplete`: falta precio o título.
 *
 * `history_confirmed` existe en el contrato, pero hoy nunca se asigna: el historial propio
 * (`offer_price_snapshots`) solo decide si hay ahorro verificable (`savingEvidence`), no si el
 * precio actual sigue vigente en tienda.
 */
export type EvidenceLevel =
  | 'history_confirmed'
  | 'published_with_validity'
  | 'published_source'
  | 'reported'
  | 'incomplete';

export const EVIDENCE_RANK: Record<EvidenceLevel, number> = {
  history_confirmed: 0,
  published_with_validity: 1,
  published_source: 2,
  reported: 3,
  incomplete: 4,
};

export type EvidenceInput = {
  title?: string | null;
  price?: number | null;
  sourceUrl?: string | null;
  sourceHost?: string | null;
  expiresAt?: string | null;
};

export function evidenceLevel(input: EvidenceInput, now: Date): EvidenceLevel {
  if (!input.title?.trim() || input.price == null || !(input.price > 0)) return 'incomplete';
  const url = input.sourceUrl ?? (input.sourceHost ? `https://${input.sourceHost}` : null);
  const source = despensaSourceForUrl(url);
  if (!source) return 'reported';
  const expires = input.expiresAt ? Date.parse(input.expiresAt) : NaN;
  if (Number.isFinite(expires) && expires > now.getTime()) return 'published_with_validity';
  return 'published_source';
}

/** Lo mínimo del historial propio (`computePriceInsight`) que necesita Despensa. */
export type DespensaPriceHistory = Pick<PriceInsight, 'verdict' | 'max90d' | 'min90d' | 'samples90d'>;

/**
 * Qué respalda el ahorro que se podría mostrar.
 * - `verified`: el historial propio de Aventa (≥2 registros en 90 días) pone el precio actual
 *   en su mínimo y antes se vio más alto. Es la única forma de mostrar una cantidad ahorrada.
 * - `list_contradicted`: hay precio de lista, pero el historial dice que el descuento es de etiqueta.
 * - `list_unconfirmed`: hay precio de lista mayor, sin historial que lo respalde.
 * - `none`: no hay referencia; se muestra el precio observado sin hablar de ahorro.
 *
 * El precio de lista nunca es prueba suficiente: `offers.original_price` no guarda su procedencia.
 */
export type SavingEvidence =
  | { status: 'verified'; amount: number; percent: number; reference: number }
  | { status: 'list_contradicted' }
  | { status: 'list_unconfirmed' }
  | { status: 'none' };

export function savingEvidence(input: {
  price?: number | null;
  originalPrice?: number | null;
  history?: DespensaPriceHistory | null;
}): SavingEvidence {
  const price = input.price ?? null;
  if (price == null || !(price > 0)) return { status: 'none' };
  const history = input.history;
  if (history) {
    const percent = observedDropPercent({ ...history, current: price } as PriceInsight);
    if (percent != null && history.max90d != null) {
      return { status: 'verified', amount: Math.round((history.max90d - price) * 100) / 100, percent, reference: history.max90d };
    }
  }
  if (!compareWithListPrice(price, input.originalPrice)) return { status: 'none' };
  return history?.verdict === 'label_only' ? { status: 'list_contradicted' } : { status: 'list_unconfirmed' };
}

export type Freshness = 'fresh' | 'recent' | 'stale' | 'unknown';

export function evidenceFreshness(observedAt: string | null | undefined, now: Date, maxAgeDays: number): Freshness {
  const t = observedAt ? Date.parse(observedAt) : NaN;
  if (!Number.isFinite(t)) return 'unknown';
  const ageDays = (now.getTime() - t) / 86_400_000;
  if (ageDays > maxAgeDays) return 'stale';
  if (ageDays <= 2) return 'fresh';
  return 'recent';
}
