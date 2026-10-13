import { despensaSourceForUrl } from '@/lib/despensa/sources';
import { compareWithListPrice, observedDropPercent } from '@/lib/offers/listPriceComparison';
import type { PriceInsight } from '@/lib/offers/priceHistory';
import type { PublishedPriceRelation, VerifiedReference } from '@/lib/offers/priceObservations/evaluate';
import type { PriceEvidenceLabel } from '@/lib/offers/priceObservations/policy';

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

/** Veredicto del motor de precios sobre observaciones capturadas y comparables. */
export type DespensaEngineVerdict = {
  label: PriceEvidenceLabel;
  reference: VerifiedReference | null;
  savingAmount: number | null;
  savingPct: number | null;
  availabilityConfirmed: boolean;
  policyVersion: string;
  /** Última observación válida del producto (ausente en veredictos anteriores a v2). */
  current?: { price: number; recordedAt: string } | null;
  priceRelation?: PublishedPriceRelation | null;
};

/**
 * Lo mínimo del historial propio que necesita Despensa. Con `engine`, el veredicto viene del
 * motor de precios y es el único que decide ahorro y contradicción; sin `engine` (forma legada
 * de `computePriceInsight`) se aplica la regla anterior.
 */
export type DespensaPriceHistory = Pick<PriceInsight, 'verdict' | 'max90d' | 'min90d' | 'samples90d'> & {
  engine?: DespensaEngineVerdict;
};

/**
 * Qué respalda el ahorro que se podría mostrar.
 * - `verified`: con veredicto del motor, el precio actual (observado hace < 48 h) está al menos 5 %
 *   bajo la mediana de ≥4 observaciones comparables en ≥14 días. En la forma legada, el historial
 *   (≥2 registros en 90 días) lo pone en su mínimo y antes se vio más alto. Es la única forma de
 *   mostrar una cantidad ahorrada.
 * - `price_differs`: la última lectura de la tienda (< 48 h) da otro precio que el publicado;
 *   no se respalda el publicado ni se habla de ahorro. Lleva el precio observado y su hora.
 * - `list_contradicted`: hay precio de lista, pero el historial dice que el descuento es de etiqueta.
 * - `list_unconfirmed`: hay precio de lista mayor, sin historial que lo respalde.
 * - `none`: no hay referencia; se muestra el precio observado sin hablar de ahorro.
 *
 * El precio de lista nunca es prueba suficiente: `offers.original_price` no guarda su procedencia.
 */
export type SavingEvidence =
  | {
      status: 'verified';
      amount: number;
      percent: number;
      reference: number;
      /** Solo en veredictos del motor: la referencia es la mediana propia, no el máximo. */
      basis?: 'own_history_median';
      observations?: number;
    }
  | { status: 'price_differs'; observedPrice: number; observedAt: string }
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
  const engine = history?.engine;
  if (engine) {
    if (engine.label === 'verified_saving' && engine.reference && engine.savingAmount != null && engine.savingPct != null) {
      return {
        status: 'verified',
        amount: engine.savingAmount,
        percent: Math.round(engine.savingPct),
        reference: engine.reference.price,
        basis: 'own_history_median',
        observations: engine.reference.observations,
      };
    }
    if (engine.label === 'price_differs' && engine.current) {
      return { status: 'price_differs', observedPrice: engine.current.price, observedAt: engine.current.recordedAt };
    }
    if (engine.label === 'list_contradicted') return { status: 'list_contradicted' };
    return compareWithListPrice(price, input.originalPrice) ? { status: 'list_unconfirmed' } : { status: 'none' };
  }
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
