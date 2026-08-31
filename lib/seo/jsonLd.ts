/**
 * Serializa JSON-LD de forma segura para incrustar en <script type="application/ld+json">.
 * JSON.stringify no escapa `<` ni `/`; un título con `</script>` rompería el HTML.
 * Las secuencias Unicode siguen siendo JSON válido (Google las acepta).
 */
export function stringifyJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
