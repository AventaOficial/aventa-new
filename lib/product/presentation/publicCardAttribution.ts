import type { HunterPublicIdentity } from '@/lib/product/hunters/identity';

/** Nombre editorial de las tarjetas del equipo. No afirma verificación de precio ni de stock. */
export const AVENTA_EDITORIAL_NAME = 'AVENTA DIARIAS';

/** Una sola línea de apoyo. La única insignia junto a la marca es la de autoría AVENTA. */
export const AVENTA_EDITORIAL_LINE = 'Selección diaria de Aventa';

/** Marca editorial por especialidad del hunter. Un code sin entrada usa la selección diaria. */
export const HUNTER_EDITORIAL: Readonly<Record<string, { label: string; line: string }>> = {
  ximena: { label: AVENTA_EDITORIAL_NAME, line: AVENTA_EDITORIAL_LINE },
  kai: { label: 'AVENTA TECH', line: 'Top tecnología' },
  eleonore: { label: 'AVENTA MODA', line: 'Moda, tenis y perfumes' },
};

export function hunterEditorial(code: string | null | undefined): { label: string; line: string } {
  return HUNTER_EDITORIAL[code?.trim().toLowerCase() ?? ''] ?? HUNTER_EDITORIAL.ximena;
}

export type PublicCardAttribution =
  | {
      kind: 'brand';
      label: string;
      line: string;
      hunterCode: string;
    }
  | { kind: 'person'; label: string };

/**
 * En la tarjeta pública, un hunter del canon se presenta como la selección de Aventa de su especialidad.
 * El code queda para trazabilidad; el nombre editable no decide la marca.
 * Una persona de la comunidad conserva su nombre.
 */
export function publicCardAttribution(author: {
  hunter?: Pick<HunterPublicIdentity, 'code'> | null;
  username?: string | null;
} | null | undefined): PublicCardAttribution | null {
  const hunterCode = author?.hunter?.code?.trim();
  if (hunterCode) {
    return { kind: 'brand', ...hunterEditorial(hunterCode), hunterCode };
  }
  const username = author?.username?.trim();
  if (!username) return null;
  return { kind: 'person', label: `${username} lo encontró` };
}
