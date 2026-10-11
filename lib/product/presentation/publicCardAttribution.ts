import type { HunterPublicIdentity } from '@/lib/product/hunters/identity';

/** Identidad editorial de las tarjetas públicas. No afirma verificación de precio ni de stock. */
export const AVENTA_PUBLIC_FOUND_LABEL = 'Aventa lo cazó';

export type PublicCardAttribution =
  | { kind: 'brand'; label: typeof AVENTA_PUBLIC_FOUND_LABEL; hunterCode: string }
  | { kind: 'person'; label: string };

/**
 * En la tarjeta pública, un hunter automatizado se presenta como Aventa.
 * El code queda para trazabilidad; el nombre no se muestra en la tarjeta.
 * Una persona de la comunidad conserva su nombre.
 */
export function publicCardAttribution(author: {
  hunter?: Pick<HunterPublicIdentity, 'code'> | null;
  username?: string | null;
} | null | undefined): PublicCardAttribution | null {
  if (author?.hunter?.code) {
    return { kind: 'brand', label: AVENTA_PUBLIC_FOUND_LABEL, hunterCode: author.hunter.code };
  }
  const username = author?.username?.trim();
  if (!username) return null;
  return { kind: 'person', label: `${username} lo encontró` };
}
