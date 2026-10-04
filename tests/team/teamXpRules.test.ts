import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canAccessAdmin } from '../../lib/admin/roles';
import { isStaffPathAllowed } from '../../lib/server/middlewareRoleGate';
import { membershipGrantsAdmin } from '../../lib/team/authz/authorize';
import { decideTeamEntry, membershipFromRow } from '../../lib/team/gate/policy';
import { composeTeamHero } from '../../lib/team/hero/adapters';
import { roleHasPermission } from '../../lib/team/permissions/grants';
import type { TeamMembership } from '../../lib/team/roles/membership';
import { formatTeamXpLabel } from '../../lib/team/xp/present';
import { TEAM_XP_RULES, rulesForTeam, teamsWithoutRules } from '../../lib/team/xp/rules/catalog';
import { evaluateTeamXpEvent } from '../../lib/team/xp/rules/engine';
import { commitRuleDecision, EMPTY_RULE_LEDGER, ruleBalance, type RuleLedgerState } from '../../lib/team/xp/rules/outcomes';
import type { ModerationOfferDecidedEvent, TeamXpRule } from '../../lib/team/xp/rules/types';

const MOD = 'mod-1';
const HUNTER = 'hunter-1';
const AUTHOR = 'author-1';

function member(
  userId: string,
  teamId: TeamMembership['teamId'],
  role: TeamMembership['role'],
  status: TeamMembership['status'] = 'ACTIVE',
): TeamMembership {
  return { userId, teamId, role, status } as TeamMembership;
}

function event(overrides: Partial<ModerationOfferDecidedEvent> = {}): ModerationOfferDecidedEvent {
  return {
    type: 'moderation.offer_decided',
    eventRef: 'moderation_logs:1',
    actorKind: 'human',
    actorUserId: MOD,
    offerId: 'offer-1',
    decision: 'approved',
    previousStatus: 'pending',
    offerAuthorId: AUTHOR,
    bulk: false,
    batchItem: null,
    ...overrides,
  };
}

const memberships = new Map<string, readonly TeamMembership[]>([
  [MOD, [member(MOD, 'moderation', 'moderator')]],
  [HUNTER, [member(HUNTER, 'hunter', 'hunter')]],
]);

function run(
  state: RuleLedgerState,
  input: ModerationOfferDecidedEvent,
  map: ReadonlyMap<string, readonly TeamMembership[]> = memberships,
  rules: readonly TeamXpRule[] = TEAM_XP_RULES,
  day = '2026-10-03',
) {
  let next = state;
  const statuses: string[] = [];
  for (const decision of evaluateTeamXpEvent(input, map, rules)) {
    const result = commitRuleDecision(next, decision, map.get(decision.recipientUserId) ?? [], day);
    next = result.state;
    statuses.push(`${decision.rule.id}:${result.status}${result.reason ? `:${result.reason}` : ''}`);
  }
  return { state: next, statuses };
}

describe('team xp rule engine', () => {
  it('1. una decisión válida concede Team XP de moderación', () => {
    const { state, statuses } = run(EMPTY_RULE_LEDGER, event());
    expect(statuses).toEqual(['moderation.offer_decision:granted']);
    expect(ruleBalance(state, MOD, 'moderation')).toBe(10);
  });

  it('2. un evento que no viene de pending no concede', () => {
    const { state, statuses } = run(EMPTY_RULE_LEDGER, event({ previousStatus: 'approved' }));
    expect(statuses).toEqual(['moderation.offer_decision:skipped:decision_from_pending']);
    expect(ruleBalance(state, MOD, 'moderation')).toBe(0);
  });

  it('3. un actor de otro equipo no concede moderación', () => {
    const map = new Map([[MOD, [member(MOD, 'growth', 'growth_member')]]]);
    const { statuses } = run(EMPTY_RULE_LEDGER, event(), map);
    expect(statuses).toEqual(['moderation.offer_decision:skipped:recipient_not_active']);
  });

  it('4-6. sin membresía, SUSPENDED o REMOVED no concede', () => {
    for (const list of [
      [],
      [member(MOD, 'moderation', 'moderator', 'SUSPENDED')],
      [member(MOD, 'moderation', 'moderator', 'REMOVED')],
    ]) {
      const { state } = run(EMPTY_RULE_LEDGER, event(), new Map([[MOD, list]]));
      expect(ruleBalance(state, MOD, 'moderation')).toBe(0);
    }
  });

  it('7. un evento de worker o sistema no produce XP humano', () => {
    expect(evaluateTeamXpEvent(event({ actorKind: 'worker' }), memberships)).toEqual([]);
    expect(evaluateTeamXpEvent(event({ actorKind: 'system' }), memberships)).toEqual([]);
  });

  it('8-9. un evento duplicado o reintentado no duplica XP', () => {
    const first = run(EMPTY_RULE_LEDGER, event());
    const retry = run(first.state, event());
    const replay = run(retry.state, event({ eventRef: 'moderation_logs:2' }));
    expect(retry.statuses).toEqual(['moderation.offer_decision:duplicate']);
    expect(replay.statuses).toEqual(['moderation.offer_decision:duplicate']);
    expect(ruleBalance(replay.state, MOD, 'moderation')).toBe(10);
    expect(replay.state.outcomes).toHaveLength(1);
  });

  it('10. una regla desactivada no concede', () => {
    const disabled = TEAM_XP_RULES.map((rule) => ({ ...rule, enabled: false }));
    expect(evaluateTeamXpEvent(event(), memberships, disabled)).toEqual([]);
  });

  it('11-12. la versión queda registrada y un cambio de regla no reescribe el pasado', () => {
    const first = run(EMPTY_RULE_LEDGER, event());
    expect(first.state.outcomes[0]).toMatchObject({ ruleId: 'moderation.offer_decision', ruleVersion: 1, amount: 10 });
    const v2 = TEAM_XP_RULES.map((rule) =>
      rule.id === 'moderation.offer_decision' ? { ...rule, version: 2, amount: 15 } : rule,
    );
    const later = run(first.state, event({ offerId: 'offer-2', eventRef: 'moderation_logs:2' }), memberships, v2);
    expect(later.state.outcomes[0]).toMatchObject({ ruleVersion: 1, amount: 10 });
    expect(later.state.outcomes[1]).toMatchObject({ ruleVersion: 2, amount: 15 });
    expect(ruleBalance(later.state, MOD, 'moderation')).toBe(25);
    const sameOffer = run(later.state, event(), memberships, v2);
    expect(sameOffer.statuses).toEqual(['moderation.offer_decision:duplicate']);
  });
});

describe('team xp anti-farming', () => {
  it('13. la misma oferta repetida no da XP ilimitado', () => {
    let state = EMPTY_RULE_LEDGER;
    for (let index = 0; index < 5; index += 1) {
      state = run(state, event({ eventRef: `moderation_logs:${index}`, decision: index % 2 ? 'rejected' : 'approved' })).state;
    }
    expect(ruleBalance(state, MOD, 'moderation')).toBe(10);
  });

  it('14. el spam choca con el tope diario', () => {
    const rule = rulesForTeam('moderation')[0];
    if (!rule) throw new Error('rule');
    let state = EMPTY_RULE_LEDGER;
    for (let index = 0; index < rule.dailyCap + 5; index += 1) {
      state = run(state, event({ offerId: `offer-${index}`, eventRef: `moderation_logs:${index}` })).state;
    }
    expect(ruleBalance(state, MOD, 'moderation')).toBe(rule.dailyCap * rule.amount);
    expect(state.outcomes.at(-1)?.reason).toBe('daily_cap');
    const nextDay = run(state, event({ offerId: 'offer-next', eventRef: 'moderation_logs:next' }), memberships, TEAM_XP_RULES, '2026-10-04');
    expect(nextDay.statuses).toEqual(['moderation.offer_decision:granted']);
  });

  it('15. decidir la oferta propia no concede', () => {
    const { statuses } = run(EMPTY_RULE_LEDGER, event({ offerAuthorId: MOD }));
    expect(statuses).toEqual(['moderation.offer_decision:skipped:actor_not_offer_author']);
  });

  it('16. el replay de la ruta devuelve duplicate', () => {
    const first = run(EMPTY_RULE_LEDGER, event());
    expect(run(first.state, event()).statuses).toEqual(['moderation.offer_decision:duplicate']);
  });

  it('17-20. el cliente no controla monto, actor, equipo ni regla', () => {
    const route = readFileSync('app/api/admin/moderate-offer/route.ts', 'utf8');
    const hook = route.slice(route.indexOf('recordModerationDecisionTeamXp(supabase'));
    const call = hook.slice(0, hook.indexOf('})'));
    expect(call).toContain('actorUserId: auth.user.id');
    expect(call).not.toMatch(/body\?*\.(amount|team|rule|actor|user)/);
    const source = readFileSync('lib/team/xp/rules/apply.ts', 'utf8');
    expect(source).toContain('p_amount: decision.rule.amount');
    expect(source).toContain('p_team_id: decision.rule.teamId');
    expect(source).toContain('p_rule_id: decision.rule.id');
    expect(source).not.toContain('request');
    const moderationSource = readFileSync('lib/team/xp/rules/moderationSource.ts', 'utf8');
    expect(moderationSource).toContain("actorKind: 'human'");
  });

  it('las acciones en lote no conceden', () => {
    const { statuses } = run(EMPTY_RULE_LEDGER, event({ bulk: true }));
    expect(statuses).toEqual(['moderation.offer_decision:skipped:not_bulk']);
  });
});

describe('team xp isolation', () => {
  it('21-22. moderación y hunter llevan acumulados separados', () => {
    const both = run(
      EMPTY_RULE_LEDGER,
      event({ batchItem: { id: 'item-1', submittedBy: HUNTER } }),
    );
    expect(both.statuses).toEqual([
      'moderation.offer_decision:granted',
      'hunter.batch_item_published:granted',
    ]);
    expect(ruleBalance(both.state, MOD, 'moderation')).toBe(10);
    expect(ruleBalance(both.state, MOD, 'hunter')).toBe(0);
    expect(ruleBalance(both.state, HUNTER, 'hunter')).toBe(15);
    expect(ruleBalance(both.state, HUNTER, 'moderation')).toBe(0);
  });

  it('23-24. Team XP y Community XP no se tocan', () => {
    const sql = readFileSync('docs/supabase-migrations/team_xp_rules.sql', 'utf8');
    const rules = readFileSync('lib/team/xp/rules/catalog.ts', 'utf8');
    expect(sql).not.toMatch(/achievement_xp|public\.profiles|achievement_xp_grants/);
    expect(rules).not.toContain('achievement');
    const achievements = readFileSync('lib/achievements/sync.ts', 'utf8');
    expect(achievements).not.toContain('team_xp');
  });

  it('25. un miembro de A no genera XP en B', () => {
    const map = new Map([
      [MOD, [member(MOD, 'moderation', 'moderator')]],
      [HUNTER, [member(HUNTER, 'growth', 'growth_member')]],
    ]);
    const { state, statuses } = run(
      EMPTY_RULE_LEDGER,
      event({ batchItem: { id: 'item-1', submittedBy: HUNTER } }),
      map,
    );
    expect(statuses[1]).toBe('hunter.batch_item_published:skipped:recipient_not_active');
    expect(ruleBalance(state, HUNTER, 'hunter')).toBe(0);
  });
});

describe('team xp domain integration', () => {
  it('26. la ruta de moderación evalúa reglas después de persistir el log', () => {
    const route = readFileSync('app/api/admin/moderate-offer/route.ts', 'utf8');
    const log = route.indexOf("from('moderation_logs').insert");
    const xp = route.indexOf('await recordModerationDecisionTeamXp');
    expect(log).toBeGreaterThan(0);
    expect(xp).toBeGreaterThan(log);
    expect(route).toContain('if (logId)');
    expect(route).not.toContain('void recordModerationDecisionTeamXp');
  });

  it('27. hunter solo gana con un envío humano aprobado por otra persona', () => {
    expect(run(EMPTY_RULE_LEDGER, event({ decision: 'rejected', batchItem: { id: 'item-1', submittedBy: HUNTER } })).statuses).toEqual([
      'moderation.offer_decision:granted',
      'hunter.batch_item_published:skipped:decision_approved',
    ]);
    const selfApproved = run(
      EMPTY_RULE_LEDGER,
      event({ actorUserId: HUNTER, batchItem: { id: 'item-1', submittedBy: HUNTER } }),
      new Map([[HUNTER, [member(HUNTER, 'hunter', 'hunter'), member(HUNTER, 'moderation', 'moderator')]]]),
    );
    expect(selfApproved.statuses).toContain('hunter.batch_item_published:skipped:recipient_not_actor');
    expect(evaluateTeamXpEvent(event({ actorKind: 'worker', batchItem: { id: 'item-1', submittedBy: HUNTER } }), memberships)).toEqual([]);
  });

  it('28. los equipos sin eventos reales no tienen reglas', () => {
    expect(teamsWithoutRules()).toEqual(['growth', 'product', 'community', 'operations', 'finance']);
    for (const rule of TEAM_XP_RULES) {
      expect(rule.antiFarming.length).toBeGreaterThan(0);
      expect(rule.id.startsWith(`${rule.teamId}.`)).toBe(true);
    }
  });

  it('las reglas automáticas no exigen el permiso manual de grant', () => {
    for (const rule of TEAM_XP_RULES) expect(rule.requiredPermission.endsWith('.xp.grant')).toBe(false);
    expect(roleHasPermission('moderation', 'moderator', 'moderation.xp.grant')).toBe(false);
  });

  it('29-30. Hero y selector muestran el acumulado por equipo', () => {
    const membership = membershipFromRow(MOD, { teamId: 'moderation', role: 'moderator', status: 'ACTIVE' });
    if (!membership) throw new Error('membership');
    const hero = composeTeamHero({
      membership,
      greeting: 'Hola',
      personName: 'Ana',
      communityXp: 900,
      teamXp: 10,
      facts: {
        teamId: 'moderation',
        facts: { pending: { origin: 'UNAVAILABLE' }, decisionsToday: { origin: 'UNAVAILABLE' } },
      },
    });
    expect(hero?.teamXp?.value).toBe('10');
    expect(hero?.communityXp?.value).toBe('900');
    expect(formatTeamXpLabel(15)).toBe('15 Team XP');
  });

  it('la base registra un resultado inmutable por clave y concede en la misma función', () => {
    const sql = readFileSync('docs/supabase-migrations/team_xp_rules.sql', 'utf8');
    expect(sql).toContain('team_xp_rule_outcomes');
    expect(sql).toContain('idempotency_key text PRIMARY KEY');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("'daily_cap'");
    expect(sql).toContain('rule_version');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).not.toContain('SECURITY DEFINER');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.apply_team_xp_rule');
    expect(readFileSync('app/api/cron/team-xp-reconcile/route.ts', 'utf8')).toContain('requireCronSecret');
  });
});

describe('team xp regressions', () => {
  it('31-35. admin, gate, shell y moderación siguen igual', () => {
    expect(membershipGrantsAdmin()).toBe(false);
    expect(canAccessAdmin('moderator')).toBe(false);
    expect(canAccessAdmin('owner')).toBe(true);
    expect(decideTeamEntry({ hasSession: false, gateValid: false, activeTeamIds: [], requestedTeam: null })).toBe('login');
    expect(isStaffPathAllowed('/equipo/moderacion', 'moderator')).toBe(true);
    expect(roleHasPermission('moderation', 'moderator', 'moderation.offers.decide')).toBe(true);
    expect(readFileSync('app/team/[team]/page.tsx', 'utf8')).toContain('ModerationWorkspace');
    expect(readFileSync('app/api/admin/moderate-offer/route.ts', 'utf8')).toContain('requireModerationActor');
  });
});
