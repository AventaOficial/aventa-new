import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEAM_IDS, TEAM_ROLES } from '../../lib/team/roles';
import {
  commitAssign,
  commitRoleChange,
  commitStatusChange,
  type LiveMembership,
} from '../../lib/team/membership/transitions';
import { readAssignCommand, readRoleCommand, readStatusCommand } from '../../lib/team/membership/commands';
import { TEAM_MANAGEMENT_STEP_UP } from '../../lib/team/membership/reauth';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const REQUEST = '33333333-3333-4333-8333-333333333333';
const ctx = { actorId: ACTOR, requestId: REQUEST };

function queue<T>(tasks: Array<() => T>): Promise<T[]> {
  let chain: Promise<unknown> = Promise.resolve();
  const runs = tasks.map((task) => {
    const run = chain.then(task);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  });
  return Promise.all(runs);
}

describe('membership state machine', () => {
  const active = { userId: TARGET, teamId: 'moderation' as const, role: 'moderator', status: 'ACTIVE' as const };

  it('permite las transiciones vivas y rechaza salir de REMOVED', () => {
    expect(commitStatusChange(active, 'SUSPENDED', 'pausa', ctx).ok).toBe(true);
    expect(commitStatusChange({ ...active, status: 'SUSPENDED' }, 'ACTIVE', null, ctx).ok).toBe(true);
    expect(commitStatusChange(active, 'REMOVED', 'fin', ctx).ok).toBe(true);
    expect(commitStatusChange({ ...active, status: 'SUSPENDED' }, 'REMOVED', 'fin', ctx).ok).toBe(true);
    expect(commitStatusChange({ ...active, status: 'REMOVED' }, 'ACTIVE', null, ctx)).toMatchObject({
      ok: false,
      code: 'invalid_transition',
    });
    expect(commitStatusChange({ ...active, status: 'REMOVED' }, 'SUSPENDED', 'x', ctx)).toMatchObject({
      ok: false,
      code: 'invalid_transition',
    });
    expect(commitRoleChange({ ...active, status: 'REMOVED' }, 'senior_moderator', 'x', ctx)).toMatchObject({
      ok: false,
      code: 'removed_membership',
    });
  });

  it('exige motivo al suspender, remover y cambiar rol', () => {
    expect(readStatusCommand({ status: 'SUSPENDED' }, ACTOR, TARGET)).toMatchObject({ code: 'reason_required' });
    expect(readStatusCommand({ status: 'REMOVED', reason: '   ' }, ACTOR, TARGET)).toMatchObject({ code: 'reason_required' });
    expect(readRoleCommand({ role: 'senior_moderator' }, ACTOR, TARGET, 'moderation')).toMatchObject({
      code: 'reason_required',
    });
    const suspended = commitStatusChange(active, 'SUSPENDED', 'cola llena', ctx);
    expect(suspended.ok && suspended.audit?.reason).toBe('cola llena');
  });

  it('acepta el rol del equipo y rechaza el de otro o un equipo desconocido', () => {
    expect(readAssignCommand({ userId: TARGET, teamId: 'moderation', role: 'moderator' }, ACTOR).ok).toBe(true);
    expect(readAssignCommand({ userId: TARGET, teamId: 'finance', role: 'moderator' }, ACTOR)).toMatchObject({
      code: 'invalid_role',
    });
    expect(readAssignCommand({ userId: TARGET, teamId: 'gerente', role: 'moderator' }, ACTOR)).toMatchObject({
      code: 'unknown_team',
    });
    expect(readAssignCommand({ userId: TARGET, teamId: 'moderacion', role: 'moderator' }, ACTOR)).toMatchObject({
      code: 'unknown_team',
    });
  });

  it('cada cambio real produce un solo evento con actor, target y request', () => {
    const added = commitAssign(null, {
      actorId: ACTOR,
      targetUserId: TARGET,
      teamId: 'hunter',
      role: 'hunter',
      reason: 'alta',
      requestId: REQUEST,
    });
    expect(added.ok && added.audit).toMatchObject({
      action: 'TEAM_MEMBER_ADDED',
      actorId: ACTOR,
      targetUserId: TARGET,
      requestId: REQUEST,
      previousState: null,
      newState: { team_id: 'hunter', role: 'hunter', status: 'ACTIVE' },
    });

    const role = commitRoleChange(active, 'senior_moderator', 'experiencia', ctx);
    expect(role.ok && role.audit).toMatchObject({
      action: 'TEAM_ROLE_CHANGED',
      previousState: { role: 'moderator' },
      newState: { role: 'senior_moderator' },
      actorId: ACTOR,
      targetUserId: TARGET,
      requestId: REQUEST,
    });

    const suspended = commitStatusChange(active, 'SUSPENDED', 'pausa', ctx);
    expect(suspended.ok && suspended.audit?.action).toBe('TEAM_MEMBERSHIP_SUSPENDED');
    expect(suspended.ok && suspended.audit?.previousState).toEqual({ status: 'ACTIVE' });
    expect(suspended.ok && suspended.audit?.newState).toEqual({ status: 'SUSPENDED' });

    const reactivated = commitStatusChange({ ...active, status: 'SUSPENDED' }, 'ACTIVE', null, ctx);
    expect(reactivated.ok && reactivated.audit?.action).toBe('TEAM_MEMBERSHIP_REACTIVATED');

    const removed = commitStatusChange(active, 'REMOVED', 'salida', ctx);
    expect(removed.ok && removed.audit?.action).toBe('TEAM_MEMBER_REMOVED');
    expect([added, role, suspended, reactivated, removed].filter((item) => item.ok && item.audit)).toHaveLength(5);
  });

  it('el usuario no puede asignarse, cambiarse el rol ni el estado', () => {
    expect(readAssignCommand({ userId: ACTOR, teamId: 'moderation', role: 'moderator' }, ACTOR)).toMatchObject({
      code: 'self_assignment',
    });
    expect(readRoleCommand({ role: 'senior_moderator', reason: 'yo' }, ACTOR, ACTOR, 'moderation')).toMatchObject({
      code: 'self_assignment',
    });
    expect(readStatusCommand({ status: 'ACTIVE', reason: 'yo' }, ACTOR, ACTOR)).toMatchObject({
      code: 'self_assignment',
    });
    expect(commitAssign(null, {
      actorId: ACTOR,
      targetUserId: ACTOR,
      teamId: 'moderation',
      role: 'moderator',
      reason: null,
      requestId: REQUEST,
    })).toMatchObject({ code: 'self_assignment' });
  });

  it('ignora un actor enviado en el cuerpo: el actor llega por argumento de sesión', () => {
    const command = readAssignCommand(
      { userId: TARGET, teamId: 'finance', role: 'finance_viewer', actorId: TARGET, roleGlobal: 'owner' },
      ACTOR,
    );
    expect(command.ok && command.targetUserId).toBe(TARGET);
  });

  it('dos altas concurrentes no dejan dos membresías vivas ni dos auditorías', async () => {
    let live: LiveMembership | null = null;
    const audits: string[] = [];
    const input = {
      actorId: ACTOR,
      targetUserId: TARGET,
      teamId: 'moderation',
      role: 'senior_moderator',
      reason: 'alta',
      requestId: REQUEST,
    };
    const results = await queue([
      () => {
        const result = commitAssign(live, { ...input, role: 'moderator' });
        if (result.ok && result.audit) {
          live = { role: 'moderator', status: 'ACTIVE' };
          audits.push(result.audit.action);
        }
        return result;
      },
      () => {
        const result = commitAssign(live, input);
        if (result.ok && result.audit) {
          live = { role: input.role, status: 'ACTIVE' };
          audits.push(result.audit.action);
        }
        return result;
      },
    ]);
    expect(live).toEqual({ role: 'moderator', status: 'ACTIVE' });
    expect(audits).toEqual(['TEAM_MEMBER_ADDED']);
    expect(results[1]).toMatchObject({ ok: false, code: 'live_membership_exists' });
  });

  it('dos cambios de estado concurrentes no reviven una membresía removida', async () => {
    let status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED' = 'ACTIVE';
    const audits: string[] = [];
    const results = await queue([
      () => {
        const result = commitStatusChange({ ...active, status }, 'REMOVED', 'salida', ctx);
        if (result.ok && result.audit) {
          status = result.status;
          audits.push(result.audit.action);
        }
        return result;
      },
      () => {
        const result = commitStatusChange({ ...active, status }, 'SUSPENDED', 'pausa', ctx);
        if (result.ok && result.audit) {
          status = result.status;
          audits.push(result.audit.action);
        }
        return result;
      },
    ]);
    expect(status).toBe('REMOVED');
    expect(audits).toEqual(['TEAM_MEMBER_REMOVED']);
    expect(results[1]).toMatchObject({ ok: false, code: 'invalid_transition' });
  });
});

describe('team membership schema contract', () => {
  const sql = readFileSync(
    join(process.cwd(), 'docs/supabase-migrations/team_os_memberships.sql'),
    'utf8',
  );

  it('el catálogo SQL coincide con Phase 1 y no escribe user_roles', () => {
    for (const teamId of TEAM_IDS) {
      const match = sql.match(new RegExp(`p_team = '${teamId}' AND p_role IN \\(([^)]+)\\)`));
      expect(match?.[1]?.split(',').map((role) => role.trim().replace(/'/g, ''))).toEqual([...TEAM_ROLES[teamId]]);
    }
    expect(sql).not.toMatch(/INSERT INTO public\.user_roles/i);
    expect(sql).not.toMatch(/UPDATE public\.user_roles/i);
    expect(sql).not.toMatch(/DELETE FROM public\.user_roles/i);
    expect(sql).not.toMatch(/DELETE FROM public\.team_memberships/i);
    expect(sql).not.toMatch(/DELETE FROM public\.team_audit_log/i);
  });

  it('cierra RLS, revoca a authenticated y deja un único vivo por usuario y equipo', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.team_memberships FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.team_audit_log FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.team_assign_member\(uuid, uuid, text, text, text, uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.team_change_role\(uuid, uuid, text, text, uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.team_set_status\(uuid, uuid, text, text, uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toMatch(/GRANT [^;]*team_memberships TO authenticated/i);
    expect(sql).not.toMatch(/GRANT [^;]*team_audit_log TO authenticated/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS team_memberships_one_live[\s\S]*WHERE status IN \('ACTIVE', 'SUSPENDED'\)/);
    expect(sql).toMatch(/FOR UPDATE/);
    expect(sql).toMatch(/unique_violation/);
    expect(sql).not.toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/BEFORE DELETE ON public\.team_memberships/);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.team_audit_log/);
  });

  it('no inventa step-up', () => {
    expect(TEAM_MANAGEMENT_STEP_UP.enforced).toBe(false);
    expect(TEAM_MANAGEMENT_STEP_UP.gate).toBe('requireOwner');
  });
});
