import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { profileMenuLinks } from '../../lib/team/config/profileMenu';

function labels(input: { isOwner: boolean; teamIds: readonly string[] }) {
  return profileMenuLinks(input).map((link) => link.label);
}

describe('menú de perfil por membresía', () => {
  it('el owner entra al CEO Dashboard y no ve Moderación', () => {
    const links = profileMenuLinks({ isOwner: true, teamIds: ['moderation', 'finance'] });
    expect(labels({ isOwner: true, teamIds: ['moderation', 'finance'] })).toEqual([
      'CEO Dashboard',
      'Mi equipo',
    ]);
    expect(links.map((link) => link.href)).toEqual(['/admin/owner', '/team']);
  });

  it('moderación solo ve su equipo', () => {
    expect(labels({ isOwner: false, teamIds: ['moderation'] })).toEqual(['Moderación', 'Mi equipo']);
    expect(profileMenuLinks({ isOwner: false, teamIds: ['moderation'] })[0]?.href).toBe('/team/moderation');
  });

  it('hunter, growth, operations, finance y technical usan su dashboard', () => {
    expect(labels({ isOwner: false, teamIds: ['hunter'] })).toEqual(['Hunter', 'Mi equipo']);
    expect(labels({ isOwner: false, teamIds: ['growth'] })).toEqual(['Growth', 'Mi equipo']);
    expect(labels({ isOwner: false, teamIds: ['operations'] })).toEqual(['Operations', 'Mi equipo']);
    expect(labels({ isOwner: false, teamIds: ['finance'] })).toEqual(['Finance', 'Mi equipo']);
    expect(labels({ isOwner: false, teamIds: ['product'] })).toEqual(['Technical', 'Mi equipo']);
    expect(profileMenuLinks({ isOwner: false, teamIds: ['product'] })[0]?.href).toBe('/team/product');
  });

  it('growth no recibe el enlace de finance', () => {
    const hrefs = profileMenuLinks({ isOwner: false, teamIds: ['growth'] }).map((link) => link.href);
    expect(hrefs).not.toContain('/team/finance');
    expect(hrefs).toContain('/team/growth');
  });

  it('sin membresía solo queda Mi equipo', () => {
    expect(labels({ isOwner: false, teamIds: [] })).toEqual(['Mi equipo']);
  });

  it('el navbar ya no ofrece el hub, la extensión ni los lotes', () => {
    const source = readFileSync('app/components/Navbar.tsx', 'utf8');
    expect(source).toContain('/api/team/menu');
    expect(source).toContain('Modo oscuro');
    expect(source).toContain('Configuración');
    expect(source).toContain('Cerrar sesión');
    expect(source).not.toContain('Hub de equipo');
    expect(source).not.toContain('Extensión');
    expect(source).not.toContain('Lotes');
    expect(source).not.toContain('/equipo');
    expect(source).not.toContain('/admin/moderation');
  });
});
