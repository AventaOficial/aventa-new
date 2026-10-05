type Cell = [area: string, span: number];

function row(...cells: Cell[]): string {
  return `"${cells.flatMap(([area, span]) => Array<string>(span).fill(area)).join(' ')}"`;
}

/**
 * PC y tablet horizontal (≥1024): proporciones medidas sobre la referencia, en 24 columnas.
 * Ingresos/Pagos arrancan a media altura de Usuarios/Ofertas y Capacidad queda
 * debajo de éstas; por eso la franja superior usa 3 filas.
 */
const DESKTOP_AREAS = [
  row(['community', 10], ['users', 5], ['offers', 4], ['teams', 5]),
  row(['revenue', 6], ['payouts', 4], ['users', 5], ['offers', 4], ['teams', 5]),
  row(['revenue', 6], ['payouts', 4], ['capacity', 9], ['teams', 5]),
  row(['goals', 10], ['season', 7], ['priorities', 7]),
].join('\n      ');

/**
 * Alto relativo de las 4 filas, según el contenido mínimo de cada una con ~610px de mosaico
 * (1536×730 y 1280×750 útiles): Comunidad, franja Usuarios/Ofertas, Capacidad, fila inferior.
 */
const DESKTOP_ROWS = [152, 46, 162, 222].map((fr) => `minmax(0, ${fr}fr)`).join(' ');

/**
 * Lo que ocupa la pantalla encima del mosaico: header (56) + padding superior (12)
 * + barra de fecha y período (36) + separación (12), más un margen inferior (4).
 */
const CHROME_PX = 120;

/** Por debajo de este alto el contenido ya no cabe; la página hace scroll. */
const MIN_HEIGHT_PX = 520;

const AREAS = ['community', 'users', 'offers', 'teams', 'revenue', 'payouts', 'capacity', 'goals', 'season', 'priorities'];

/** Móvil: decisiones → alertas por equipo → acciones del día → métricas. */
export const MOBILE_ORDER = ['priorities', 'teams', 'goals', 'payouts', 'community', 'offers', 'users', 'revenue', 'capacity', 'season'];

/**
 * Composición del lienzo del CEO.
 * Móvil: una columna, primero lo que pide decisión (MOBILE_ORDER).
 * Tablet vertical (768–1023): dos columnas.
 * PC y tablet horizontal (≥1024): la composición de la referencia con áreas nombradas (no depende del orden del DOM).
 */
export const CEO_MOSAIC_CSS = `
.ceo-mosaic {
  display: grid;
  gap: 0.75rem;
  align-items: stretch;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: ${MOBILE_ORDER.map((a) => `"${a}"`).join(' ')};
}
.ceo-mosaic > * { min-width: 0; height: 100%; }
${AREAS.map((a) => `.ceo-area-${a} { grid-area: ${a}; }`).join('\n')}
@media (min-width: 768px) and (max-width: 1023.98px) {
  .ceo-mosaic {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas:
      "community community"
      "users offers"
      "revenue payouts"
      "capacity teams"
      "goals season"
      "priorities priorities";
  }
}
@media (min-width: 1024px) {
  .ceo-mosaic {
    gap: 0.625rem;
    height: max(${MIN_HEIGHT_PX}px, calc(100dvh - ${CHROME_PX}px));
    grid-template-columns: repeat(24, minmax(0, 1fr));
    grid-template-rows: ${DESKTOP_ROWS};
    grid-template-areas:
      ${DESKTOP_AREAS};
  }
  .ceo-mosaic > * { min-height: 0; overflow: hidden; }
}
`;
