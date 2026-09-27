/**
 * Lectura del operador. No cambia el conteo que persiste el envío.
 * `duplicates` del submit incluye ofertas ya existentes; aquí quedan separadas.
 */

export type AcquisitionOperatorReceipt = {
  received: number;
  valid: number;
  duplicates: number;
  existing: number;
  sentToReview: number;
  rejected: number;
};

export function acquisitionOperatorReceipt(input: {
  received: number;
  accepted: number;
  duplicates: number;
  invalid: number;
  overCap: number;
  idempotent: number;
  items: Array<{ outcome: string }>;
  forwarded: number;
}): AcquisitionOperatorReceipt {
  const existing = input.items.filter((item) => item.outcome === 'existing_offer').length;
  const failed = input.items.filter(
    (item) => item.outcome === 'lookup_failed' || item.outcome === 'persist_failed',
  ).length;
  return {
    received: input.received,
    valid: input.accepted,
    duplicates: Math.max(0, input.duplicates - existing) + input.idempotent,
    existing,
    sentToReview: input.forwarded,
    rejected: input.invalid + input.overCap + failed,
  };
}
