/**
 * Hueco para historial de precio.
 * lowest, average y trend quedan vacíos hasta que exista una serie persistida.
 * No se calculan a partir de una sola observación.
 */
export type PriceObservation = {
  amountMinor: bigint;
  currency: string;
  observedAt: string;
};

export type PriceHistorySummary = {
  current: PriceObservation | null;
  lowest: null;
  average: null;
  trend: null;
  reason: 'not_persisted';
};

export function priceHistoryFromCurrent(current: PriceObservation | null): PriceHistorySummary {
  return {
    current,
    lowest: null,
    average: null,
    trend: null,
    reason: 'not_persisted',
  };
}
