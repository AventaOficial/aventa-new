/**
 * Texto que el flujo de lote guardaba como descripción cuando no había nota del cazador.
 * Es una instrucción para moderación, no contenido público.
 */
export const LEGACY_BATCH_PLACEHOLDER_DESCRIPTION =
  'Oferta cargada por lote. Revisar ficha antes de aprobar.';

/** Descripción apta para mostrar o indexar. `null` si está vacía o es la nota interna del lote. */
export function publicOfferDescription(raw: string | null | undefined): string | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  if (text === LEGACY_BATCH_PLACEHOLDER_DESCRIPTION) return null;
  return text;
}
