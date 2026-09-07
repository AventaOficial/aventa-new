/** Motivos estándar para rechazo (moderación); el texto completo va al usuario / log. */
export type RejectionPreset = { short: string; full: string };

/** Presets legacy (historial / paneles secundarios). */
export const MODERATION_REJECTION_PRESETS: RejectionPreset[] = [
  { short: 'Precio / descuento', full: 'El precio o el descuento no coincide con el enlace o resulta engañoso.' },
  { short: 'Duplicada', full: 'Oferta duplicada o muy similar a otra ya publicada recientemente.' },
  { short: 'Enlace', full: 'El enlace no abre, no corresponde al producto o faltan pasos esenciales en la descripción.' },
  { short: 'Categoría', full: 'La categoría no corresponde al producto; debe corregirse y volver a enviar.' },
  { short: 'Calidad', full: 'Título o descripción insuficientes para validar la oferta de forma fiable.' },
  { short: 'Spam / normas', full: 'Contenido que no cumple las normas de la comunidad (spam, promoción no permitida, etc.).' },
];

/**
 * Razones humanas del flujo Focus (pocas, claras).
 * `full` es lo que se envía a moderate-offer.
 */
export const FOCUS_REJECTION_PRESETS: RejectionPreset[] = [
  {
    short: 'No es una buena oferta',
    full: 'No es una buena oferta para publicar en Aventa.',
  },
  {
    short: 'Precio engañoso',
    full: 'El precio o el descuento resulta engañoso o no coincide con el enlace.',
  },
  {
    short: 'Producto incorrecto',
    full: 'El producto no corresponde al título, la foto o el enlace.',
  },
  {
    short: 'Duplicada',
    full: 'Oferta duplicada o muy similar a otra ya publicada recientemente.',
  },
  {
    short: 'Agotada',
    full: 'El producto parece agotado o no disponible.',
  },
  {
    short: 'Spam',
    full: 'Contenido que no cumple las normas de la comunidad (spam o promoción no permitida).',
  },
  {
    short: 'Otro',
    full: 'Rechazada por el moderador.',
  },
];
