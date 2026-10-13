import { describe, expect, it } from 'vitest';
import {
  batchAuthorLabel,
  defaultSupplyHunter,
  hunterByCode,
  isTechnicalAuthorLabel,
  presentAuthor,
} from '@/lib/product/hunters/identity';

describe('identidad pública de Hunters', () => {
  it('un nombre técnico de suministro se presenta como Ximena, sin el UUID del cliente', () => {
    const presented = presentAuthor({ displayName: 'Aventa MCP Supply' });
    expect(presented.kind).toBe('hunter');
    if (presented.kind !== 'hunter') return;
    expect(presented.hunter.name).toBe('Ximena');
    expect(presented.hunter.displayName).toBe('Ximena "Fuego"');
    expect(presented.hunter.role).toBe('Cazadora de conexiones');
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

  it('hunter_code ximena-fuego resuelve a Ximena sin usar el nombre del cliente', () => {
    const presented = presentAuthor({ displayName: 'Ana López', hunterCode: 'ximena-fuego' });
    expect(presented.kind).toBe('hunter');
    if (presented.kind !== 'hunter') return;
    expect(presented.hunter.name).toBe('Ximena');
    expect(presented.hunter.code).toBe(defaultSupplyHunter().code);
    expect(presented.hunter.profilePath).toBe('/cazadores/ximena-fuego');
    expect(hunterByCode('ximena-fuego')?.displayName).toBe('Ximena "Fuego"');
    expect(hunterByCode('otro-codigo')).toBeNull();
    expect(JSON.stringify(presented)).not.toMatch(/machine_client|avk_|mcp/i);
  });

  it('lote MCP: hunter editorial con procedencia, nunca el perfil técnico', () => {
    const label = batchAuthorLabel({ createdBy: 'bot', authorName: 'Aventa MCP Supply', machineClientId: 'mc-1' });
    expect(label).toBe('Ximena "Fuego" · vía MCP');
    expect(label).not.toMatch(/Supply|aventa-mcp|mc-1/);
  });

  it('lote humano: conserva su autor y no se marca como MCP', () => {
    expect(batchAuthorLabel({ createdBy: 'u1', authorName: 'Ana López' })).toBe('Ana López');
    expect(batchAuthorLabel({ createdBy: 'u1', authorName: null })).toBe('Usuario');
  });
});
