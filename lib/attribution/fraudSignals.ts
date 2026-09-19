/**
 * Señales determinísticas de fraude / ambigüedad en atribución.
 * Nombres alineados a rewardsEngine.basicFraudFlags donde aplica.
 */

export const ATTRIBUTION_FRAUD_SIGNALS = [
  'anonymous_click',
  'self_click',
  'conflicting_offer',
  'duplicate_conversion_key',
  'attribution_window_expired',
] as const;

export type AttributionFraudSignal = (typeof ATTRIBUTION_FRAUD_SIGNALS)[number];

export function isAttributionFraudSignal(raw: string): raw is AttributionFraudSignal {
  return (ATTRIBUTION_FRAUD_SIGNALS as readonly string[]).includes(raw);
}

/**
 * Señales de click (P0-2 rewards): requiere evidencia explícita.
 * - self_click: clicker === creator (ambos deben estar presentes)
 * - anonymous_click: hay click_id pero clicker_user_id ausente (no manual path)
 */
export function evaluateClickFraudSignals(input: {
  clickId?: string | null;
  clickerUserId?: string | null;
  creatorId?: string | null;
}): AttributionFraudSignal[] {
  const flags: AttributionFraudSignal[] = [];
  const clicker = input.clickerUserId?.trim() || null;
  const creator = input.creatorId?.trim() || null;
  const clickId = input.clickId?.trim() || null;

  if (clicker && creator && clicker === creator) {
    flags.push('self_click');
  }
  if (clickId && !clicker) {
    flags.push('anonymous_click');
  }
  return flags;
}

export function evaluateConversionAttributionFraudSignals(input: {
  clickId?: string | null;
  clickerUserId?: string | null;
  creatorId?: string | null;
  clientOfferId?: string | null;
  clickOfferId?: string | null;
  withinAttributionWindow?: boolean;
  isDuplicateConversion?: boolean;
}): AttributionFraudSignal[] {
  const flags = evaluateClickFraudSignals({
    clickId: input.clickId,
    clickerUserId: input.clickerUserId,
    creatorId: input.creatorId,
  });

  const clientOffer = input.clientOfferId?.trim() || null;
  const clickOffer = input.clickOfferId?.trim() || null;
  if (clientOffer && clickOffer && clientOffer !== clickOffer) {
    flags.push('conflicting_offer');
  }

  if (input.withinAttributionWindow === false && input.clickId?.trim()) {
    flags.push('attribution_window_expired');
  }

  if (input.isDuplicateConversion) {
    flags.push('duplicate_conversion_key');
  }

  return flags;
}

/** Evidencia de usuario autenticado: solo clicker_user_id persistido en click. */
export function isAuthenticatedClickEvidence(clickerUserId: string | null | undefined): boolean {
  return Boolean(clickerUserId?.trim());
}
