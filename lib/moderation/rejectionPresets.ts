/** Motivos estándar para rechazo (moderación); el texto completo va al usuario / log. */
export type RejectionPreset = { short: string; full: string };

export const MODERATION_REJECTION_PRESETS: RejectionPreset[] = [
  { short: 'Precio / descuento', full: 'El precio o el descuento no coincide con el enlace o resulta engañoso.' },
  { short: 'Duplicada', full: 'Oferta duplicada o muy similar a otra ya publicada recientemente.' },
  { short: 'Enlace', full: 'El enlace no abre, no corresponde al producto o faltan pasos esenciales en la descripción.' },
  { short: 'Categoría', full: 'La categoría no corresponde al producto; debe corregirse y volver a enviar.' },
  { short: 'Calidad', full: 'Título o descripción insuficientes para validar la oferta de forma fiable.' },
  { short: 'Spam / normas', full: 'Contenido que no cumple las normas de la comunidad (spam, promoción no permitida, etc.).' },
];
