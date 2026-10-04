import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { heroAccess } from '../../lib/team/hero/access';
import { composeTeamHero } from '../../lib/team/hero/adapters';
import { membershipFromRow } from '../../lib/team/gate/policy';
import type { TeamMembership } from '../../lib/team/roles/membership';

function active(teamId: TeamMembership['teamId'], role: string, userId = 'user-1'): TeamMembership {
  const membership = membershipFromRow(userId, { teamId, role, status: 'ACTIVE' });
  if (!membership) throw new Error(`membership inválida ${teamId}`);
  return membership;
}

const moderation = active('moderation', 'moderator');
const suspended: TeamMembership = {
  userId: 'user-1',
  teamId: 'moderation',
  role: 'moderator',
  status: 'SUSPENDED',
};
const removed: TeamMembership = {
  userId: 'user-1',
  teamId: 'finance',
  role: 'finance_viewer',
  status: 'REMOVED',
};

function heroFiles(): string[] {
  const dir = 'lib/team/hero';
  return readdirSync(dir).map((name) => join(dir, name));
}

describe('team hero access', () => {
  it('sin membresía no obtiene el Hero', () => {
    expect(heroAccess('moderation', [])).toEqual({ ok: false, reason: 'denied' });
  });

  it('SUSPENDED no obtiene el Hero', () => {
    expect(heroAccess('moderation', [suspended]).ok).toBe(false);
  });

  it('REMOVED no obtiene el Hero', () => {
    expect(heroAccess('finance', [removed]).ok).toBe(false);
  });

  it('moderación no obtiene el Hero de finanzas', () => {
    expect(heroAccess('moderation', [moderation]).ok).toBe(true);
    expect(heroAccess('finance', [moderation])).toEqual({ ok: false, reason: 'denied' });
  });

  it('un equipo inválido no obtiene datos', () => {
    expect(heroAccess('random', [moderation])).toEqual({ ok: false, reason: 'invalid_team' });
    expect(heroAccess('admin', [moderation])).toEqual({ ok: false, reason: 'invalid_team' });
    expect(heroAccess('owner', [moderation])).toEqual({ ok: false, reason: 'invalid_team' });
  });
});

describe('team hero adapters', () => {
  it('no fabrica números cuando la fuente no responde', () => {
    const payload = composeTeamHero({
      membership: moderation,
      greeting: 'Buenas noches',
      personName: 'Jafet',
      communityXp: null,
      facts: {
        teamId: 'moderation',
        facts: {
          pending: { origin: 'UNAVAILABLE' },
          decisionsToday: { origin: 'UNAVAILABLE' },
        },
      },
    });
    expect(payload?.metrics).toEqual([]);
    expect(payload?.activity).toEqual([]);
    expect(payload?.primary.body).not.toMatch(/\d/);
    expect(payload?.primary.href).toBe('#cola');
    expect(payload?.roleLabel).toBe('Moderador');
    expect(payload?.communityXp).toBeNull();
  });

  it('muestra la cola real y las decisiones propias, sin XP de equipo', () => {
    const payload = composeTeamHero({
      membership: moderation,
      greeting: 'Buenos días',
      personName: 'Jafet',
      communityXp: 40,
      facts: {
        teamId: 'moderation',
        facts: {
          pending: { origin: 'REAL', count: 3 },
          decisionsToday: { origin: 'CALCULATED', count: 2 },
        },
      },
    });
    expect(payload?.metrics).toEqual([
      { id: 'pending-offers', label: 'Ofertas en espera', value: '3', origin: 'REAL' },
    ]);
    expect(payload?.activity[0]?.text).toContain('2');
    expect(payload?.communityXp).toEqual({ scope: 'community', label: 'XP de comunidad', value: '40' });
    expect(JSON.stringify(payload)).not.toContain('XP de Moderación');
    expect(payload?.metrics.length).toBeLessThanOrEqual(3);
  });

  it('finanzas solo dice si el camino de dinero está congelado', () => {
    const finance = active('finance', 'finance_viewer');
    const payload = composeTeamHero({
      membership: finance,
      greeting: 'Buenas tardes',
      personName: 'Ana',
      communityXp: null,
      facts: { teamId: 'finance', facts: { frozen: true } },
    });
    expect(payload?.metrics).toEqual([
      { id: 'money-path', label: 'Camino de dinero', value: 'Congelado', origin: 'REAL' },
    ]);
    expect(payload?.primary.href).toBeNull();
    expect(payload?.metrics.some((item) => /\d/.test(item.value))).toBe(false);
  });

  it('hunter no abre ingesta y growth no inventa cifras', () => {
    const hunter = active('hunter', 'hunter');
    const hunterHero = composeTeamHero({
      membership: hunter,
      greeting: 'Buenas noches',
      personName: 'Luis',
      communityXp: null,
      facts: { teamId: 'hunter', facts: { ownBatchEventsToday: { origin: 'UNAVAILABLE' } } },
    });
    expect(hunterHero?.metrics).toEqual([]);
    expect(hunterHero?.activity).toEqual([]);
    expect(hunterHero?.primary.href).toBeNull();
    expect(hunterHero?.primary.label).toBeNull();

    const growth = active('growth', 'growth_member');
    const growthHero = composeTeamHero({
      membership: growth,
      greeting: 'Buenos días',
      personName: 'Luis',
      communityXp: null,
      facts: { teamId: 'growth', facts: {} },
    });
    expect(growthHero?.metrics).toEqual([]);
    expect(growthHero?.primary.title).toBe('Tu espacio de trabajo está listo.');
    expect(growthHero?.primary.body).not.toMatch(/\d/);
  });

  it('no mezcla el Hero de un equipo con la membresía de otro', () => {
    expect(
      composeTeamHero({
        membership: moderation,
        greeting: 'Buenas noches',
        personName: 'Jafet',
        communityXp: null,
        facts: { teamId: 'finance', facts: { frozen: true } },
      }),
    ).toBeNull();
  });
});

describe('team hero boundaries', () => {
  it('no lee user_roles ni el CEO Dashboard ni reescribe la moderación', () => {
    const files = [...heroFiles(), 'app/team/hero/TeamHero.tsx', 'app/team/[team]/page.tsx'];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('user_roles');
      expect(source).not.toContain('admin/owner');
      expect(source).not.toContain('FocusActionsBar');
      expect(source).not.toContain('localStorage');
    }
    const page = readFileSync('app/team/[team]/page.tsx', 'utf8');
    expect(page).toContain('entry.membership.teamId');
    expect(page).not.toContain('searchParams');
  });
});
