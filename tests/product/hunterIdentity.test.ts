import { describe, expect, it } from 'vitest';
import { defaultSupplyHunter, isTechnicalAuthorLabel, presentAuthor } from '@/lib/product/hunters/identity';

describe('identidad pública de Hunters', () => {
  it('un nombre técnico de suministro se presenta como Ximena, sin el UUID del cliente', () => {
    const presented = presentAuthor({ displayName: 'Aventa MCP Supply' });
    expect(presented.kind).toBe('hunter');
    if (presented.kind !== 'hunter') return;
    expect(presented.hunter.name).toBe('Ximena');
    expect(presented.hunter.foundLabel).toBe('Ximena encontró esta oferta');
    expect(presented.hunter.profilePath).toBe('/cazadores/ximena-fuego');
    expect(presented.hunter.code).toBe(defaultSupplyHunter().code);
    expect(JSON.stringify(presented)).not.toMatch(/54912420|machine_client|avk_/);
  });

  it('una persona real no se convierte en Hunter', () => {
    expect(presentAuthor({ displayName: 'Ana López' })).toEqual({ kind: 'person' });
    expect(isTechnicalAuthorLabel('Ana López')).toBe(false);
  });

  it('un code de canon gana sobre el carril por defecto', () => {
    const presented = presentAuthor({ displayName: 'Aventa MCP Supply', hunterCode: 'tomas' });
    expect(presented.kind).toBe('hunter');
    if (presented.kind !== 'hunter') return;
    expect(presented.hunter.name).toBe('Tomás');
  });
});
