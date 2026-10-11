import type { HunterPublicIdentity } from '@/lib/product/hunters/identity';

/** Nombre editorial de las tarjetas del equipo. No afirma verificación de precio ni de stock. */
export const AVENTA_EDITORIAL_NAME = 'AVENTA DIARIAS';

/** Una sola línea de apoyo. No se apila con otra insignia de verificación. */
export const AVENTA_EDITORIAL_LINE = 'Selección diaria de Aventa';

export type PublicCardAttribution =
  | {
      kind: 'brand';
      label: typeof AVENTA_EDITORIAL_NAME;
      line: typeof AVENTA_EDITORIAL_LINE;
      hunterCode: string;
    }
  | { kind: 'person'; label: string };

/**
 * En la tarjeta pública, un hunter del canon se presenta como la selección de Aventa.
 * El code queda para trazabilidad; el nombre editable no decide la marca.
 * Una persona de la comunidad conserva su nombre.
 */
export function publicCardAttribution(author: {
  hunter?: Pick<HunterPublicIdentity, 'code'> | null;
  username?: string | null;
} | null | undefined): PublicCardAttribution | null {
  const hunterCode = author?.hunter?.code?.trim();
  if (hunterCode) {
    return {
      kind: 'brand',
      label: AVENTA_EDITORIAL_NAME,
      line: AVENTA_EDITORIAL_LINE,
      hunterCode,
    };
  }
  const username = author?.username?.trim();
  if (!username) return null;
  return { kind: 'person', label: `${username} lo encontró` };
}
