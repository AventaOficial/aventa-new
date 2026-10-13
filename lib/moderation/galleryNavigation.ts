import { OFFER_MAX_IMAGES } from '@/lib/contracts/offers';

/** Índice válido dentro de [0, length). 0 si la lista está vacía. */
export function clampGalleryIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index) || 0, 0), length - 1);
}

/** Paso circular: anterior desde la primera va a la última y viceversa. */
export function stepGalleryIndex(index: number, length: number, direction: 1 | -1): number {
  if (length <= 0) return 0;
  const current = clampGalleryIndex(index, length);
  return (current + direction + length) % length;
}

/** Fotos que todavía no fallaron, en el orden original (la portada primero). */
export function workingGalleryImages(images: string[], failed: ReadonlySet<string>): string[] {
  return images.filter((url) => !failed.has(url));
}

/**
 * Tras marcar `failedUrl` como rota: índice en la lista de fotos que siguen sirviendo
 * para mostrar la siguiente (o la última si la rota era la final). -1 si ya no queda ninguna.
 */
export function indexAfterImageFailure(
  images: string[],
  failed: ReadonlySet<string>,
  failedUrl: string
): number {
  const remaining = workingGalleryImages(images, new Set([...failed, failedUrl]));
  if (remaining.length === 0) return -1;
  const before = workingGalleryImages(images, failed);
  const position = before.indexOf(failedUrl);
  if (position < 0) return 0;
  return clampGalleryIndex(position, remaining.length);
}

/**
 * Payload de `update-offer` para elegir portada: la elegida va primero y el resto conserva su orden.
 * null si la URL no está en la galería o ya es la portada.
 */
export function coverSelectionPayload(
  images: string[],
  chosen: string
): { image_url: string; image_urls: string[] } | null {
  const position = images.indexOf(chosen);
  if (position <= 0) return null;
  const rest = images.filter((_, i) => i !== position);
  return { image_url: chosen, image_urls: rest.slice(0, OFFER_MAX_IMAGES - 1) };
}
