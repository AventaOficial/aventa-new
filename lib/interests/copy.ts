/**
 * Nombre visible provisional. El identificador interno es `intereses`.
 * Cambiar estas cadenas no cambia rutas, tablas ni eventos.
 */
export const INTERESTS_SECTION = {
  id: 'intereses',
  path: '/me/intereses',
  navLabel: 'Intereses',
  title: 'Tus intereses',
  lede: 'Guarda productos o temas. Te mostramos ofertas que encajan y, aparte, hallazgos generales de calidad.',
  emptyTitle: 'Todavía no hay intereses',
  emptyBody: 'Escribe algo como café, iPhone o croquetas. Marca, modelo y categoría son opcionales.',
  personalHeading: 'Por tus intereses',
  discoveryHeading: 'Para descubrir',
  personalEmpty: 'Ninguna oferta pública encaja con tu lista ahora.',
  discoveryEmpty: 'No hay otros hallazgos con señal de calidad en este momento.',
  saved: 'Interés guardado.',
  updated: 'Interés actualizado.',
  removed: 'Interés eliminado.',
  matchLabels: {
    exact: 'Coincide con tu lista',
    brand_model: 'Misma marca y modelo',
    terms: 'Términos parecidos',
    category: 'Misma categoría',
  },
} as const;
