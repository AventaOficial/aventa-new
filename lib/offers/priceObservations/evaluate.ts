import { dedupeBucket, scopeKey } from './identity';
import {
  CORRECTION_SOURCES,
  PRICE_OBSERVATION_POLICY as P,
  round2,
  toPrice,
  type PriceEvidenceLabel,
  type StoredObservationRow,
  type ValidationStatus,
} from './policy';

export type ExclusionReason =
  | 'before_correction'
  | 'legacy_unscoped'
  | 'not_valid'
  | 'out_of_stock'
  | 'currency_not_mxn'
  | 'outside_window'
  | 'presentation_unknown'
  | 'scope_unknown'
  | 'different_identity'
  | 'different_scope';

export type EvaluationReason =
  | 'history_incomplete'
  | 'no_history'
  | 'no_current_observation'
  | 'current_out_of_stock'
  | 'current_stale'
  | 'current_price_mismatch'
  | 'current_not_comparable'
  | 'single_observation'
  | 'insufficient_history'
  | 'no_drop'
  | 'verified_drop';

/** Referencia del ahorro verificado: mediana del historial propio comparable. */
export type VerifiedReference = {
  kind: 'own_history_median';
  price: number;
  observations: number;
  spanDays: number;
};

export type PriceHistoryEvaluation = {
  label: PriceEvidenceLabel;
  reasons: EvaluationReason[];
  verdict: 'strong' | 'fair' | 'label_only' | 'insufficient';
  /** Ventanas de 24 h independientes en la serie comparable, incluida la actual. */
  samples: number;
  min: number | null;
  max: number | null;
  reference: VerifiedReference | null;
  savingAmount: number | null;
  savingPct: number | null;
  /** La serie usada: identidad + alcance de la observación actual. */
  seriesKey: string | null;
  availabilityConfirmed: boolean;
  excluded: Partial<Record<ExclusionReason, number>>;
  policyVersion: string;
};

export type EvaluateInput = {
  /** Filas de una sola oferta en cualquier orden. */
  rows: readonly StoredObservationRow[];
  /** false si la lectura falló o llegó recortada: no se puede afirmar nada con un historial parcial. */
  historyComplete: boolean;
  currentPrice: number | null;
  originalPrice: number | null;
  now: Date;
};

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Point = { price: number; ms: number; bucket: number };

function seriesOf(row: StoredObservationRow): string {
  return `${row.identity_key}|${scopeKey({ kind: row.scope_kind ?? 'unknown', label: row.scope_label ?? null })}`;
}

function listLabel(currentPrice: number | null, originalPrice: number | null): PriceEvidenceLabel | null {
  return currentPrice != null && originalPrice != null && originalPrice > currentPrice ? 'list_unconfirmed' : null;
}

/**
 * Veredicto del historial capturado de una oferta. Pura y determinista.
 *
 * Ahorro verificado exige todo lo siguiente:
 * - historial completo (sin errores ni recortes de consulta);
 * - observación actual válida, disponible, en MXN, de hace menos de 48 h y con el mismo precio
 *   que el publicado;
 * - al menos 4 ventanas de 24 h previas, repartidas en 14 días o más, de la misma identidad
 *   (item, necesidad, variante, presentación) y el mismo alcance;
 * - una bajada de al menos 5 % frente a la mediana de esas observaciones.
 * Nunca se usa el precio de lista como referencia y nunca alcanza una sola fila.
 */
export function evaluatePriceHistory(input: EvaluateInput): PriceHistoryEvaluation {
  const excluded: Partial<Record<ExclusionReason, number>> = {};
  const bump = (r: ExclusionReason) => {
    excluded[r] = (excluded[r] ?? 0) + 1;
  };
  const base = {
    reference: null,
    savingAmount: null,
    savingPct: null,
    seriesKey: null,
    availabilityConfirmed: false,
    excluded,
    policyVersion: P.version,
  };
  const listOnly = listLabel(input.currentPrice, input.originalPrice);
  const fallback = (reasons: EvaluationReason[], samples = 0, min: number | null = null, max: number | null = null): PriceHistoryEvaluation => ({
    ...base,
    label: listOnly ?? 'insufficient',
    reasons,
    verdict: 'insufficient',
    samples,
    min,
    max,
  });

  if (!input.historyComplete) return fallback(['history_incomplete']);

  const nowMs = input.now.getTime();
  const windowStart = nowMs - P.windowDays * 86_400_000;
  const sorted = [...input.rows].sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at));

  const captured: StoredObservationRow[] = [];
  let corrected = false;
  for (const row of sorted) {
    if (corrected) {
      bump('before_correction');
      continue;
    }
    if (row.source && CORRECTION_SOURCES.has(row.source)) corrected = true;
    if (row.source !== 'capture' || !row.identity_key) {
      bump('legacy_unscoped');
      continue;
    }
    const ms = Date.parse(row.recorded_at);
    if (!Number.isFinite(ms) || ms < windowStart || ms > nowMs + P.futureSkewMs) {
      bump('outside_window');
      continue;
    }
    if (row.validation_status !== 'valid') {
      bump('not_valid');
      continue;
    }
    if (row.currency !== 'MXN') {
      bump('currency_not_mxn');
      continue;
    }
    captured.push(row);
  }
  if (captured.length === 0) return fallback(['no_history']);

  const latest = captured[0];
  const latestPrice = toPrice(latest.price);
  if (latest.availability === 'out_of_stock') return fallback(['current_out_of_stock']);
  if (!latest.presentation_key || latest.scope_kind == null || latest.scope_kind === 'unknown' || latestPrice == null) {
    return fallback(['current_not_comparable']);
  }

  const series = seriesOf(latest);
  const latestIdentity = latest.identity_key;
  const points: Point[] = [];
  for (const row of captured) {
    if (row.availability === 'out_of_stock') {
      bump('out_of_stock');
      continue;
    }
    if (!row.presentation_key) {
      bump('presentation_unknown');
      continue;
    }
    if (!row.scope_kind || row.scope_kind === 'unknown') {
      bump('scope_unknown');
      continue;
    }
    if (seriesOf(row) !== series) {
      bump(row.identity_key !== latestIdentity ? 'different_identity' : 'different_scope');
      continue;
    }
    const price = toPrice(row.price);
    if (price == null || !(price > 0)) continue;
    const ms = Date.parse(row.recorded_at);
    points.push({ price, ms, bucket: dedupeBucket(ms) });
  }

  // Una observación por ventana de 24 h (la más reciente de cada ventana).
  const byBucket = new Map<number, Point>();
  for (const p of points) if (!byBucket.has(p.bucket)) byBucket.set(p.bucket, p);
  const independent = [...byBucket.values()].sort((a, b) => b.ms - a.ms);
  const current = independent[0];
  const prior = independent.slice(1);
  const prices = independent.map((p) => p.price);
  const min = round2(Math.min(...prices));
  const max = round2(Math.max(...prices));
  const samples = independent.length;
  const availabilityConfirmed = latest.availability === 'in_stock' || latest.availability === 'limited';

  const withSeries = (e: Omit<PriceHistoryEvaluation, 'seriesKey' | 'availabilityConfirmed' | 'excluded' | 'policyVersion'>): PriceHistoryEvaluation => ({
    ...e,
    seriesKey: series,
    availabilityConfirmed,
    excluded,
    policyVersion: P.version,
  });

  const notCurrent = (reason: EvaluationReason) =>
    withSeries({ label: listOnly ?? 'insufficient', reasons: [reason], verdict: 'insufficient', samples, min, max, reference: null, savingAmount: null, savingPct: null });

  if (nowMs - current.ms > P.maxCurrentAgeHours * 3_600_000) return notCurrent('current_stale');
  if (input.currentPrice == null || Math.abs(current.price - input.currentPrice) > P.currentPriceToleranceMxn) {
    return notCurrent('current_price_mismatch');
  }

  const observed = (reason: EvaluationReason, verdict: PriceHistoryEvaluation['verdict'], reference: VerifiedReference | null) =>
    withSeries({ label: listOnly ?? 'observed_price', reasons: [reason], verdict, samples, min, max, reference, savingAmount: null, savingPct: null });

  if (prior.length === 0) return observed('single_observation', 'insufficient', null);
  const spanDays = (prior[0].ms - prior[prior.length - 1].ms) / 86_400_000;
  if (prior.length < P.minIndependentObservations || spanDays < P.minHistorySpanDays) {
    return observed('insufficient_history', 'insufficient', null);
  }

  const reference: VerifiedReference = {
    kind: 'own_history_median',
    price: round2(median(prior.map((p) => p.price))),
    observations: prior.length,
    spanDays: Math.round(spanDays * 10) / 10,
  };
  const difference = round2(reference.price - current.price);
  const pct = Math.round((difference / reference.price) * 1000) / 10;

  if (pct >= P.minVerifiedDropPct) {
    return withSeries({
      label: 'verified_saving',
      reasons: ['verified_drop'],
      verdict: 'strong',
      samples,
      min,
      max,
      reference,
      savingAmount: difference,
      savingPct: pct,
    });
  }

  const priorMax = Math.max(...prior.map((p) => p.price));
  const list = input.originalPrice;
  if (list != null && input.currentPrice != null && list > input.currentPrice && priorMax < list * (1 - P.listSeenTolerancePct / 100)) {
    return withSeries({ label: 'list_contradicted', reasons: ['no_drop'], verdict: 'label_only', samples, min, max, reference, savingAmount: null, savingPct: null });
  }
  return observed('no_drop', 'fair', reference);
}

export type DailyAggregate = {
  seriesKey: string;
  day: string;
  /** Conteo por estado: las inválidas y en cuarentena no desaparecen al agregar. */
  statusCounts: Record<ValidationStatus | 'legacy', number>;
  outOfStock: number;
  /** Estadísticos solo con filas válidas, disponibles y en MXN. */
  valid: { count: number; min: number; max: number; median: number } | null;
};

/** Resumen diario por serie (identidad + alcance) que conserva los estados de validación. */
export function aggregateDailyObservations(rows: readonly StoredObservationRow[]): DailyAggregate[] {
  const groups = new Map<string, { seriesKey: string; day: string; rows: StoredObservationRow[] }>();
  for (const row of rows) {
    const ms = Date.parse(row.recorded_at);
    if (!Number.isFinite(ms)) continue;
    const seriesKey = row.identity_key ? seriesOf(row) : `legacy:${row.offer_id}`;
    const day = new Date(ms).toISOString().slice(0, 10);
    const key = `${seriesKey}#${day}`;
    const g = groups.get(key) ?? { seriesKey, day, rows: [] };
    g.rows.push(row);
    groups.set(key, g);
  }
  const out: DailyAggregate[] = [];
  for (const g of groups.values()) {
    const statusCounts: DailyAggregate['statusCounts'] = { valid: 0, quarantined: 0, invalid: 0, superseded: 0, legacy: 0 };
    let outOfStock = 0;
    const validPrices: number[] = [];
    for (const r of g.rows) {
      statusCounts[r.validation_status ?? 'legacy'] += 1;
      if (r.availability === 'out_of_stock') {
        outOfStock += 1;
        continue;
      }
      const price = toPrice(r.price);
      if (r.validation_status === 'valid' && r.currency === 'MXN' && price != null && price > 0) validPrices.push(price);
    }
    out.push({
      seriesKey: g.seriesKey,
      day: g.day,
      statusCounts,
      outOfStock,
      valid: validPrices.length
        ? { count: validPrices.length, min: round2(Math.min(...validPrices)), max: round2(Math.max(...validPrices)), median: round2(median(validPrices)) }
        : null,
    });
  }
  return out.sort((a, b) => (a.seriesKey === b.seriesKey ? a.day.localeCompare(b.day) : a.seriesKey.localeCompare(b.seriesKey)));
}
