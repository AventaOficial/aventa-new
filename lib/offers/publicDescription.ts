/**
 * Texto que el flujo de lote guardaba como descripción cuando no había nota del cazador.
 * Es una instrucción para moderación, no contenido público.
 */
export const LEGACY_BATCH_PLACEHOLDER_DESCRIPTION =
  'Oferta cargada por lote. Revisar ficha antes de aprobar.';

/**
 * Frases de diagnóstico que los bots escribían en la nota interna y llegaron a `description`
 * (p. ej. "precio tachado no verificado"). Se quitan frase por frase; el resto del texto se conserva.
 */
const INTERNAL_NOTE_PATTERNS: RegExp[] = [
  /\bprecio\s+(tachado|de\s+lista|original|de\s+referencia|anterior)\b.{0,60}?\b(no\s+)?(verificad|confirmad|comprobad|validad)/i,
  /\bnota\s+(interna|para\s+(el\s+)?(equipo|moderaci[oó]n|moderadores))\b/i,
  /\b(evidencia|diagn[oó]stico)\s*:/i,
  /\[bot-ingest\]/i,
];

function isInternalNote(sentence: string): boolean {
  const folded = sentence.normalize('NFC');
  return INTERNAL_NOTE_PATTERNS.some((re) => re.test(folded));
}

/** Quita frases internas de una descripción. Conserva saltos de línea del autor. */
export function stripInternalNotes(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .split(/(?<=[.!?;])\s+/)
        .filter((sentence) => !isInternalNote(sentence))
        .join(' ')
        .trimEnd()
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Descripción apta para mostrar o indexar. `null` si está vacía o solo trae notas internas. */
export function publicOfferDescription(raw: string | null | undefined): string | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  if (text === LEGACY_BATCH_PLACEHOLDER_DESCRIPTION) return null;
  const cleaned = stripInternalNotes(text);
  return cleaned || null;
}
