import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AVENTA_PUBLIC_FOUND_LABEL, publicCardAttribution } from '@/lib/product/presentation/publicCardAttribution';
import { presentAuthor } from '@/lib/product/hunters/identity';

describe('atribución pública de tarjetas', () => {
  it('un hunter se presenta como Aventa y conserva el code interno', () => {
    const presented = presentAuthor({ displayName: 'Aventa MCP Supply' });
    expect(presented.kind).toBe('hunter');
    if (presented.kind !== 'hunter') return;
    const card = publicCardAttribution({ hunter: presented.hunter, username: presented.hunter.name });
    expect(card).toEqual({
      kind: 'brand',
      label: AVENTA_PUBLIC_FOUND_LABEL,
      hunterCode: 'ximena',
    });
    expect(JSON.stringify(card)).not.toMatch(/Ximena|machine_client|avk_/);
  });

  it('una persona conserva su nombre', () => {
    expect(publicCardAttribution({ username: 'Ana López' })).toEqual({
      kind: 'person',
      label: 'Ana López lo encontró',
    });
  });

  it('la tarjeta pública usa la línea de marca y no el foundLabel del hunter', () => {
    const source = readFileSync('app/components/OfferCard.tsx', 'utf8');
    expect(source).toContain('AventaFoundLine');
    expect(source).not.toContain('HunterFoundLine');
  });
});
