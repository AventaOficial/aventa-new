import { describe, expect, it } from 'vitest';
import { presentAuthor } from '@/lib/product/hunters/identity';
import { communityAuthorCard, teamAuthorCard } from '@/lib/product/presentation/teamAuthor';

describe('ficha de autor', () => {
  it('el equipo usa el code resuelto y no el nombre visible', () => {
    const byName = presentAuthor({ displayName: 'Ximena' });
    expect(byName.kind).toBe('person');

    const official = presentAuthor({ displayName: 'Aventa MCP Supply' });
    expect(official.kind).toBe('hunter');
    if (official.kind !== 'hunter') return;
    const card = teamAuthorCard(official.hunter);
    expect(card.kind).toBe('team');
    expect(card.name).toBe('Ximena · Equipo Aventa');
    expect(card.functionLabel).toBe('Ofertas de uso diario');
    expect(card.bio).toContain('hogar, la despensa');
    expect(card.profileHref).toBe('/cazadores/ximena-fuego');
    expect(card.location).toBeNull();
    expect(JSON.stringify(card)).not.toMatch(/Verificado|email|teléfono|userId/);
  });

  it('otro hunter del canon no hereda la descripción de Ximena', () => {
    const presented = presentAuthor({ displayName: 'Ana López', hunterCode: 'tomas' });
    expect(presented.kind).toBe('hunter');
    if (presented.kind !== 'hunter') return;
    const card = teamAuthorCard(presented.hunter);
    expect(card.name).toBe('Tomás · Equipo Aventa');
    expect(card.functionLabel).toBeNull();
    expect(card.bio).toBeNull();
    expect(card.name).not.toContain('Ximena');
  });

  it('un perfil completo muestra bio y ubicación, y uno vacío no inventa datos', () => {
    const full = communityAuthorCard({
      name: 'Ana López',
      profileHref: '/u/ana',
      avatarUrl: '/a.png',
      bio: 'Cazo ofertas de despensa.',
      location: 'Guadalajara, Jalisco',
    });
    expect(full.kind).toBe('community');
    expect(full.name).toBe('Ana López');
    expect(full.avatarUrl).toBe('/a.png');
    expect(full.bio).toBe('Cazo ofertas de despensa.');
    expect(full.location).toBe('Guadalajara, Jalisco');
    expect(full.functionLabel).toBeNull();

    const empty = communityAuthorCard({
      name: 'Ana López',
      profileHref: '/u/ana',
      bio: '   ',
      location: '',
    });
    expect(empty.bio).toBeNull();
    expect(empty.location).toBeNull();
    expect(JSON.stringify(empty)).not.toMatch(/Equipo Aventa|Verificado/);
  });
});
