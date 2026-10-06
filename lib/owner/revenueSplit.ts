export type RevenueSplit =
  | { ok: true; confirmedPct: number; estimatedPct: number }
  | { ok: false; reason: 'insufficient' };

/**
 * Partes del donut a partir de centavos reales.
 * Sin total, sin una de las dos cifras, o con valores inválidos: no hay porcentaje.
 */
export function revenueDonutSplit(
  confirmedCents: number | null | undefined,
  estimatedCents: number | null | undefined,
): RevenueSplit {
  if (confirmedCents == null || estimatedCents == null) return { ok: false, reason: 'insufficient' };
  if (!Number.isFinite(confirmedCents) || !Number.isFinite(estimatedCents)) {
    return { ok: false, reason: 'insufficient' };
  }
  if (confirmedCents < 0 || estimatedCents < 0) return { ok: false, reason: 'insufficient' };
  const total = confirmedCents + estimatedCents;
  if (total === 0) return { ok: false, reason: 'insufficient' };
  const confirmedPct = (confirmedCents / total) * 100;
  const estimatedPct = (estimatedCents / total) * 100;
  return { ok: true, confirmedPct, estimatedPct };
}
