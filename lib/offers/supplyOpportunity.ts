/**
 * PUNTO DE EXTENSIÓN — supply intelligence.
 *
 * Hoy: cuando el hunter reencuentra un producto que ya existe, descarta el candidato
 * como duplicado aunque venga MÁS BARATO. Esto solo MIDE cuánta oferta mejor se está
 * tirando. No inserta, no actualiza la oferta viva, no crea versiones.
 *
 * Para convertirlo en acción haría falta, en este orden:
 *   1. versionado de oferta (histórico de precio por oferta, no solo por producto);
 *   2. política de actualización sobre filas vivas (¿editar la pending o crear una nueva?);
 *   3. reglas de atribución (quién “trae” la oferta si el bot la mejora).
 * Nada de eso existe todavía y no debe improvisarse aquí.
 */

/** Bajo esto es ruido de redondeo o de impuestos, no una oportunidad real. */
export const SUPPLY_OPPORTUNITY_MIN_IMPROVEMENT_PCT = 5;

export type SupplyOpportunityInput = {
  /** Precio del candidato que el hunter acaba de encontrar. */
  candidatePrice: number | null | undefined;
  /** Precio de la oferta que ya existe y bloquea el insert. */
  existingPrice: number | null | undefined;
  minImprovementPct?: number;
};

/**
 * True si el candidato descartado era mejor oferta que la existente.
 * Fail-closed: sin precios utilizables devuelve false (no inventa oportunidades).
 */
export function isSupplyOpportunity(input: SupplyOpportunityInput): boolean {
  const candidate = input.candidatePrice;
  const existing = input.existingPrice;
  if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate <= 0) return false;
  if (typeof existing !== 'number' || !Number.isFinite(existing) || existing <= 0) return false;
  if (candidate >= existing) return false;

  const minPct = input.minImprovementPct ?? SUPPLY_OPPORTUNITY_MIN_IMPROVEMENT_PCT;
  const improvementPct = ((existing - candidate) / existing) * 100;
  return improvementPct >= minPct;
}
