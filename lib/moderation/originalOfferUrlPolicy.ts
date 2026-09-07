/**
 * Política: nunca inventar original_offer_url a partir de offer_url operativo/monetizado.
 */

/** Baseline solo en memoria para validateAffiliatePaste (puede usar offer_url). */
export function affiliatePasteValidationBaseline(params: {
  existingOriginal: string | null | undefined;
  bodyOriginalProductUrl: string | null | undefined;
  currentOfferUrl: string | null | undefined;
}): string | null {
  const fromBody = params.bodyOriginalProductUrl?.trim() ?? '';
  if (fromBody) return fromBody.slice(0, 2048);
  const existing = params.existingOriginal?.trim() ?? '';
  if (existing) return existing.slice(0, 2048);
  const current = params.currentOfferUrl?.trim() ?? '';
  return current ? current.slice(0, 2048) : null;
}

/**
 * Valor a persistir en original_offer_url tras affiliate paste.
 * `null` = no incluir el campo en el UPDATE (conservar NULL o el valor existente).
 */
export function originalOfferUrlToPersistOnAffiliatePaste(params: {
  existingOriginal: string | null | undefined;
  bodyOriginalProductUrl: string | null | undefined;
}): string | null {
  const existing = params.existingOriginal?.trim() ?? '';
  if (existing) return null; // conservar existente; no escribir
  const fromBody = params.bodyOriginalProductUrl?.trim() ?? '';
  if (fromBody) return fromBody.slice(0, 2048);
  return null; // histórico desconocido: permanece NULL
}

/** Focus claim: solo guarda original real, nunca offer_url. */
export function focusClaimOriginalRefValue(
  originalOfferUrl: string | null | undefined
): string | null {
  const t = originalOfferUrl?.trim() ?? '';
  return t || null;
}

/** Focus approve/confirm: solo envía original confiable; sin fallback a offer_url. */
export function focusOriginalProductUrlForRequest(params: {
  originalOfferUrl: string | null | undefined;
  refOriginal: string | null | undefined;
}): string | undefined {
  const fromOffer = params.originalOfferUrl?.trim() ?? '';
  if (fromOffer) return fromOffer;
  const fromRef = params.refOriginal?.trim() ?? '';
  if (fromRef) return fromRef;
  return undefined;
}
