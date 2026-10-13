import { dedupeBucket } from './identity';
import { PRICE_OBSERVATION_POLICY as P, type ObservedAvailability, type ValidationStatus } from './policy';

export type ValidationReason =
  | 'invalid_price'
  | 'currency_unconfirmed'
  | 'currency_not_mxn'
  | 'observed_at_invalid'
  | 'observed_at_in_future'
  | 'presentation_mismatch'
  | 'variant_mismatch'
  | 'need_mismatch'
  | 'extreme_change_needs_review'
  | 'confirmed_by_persistence'
  | 'presentation_unknown'
  | 'scope_unknown'
  | 'availability_unknown'
  | 'out_of_stock';

/** Observación recién leída de la fuente, antes de persistir. */
export type CapturedObservation = {
  price: number;
  currency: string | null;
  observedAt: string;
  availability: ObservedAvailability;
  scopeKind: 'online' | 'store' | 'zone' | 'unknown';
  /** Lectura del título que devolvió la fuente; null si la fuente no lo dio. */
  observed: { needId: string | null; variantId: string | null; presentationKey: string | null } | null;
  /** Lectura del título de la oferta publicada. */
  offer: { needId: string | null; variantId: string | null; presentationKey: string | null };
};

/** Observaciones previas de la misma identidad y alcance (cualquier estado), más nuevas primero. */
export type PriorForValidation = readonly { price: number; recordedAt: string; status: ValidationStatus | null; reasons: readonly string[] }[];

export type ValidationResult = { status: ValidationStatus; reasons: ValidationReason[] };

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function within(a: number, b: number, pct: number): boolean {
  return Math.abs(a - b) <= (Math.max(a, b) * pct) / 100;
}

/**
 * Validación determinista. Las inválidas y en cuarentena también se guardan: el estado decide
 * si cuentan, no si se conservan.
 *
 * - Inválida: precio no positivo, moneda distinta de MXN o sin confirmar, fecha imposible,
 *   o la fuente describe otra presentación, variante o necesidad que la oferta.
 * - Cuarentena: cambio extremo frente a la mediana de observaciones válidas previas. Se acepta
 *   si las últimas observaciones en cuarentena (en ventanas distintas) ya confirmaron ese precio.
 * - Válida con avisos: presentación, alcance o disponibilidad desconocidos, o producto agotado.
 *   Esos avisos la sacan del cálculo de ahorro, pero la observación es verdadera.
 */
export function validateCapturedObservation(obs: CapturedObservation, prior: PriorForValidation, now: Date): ValidationResult {
  const invalid: ValidationReason[] = [];
  if (!(Number.isFinite(obs.price) && obs.price > 0)) invalid.push('invalid_price');
  if (!obs.currency) invalid.push('currency_unconfirmed');
  else if (obs.currency !== 'MXN') invalid.push('currency_not_mxn');
  const observedMs = Date.parse(obs.observedAt);
  if (!Number.isFinite(observedMs)) invalid.push('observed_at_invalid');
  else if (observedMs > now.getTime() + P.futureSkewMs) invalid.push('observed_at_in_future');

  const o = obs.observed;
  if (o) {
    if (o.needId && obs.offer.needId && o.needId !== obs.offer.needId) invalid.push('need_mismatch');
    if (o.variantId && obs.offer.variantId && o.variantId !== obs.offer.variantId) invalid.push('variant_mismatch');
    if (o.presentationKey && obs.offer.presentationKey && o.presentationKey !== obs.offer.presentationKey) {
      invalid.push('presentation_mismatch');
    }
  }
  if (invalid.length > 0) return { status: 'invalid', reasons: invalid };

  const notes: ValidationReason[] = [];
  const presentation = o?.presentationKey ?? obs.offer.presentationKey;
  if (!presentation) notes.push('presentation_unknown');
  if (obs.scopeKind === 'unknown') notes.push('scope_unknown');
  if (obs.availability === 'unknown') notes.push('availability_unknown');
  if (obs.availability === 'out_of_stock') {
    notes.push('out_of_stock');
    return { status: 'valid', reasons: notes };
  }

  const windowStart = observedMs - P.windowDays * 86_400_000;
  const validPrior = prior.filter((r) => r.status === 'valid' && Date.parse(r.recordedAt) >= windowStart).map((r) => r.price);
  if (validPrior.length === 0) return { status: 'valid', reasons: notes };

  const ref = median(validPrior);
  const ratio = obs.price / ref;
  if (ratio >= P.extremeLowRatio && ratio <= P.extremeHighRatio) return { status: 'valid', reasons: notes };

  const persistenceStart = observedMs - P.persistenceWindowDays * 86_400_000;
  const currentBucket = dedupeBucket(observedMs);
  const confirmations = new Set<number>();
  for (const r of prior) {
    const t = Date.parse(r.recordedAt);
    if (t < persistenceStart) break;
    if (r.status !== 'quarantined' || !r.reasons.includes('extreme_change_needs_review')) break;
    if (!within(r.price, obs.price, P.persistenceTolerancePct)) break;
    const bucket = dedupeBucket(t);
    if (bucket !== currentBucket) confirmations.add(bucket);
  }
  if (confirmations.size >= P.persistenceConfirmations) {
    return { status: 'valid', reasons: [...notes, 'confirmed_by_persistence'] };
  }
  return { status: 'quarantined', reasons: [...notes, 'extreme_change_needs_review'] };
}
