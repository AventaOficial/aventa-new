import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AVENTA_EDITORIAL_LINE, AVENTA_EDITORIAL_NAME, publicCardAttribution } from '@/lib/product/presentation/publicCardAttribution';
import { presentAuthor } from '@/lib/product/hunters/identity';

describe('atribución pública de tarjetas', () => {
  it('un hunter del canon se presenta como AVENTA DIARIAS y conserva el code', () => {
    const presented = presentAuthor({ displayName: 'Aventa MCP Supply' });
    expect(presented.kind).toBe('hunter');
    if (presented.kind !== 'hunter') return;
    const card = publicCardAttribution({ hunter: presented.hunter, username: 'Ximena' });
    expect(card).toEqual({
      kind: 'brand',
      label: AVENTA_EDITORIAL_NAME,
      line: AVENTA_EDITORIAL_LINE,
      hunterCode: 'ximena',
    });
    expect(JSON.stringify(card)).not.toMatch(/Ximena|Verificado|machine_client|avk_/);
  });

  it('un nombre editable no basta para la identidad editorial', () => {
    expect(publicCardAttribution({ username: 'Ximena' })).toEqual({
      kind: 'person',
      label: 'Ximena lo encontró',
    });
    expect(publicCardAttribution({ username: 'Ana López' })).toEqual({
      kind: 'person',
      label: 'Ana López lo encontró',
    });
  });

  it('la tarjeta pública usa la línea editorial y no afirma verificación de precio', () => {
    const source = readFileSync('app/components/OfferCard.tsx', 'utf8');
    const line = readFileSync('app/components/hunters/HunterIdentity.tsx', 'utf8');
    const editorial = readFileSync('lib/product/presentation/publicCardAttribution.ts', 'utf8');
    expect(source).toContain('AventaFoundLine');
    expect(source).not.toContain('HunterFoundLine');
    expect(line).toContain('AVENTA_EDITORIAL_NAME');
    expect(line).toContain('AVENTA_EDITORIAL_LINE');
    expect(editorial).toContain("AVENTA DIARIAS");
    expect(editorial).toContain('Selección diaria de Aventa');
    expect(line).not.toContain('Verificado');
    expect(source).not.toContain('Verificado');
  });
});
