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

  it('cada hunter de suministro presenta la marca de su especialidad', () => {
    const kai = presentAuthor({ displayName: 'Aventa MCP Supply', hunterCode: 'kai' });
    const eleonore = presentAuthor({ displayName: 'Aventa MCP Supply', hunterCode: 'eleonore' });
    expect(kai.kind === 'hunter' && publicCardAttribution({ hunter: kai.hunter })).toEqual({
      kind: 'brand',
      label: 'AVENTA TECH',
      line: 'Top tecnología',
      hunterCode: 'kai',
    });
    expect(eleonore.kind === 'hunter' && publicCardAttribution({ hunter: eleonore.hunter })).toEqual({
      kind: 'brand',
      label: 'AVENTA MODA',
      line: 'Moda, tenis y perfumes',
      hunterCode: 'eleonore',
    });
    expect(publicCardAttribution({ hunter: { code: 'kenji' } })).toMatchObject({
      label: AVENTA_EDITORIAL_NAME,
      line: AVENTA_EDITORIAL_LINE,
    });
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
    expect(line).toContain('/icon.svg');
    expect(editorial).toContain("AVENTA DIARIAS");
    expect(editorial).toContain('Selección diaria de Aventa');
    expect(`${line}\n${source}`).not.toMatch(/precio verificado|verificado por la tienda/i);
  });

  it('la marca editorial lleva el verificado morado y la comunidad no', () => {
    const source = readFileSync('app/components/OfferCard.tsx', 'utf8');
    const line = readFileSync('app/components/hunters/HunterIdentity.tsx', 'utf8');
    const badge = readFileSync('app/components/hunters/VerifiedBadge.tsx', 'utf8');
    const brandLine = line.slice(line.indexOf('export function AventaFoundLine'), line.indexOf('export function HunterFoundLine'));
    expect(brandLine).toMatch(/\{label\}\s*<\/span>\s*<VerifiedBadge/);
    expect(badge).toContain("'Verificado por AVENTA'");
    expect(badge).toContain('aria-label={AVENTA_VERIFIED_LABEL}');
    expect(badge).toContain('title={AVENTA_VERIFIED_LABEL}');
    expect(badge).toMatch(/fill-violet-600/);
    expect(source).not.toContain('VerifiedBadge');
  });
});
