type Cell = [area: string, span: number];

function row(...cells: Cell[]): string {
  return `"${cells.flatMap(([area, span]) => Array<string>(span).fill(area)).join(' ')}"`;
}

/**
 * PC (≥1280): proporciones medidas sobre la referencia, en 24 columnas.
 * Ingresos/Pagos arrancan a media altura de Usuarios/Ofertas y Capacidad queda
 * debajo de éstas; por eso la franja superior usa 3 filas.
 */
const DESKTOP_AREAS = [
  row(['community', 10], ['users', 5], ['offers', 4], ['moderation', 5]),
  row(['revenue', 6], ['payouts', 4], ['users', 5], ['offers', 4], ['moderation', 5]),
  row(['revenue', 6], ['payouts', 4], ['capacity', 9], ['moderation', 5]),
  row(['goals', 10], ['season', 7], ['priorities', 7]),
].join('\n      ');

const AREAS = ['community', 'users', 'offers', 'moderation', 'revenue', 'payouts', 'capacity', 'goals', 'season', 'priorities'];

/**
 * Composición del lienzo del CEO.
 * Móvil: una columna, en el orden de lectura de la referencia.
 * Tablet (768–1279): dos columnas; la grilla de PC deja Usuarios por debajo de 200px.
 * PC (≥1280): la composición de la referencia con áreas nombradas (no depende del orden del DOM).
 */
export const CEO_MOSAIC_CSS = `
.ceo-mosaic {
  display: grid;
  gap: 0.75rem;
  align-items: stretch;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: ${AREAS.map((a) => `"${a}"`).join(' ')};
}
.ceo-mosaic > * { min-width: 0; height: 100%; }
${AREAS.map((a) => `.ceo-area-${a} { grid-area: ${a}; }`).join('\n')}
@media (min-width: 768px) and (max-width: 1279.98px) {
  .ceo-mosaic {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas:
      "community community"
      "users offers"
      "revenue payouts"
      "capacity moderation"
      "goals season"
      "priorities priorities";
  }
}
@media (min-width: 1280px) {
  .ceo-mosaic {
    grid-template-columns: repeat(24, minmax(0, 1fr));
    grid-template-areas:
      ${DESKTOP_AREAS};
  }
}
`;
