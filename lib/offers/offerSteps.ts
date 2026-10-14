/** Pasos de una oferta: arreglo JSON de textos o un paso por línea. */
export function parseOfferSteps(raw: string | null | undefined): string[] {
  const text = raw?.trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    // texto plano
  }
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
