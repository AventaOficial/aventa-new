import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { TeamMembership } from '../../lib/team/roles/membership';
import { teamProgressAccess } from '../../lib/team/progression/access';
import { applyTeamProgress, progressEligible, type ProgressStore } from '../../lib/team/progression/apply';
import { TEAM_ACHIEVEMENTS } from '../../lib/team/progression/achievements/catalog';
import {
  achievementProblems,
  achievementRpcArgs,
  achievementsForGrant,
  criteriaMet,
} from '../../lib/team/progression/achievements/engine';
import { commitAchievementAward, EMPTY_ACHIEVEMENT_LEDGER } from '../../lib/team/progression/achievements/model';
import type { TeamAchievementDefinition } from '../../lib/team/progression/achievements/types';
import { positionInTeam, rankTeam, type RankGrant, type RankMember } from '../../lib/team/progression/leaderboard/rank';
import { readLeaderboardRows, readLeaderboardSelf } from '../../lib/team/progression/leaderboard/read';
import { getTeamLevel, TEAM_LEVEL_THRESHOLDS, validateLevelThresholds } from '../../lib/team/progression/levels';
import { TEAM_MISSIONS } from '../../lib/team/progression/missions/catalog';
import { missionPeriodKey, missionProblems, missionsForGrant } from '../../lib/team/progression/missions/engine';
import { commitMissionEvent, EMPTY_MISSION_LEDGER, type MissionAdvanceInput } from '../../lib/team/progression/missions/model';
import type { TeamMissionDefinition } from '../../lib/team/progression/missions/types';
import { recognitionLine, streakLine, TEAM_XP_EXPLAINER } from '../../lib/team/progression/present';
import { recordActivityDay, visibleStreak } from '../../lib/team/progression/streaks';
import { isFreshTeamEvent, teamDay, weekStartDay } from '../../lib/team/progression/time';
import type { TeamXpApplyResult } from '../../lib/team/xp/rules/apply';
import { evaluateTeamXpEvent } from '../../lib/team/xp/rules/engine';
import { recordModerationDecisionTeamXp } from '../../lib/team/xp/rules/moderation';
import { moderationEventFromLog, readTeamXpSnapshot } from '../../lib/team/xp/rules/moderationSource';

const MOD = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000000b';
const HUNTER = '00000000-0000-0000-0000-0000000000f1';

function source(file: string): string {
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const SQL = source('docs/supabase-migrations/team_os_progression.sql');

function member(
  userId: string,
  teamId: TeamMembership['teamId'],
  role: string,
  status: TeamMembership['status'] = 'ACTIVE',
): TeamMembership {
  return { userId, teamId, role, status } as TeamMembership;
}

function logRow(overrides: Record<string, unknown> = {}, snapshot: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'log-1',
    offer_id: 'offer-1',
    user_id: MOD,
    action: 'approved',
    previous_status: 'pending',
    created_at: '2026-10-04T18:00:00.000Z',
    metadata: {
      team_xp: {
        v: 1,
        actorKind: 'human',
        bulk: false,
        offerAuthorId: OTHER,
        batchItem: { id: 'item-1', submittedBy: HUNTER },
        memberships: [
          { userId: MOD, teamId: 'moderation', role: 'moderator' },
          { userId: HUNTER, teamId: 'hunter', role: 'hunter' },
        ],
        ...snapshot,
      },
    },
    ...overrides,
  };
}

function grantResult(overrides: Partial<TeamXpApplyResult> = {}): TeamXpApplyResult {
  return {
    ruleId: 'moderation.offer_decision',
    ruleVersion: 1,
    teamId: 'moderation',
    recipientUserId: MOD,
    idempotencyKey: 'team-xp:moderation.offer_decision:offer-1',
    status: 'granted',
    reason: null,
    previous: null,
    ...overrides,
  };
}

function mission(overrides: Partial<TeamMissionDefinition> = {}): TeamMissionDefinition {
  return {
    id: 'moderation.validate_twenty',
    teamId: 'moderation',
    key: 'validate_twenty',
    version: 1,
    title: 'Valida 20 ofertas esta semana',
    description: 'Decisiones desde pending, sin lote',
    eventType: 'team_xp.rule_granted',
    ruleId: 'moderation.offer_decision',
    target: 20,
    xpReward: 50,
    period: 'weekly',
    active: true,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

function achievement(overrides: Partial<TeamAchievementDefinition> = {}): TeamAchievementDefinition {
  return {
    key: 'moderation.first_hundred',
    teamId: 'moderation',
    version: 1,
    title: '100 ofertas validadas',
    description: 'Cien decisiones contadas por la regla de moderación',
    criteria: { kind: 'rule_grants', ruleId: 'moderation.offer_decision', threshold: 100 },
    xpReward: 20,
    active: true,
    ...overrides,
  };
}

function fakeStore(failOn: string | null = null) {
  const calls: { name: string; args: Record<string, string | number | null> }[] = [];
  const receipts: string[] = [];
  const store: ProgressStore = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (failOn === name) return { ok: false, message: failOn === 'record_team_activity' ? 'stale_event' : 'boom' };
      return { ok: true, data: { status: 'recorded' } };
    },
    insertReceipt: async (key) => {
      receipts.push(key);
      return true;
    },
  };
  return { store, calls, receipts };
}

describe('Phase J — missions', () => {
  it('idempotencia: el mismo resultado no avanza dos veces', () => {
    const input: MissionAdvanceInput = {
      userId: MOD,
      activeMember: true,
      missionId: 'moderation.validate_two',
      missionVersion: 1,
      periodKey: 'week:2026-09-28',
      sourceKey: 'k1',
      target: 2,
      xp: 25,
      completedAt: '2026-10-04T18:00:00Z',
    };
    const first = commitMissionEvent(EMPTY_MISSION_LEDGER, input);
    expect(first.status).toBe('progressed');
    const replay = commitMissionEvent(first.state, input);
    expect(replay.status).toBe('duplicate');
    expect(replay.state).toBe(first.state);
  });

  it('se completa una sola vez y el XP se concede una vez', () => {
    const base: MissionAdvanceInput = {
      userId: MOD,
      activeMember: true,
      missionId: 'moderation.validate_two',
      missionVersion: 1,
      periodKey: 'week:2026-09-28',
      sourceKey: 'k1',
      target: 2,
      xp: 25,
      completedAt: '2026-10-04T18:00:00Z',
    };
    let state = commitMissionEvent(EMPTY_MISSION_LEDGER, base).state;
    const done = commitMissionEvent(state, { ...base, sourceKey: 'k2' });
    expect(done.status).toBe('completed');
    state = done.state;
    const extra = commitMissionEvent(state, { ...base, sourceKey: 'k3' });
    expect(extra.status).toBe('already_completed');
    expect(extra.state.xpGranted).toBe(25);
    const nextWeek = commitMissionEvent(extra.state, { ...base, sourceKey: 'k4', periodKey: 'week:2026-10-05' });
    expect(nextWeek.status).toBe('progressed');
  });

  it('carrera: llamadas serializadas por el lock no completan dos veces', () => {
    const base: MissionAdvanceInput = {
      userId: MOD,
      activeMember: true,
      missionId: 'moderation.validate_two',
      missionVersion: 1,
      periodKey: 'once',
      sourceKey: 'k1',
      target: 1,
      xp: 10,
      completedAt: '2026-10-04T18:00:00Z',
    };
    const a = commitMissionEvent(EMPTY_MISSION_LEDGER, base);
    const b = commitMissionEvent(a.state, { ...base, sourceKey: 'k2' });
    expect([a.status, b.status]).toEqual(['completed', 'already_completed']);
    expect(b.state.xpGranted).toBe(10);
    expect(SQL).toContain("hashtextextended(p_user_id::text || ':' || p_mission_id");
    expect(SQL).toContain('CONSTRAINT team_mission_completions_once UNIQUE (user_id, mission_id, mission_version, period_key)');
  });

  it('sin membresía ACTIVE no avanza', () => {
    const result = commitMissionEvent(EMPTY_MISSION_LEDGER, {
      userId: MOD,
      activeMember: false,
      missionId: 'moderation.validate_two',
      missionVersion: 1,
      periodKey: 'once',
      sourceKey: 'k1',
      target: 1,
      xp: 10,
      completedAt: '2026-10-04T18:00:00Z',
    });
    expect(result.status).toBe('skipped');
  });

  it('autorización: solo misiones del equipo y de la regla del resultado', () => {
    const catalog = [
      mission(),
      mission({ id: 'hunter.publish_ten', teamId: 'hunter', key: 'publish_ten', ruleId: 'hunter.batch_item_published' }),
      mission({ id: 'moderation.off', key: 'off', active: false }),
      mission({ id: 'moderation.cross', key: 'cross', ruleId: 'hunter.batch_item_published' }),
    ];
    const steps = missionsForGrant(
      { teamId: 'moderation', ruleId: 'moderation.offer_decision', occurredAt: '2026-10-04T18:00:00Z' },
      catalog,
    );
    expect(steps.map((step) => step.mission.id)).toEqual(['moderation.validate_twenty']);
    expect(steps[0].periodKey).toBe('week:2026-09-28');
  });

  it('una definición inválida nunca avanza', () => {
    expect(missionProblems(mission({ id: 'hunter.validate_twenty' }))).toContain('id');
    expect(missionProblems(mission({ target: 0 }))).toContain('target');
    expect(missionProblems(mission({ target: 1001 }))).toContain('target');
    expect(missionProblems(mission({ xpReward: 1001 }))).toContain('xp');
    expect(missionProblems(mission({ xpReward: -1 }))).toContain('xp');
    expect(missionProblems(mission({ ruleId: 'growth.made_up' }))).toContain('rule');
    expect(missionProblems(mission({ startsAt: '2026-10-05T00:00:00Z', endsAt: '2026-10-04T00:00:00Z' }))).toContain(
      'window',
    );
    expect(missionProblems(mission({ target: 1, xpReward: 0 }))).toEqual([]);
    expect(missionProblems(mission({ target: 1000, xpReward: 1000 }))).toEqual([]);
  });

  it('ventana start/end: fuera de rango no avanza', () => {
    const windowed = mission({ startsAt: '2026-10-05T06:00:00Z', endsAt: '2026-10-12T06:00:00Z' });
    expect(
      missionsForGrant({ teamId: 'moderation', ruleId: 'moderation.offer_decision', occurredAt: '2026-10-04T18:00:00Z' }, [windowed]),
    ).toEqual([]);
    expect(
      missionsForGrant({ teamId: 'moderation', ruleId: 'moderation.offer_decision', occurredAt: '2026-10-06T18:00:00Z' }, [windowed]),
    ).toHaveLength(1);
  });

  it('periodos en Ciudad de México', () => {
    expect(missionPeriodKey('daily', '2026-10-04T05:30:00Z')).toBe('day:2026-10-03');
    expect(missionPeriodKey('daily', '2026-10-04T06:30:00Z')).toBe('day:2026-10-04');
    expect(missionPeriodKey('weekly', '2026-10-04T18:00:00Z')).toBe('week:2026-09-28');
    expect(missionPeriodKey('monthly', '2026-11-01T05:00:00Z')).toBe('month:2026-10');
    expect(missionPeriodKey('once', '2026-10-04T18:00:00Z')).toBe('once');
  });

  it('el catálogo no activa misiones inventadas', () => {
    expect(TEAM_MISSIONS).toEqual([]);
  });

  it('SQL: progreso, eventos y completitud separados de la definición', () => {
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS public.team_mission_progress');
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS public.team_mission_events');
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS public.team_mission_completions');
    expect(SQL).toContain("split_part(p_mission_id, '.', 1) <> p_team_id");
    expect(SQL).toContain("RAISE EXCEPTION 'invalid_period'");
    expect(SQL).toContain("'mission', p_source_key");
  });
});

describe('Phase J — progreso server-side', () => {
  it('solo un resultado concedido mueve la progresión', () => {
    expect(progressEligible({ status: 'granted', previous: null })).toBe(true);
    expect(progressEligible({ status: 'duplicate', previous: 'granted' })).toBe(true);
    expect(progressEligible({ status: 'duplicate', previous: 'skipped' })).toBe(false);
    expect(progressEligible({ status: 'skipped', previous: null })).toBe(false);
    expect(progressEligible({ status: 'failed', previous: null })).toBe(false);
  });

  it('usuario, equipo y fuente salen del resultado persistido', async () => {
    const { store, calls, receipts } = fakeStore();
    const outcome = await applyTeamProgress(store, grantResult(), '2026-10-04T18:00:00Z', {
      missions: [mission()],
      achievements: [achievement()],
    });
    expect(outcome).toEqual({ status: 'applied', streak: 'recorded', missions: 1, achievements: 1 });
    expect(calls.map((call) => call.name)).toEqual(['record_team_activity', 'advance_team_mission', 'award_team_achievement']);
    for (const call of calls) {
      expect(call.args.p_user_id).toBe(MOD);
      expect(call.args.p_team_id).toBe('moderation');
      expect(call.args.p_source_key).toBe('team-xp:moderation.offer_decision:offer-1');
    }
    expect(receipts).toEqual(['team-xp:moderation.offer_decision:offer-1']);
  });

  it('un resultado omitido no llama a ningún RPC', async () => {
    const { store, calls, receipts } = fakeStore();
    const outcome = await applyTeamProgress(store, grantResult({ status: 'skipped', reason: 'daily_cap' }), '2026-10-04T18:00:00Z');
    expect(outcome.status).toBe('not_eligible');
    expect(calls).toEqual([]);
    expect(receipts).toEqual([]);
  });

  it('un fallo no deja recibo: la reconciliación lo repite', async () => {
    const { store, receipts } = fakeStore('advance_team_mission');
    const outcome = await applyTeamProgress(store, grantResult(), '2026-10-04T18:00:00Z', {
      missions: [mission()],
      achievements: [],
    });
    expect(outcome).toEqual({ status: 'failed', step: 'mission' });
    expect(receipts).toEqual([]);
  });

  it('evento viejo: la racha lo rechaza y el resto continúa', async () => {
    const { store, receipts } = fakeStore('record_team_activity');
    const outcome = await applyTeamProgress(store, grantResult(), '2026-10-01T18:00:00Z', { missions: [], achievements: [] });
    expect(outcome).toEqual({ status: 'applied', streak: 'stale', missions: 0, achievements: 0 });
    expect(receipts).toHaveLength(1);
  });

  it('SQL: toda progresión exige un resultado granted del mismo usuario y equipo', () => {
    expect(SQL).toContain("src.status <> 'granted' OR src.user_id <> p_user_id OR src.team_id <> p_team_id");
    expect(SQL.match(/PERFORM team_ops\.assert_granted_source/g)?.length).toBe(3);
  });
});

describe('Phase J — streaks', () => {
  it('doble evento el mismo día no suma', () => {
    const first = recordActivityDay(new Set(), null, '2026-10-04');
    expect(first.result.streak.currentStreak).toBe(1);
    const again = recordActivityDay(first.days, first.result.streak, '2026-10-04');
    expect(again.result.duplicate).toBe(true);
    expect(again.result.streak.currentStreak).toBe(1);
  });

  it('días consecutivos y fuera de orden', () => {
    let state = recordActivityDay(new Set(), null, '2026-10-04');
    state = recordActivityDay(state.days, state.result.streak, '2026-10-02');
    expect(state.result.streak.currentStreak).toBe(1);
    state = recordActivityDay(state.days, state.result.streak, '2026-10-03');
    expect(state.result.streak).toEqual({ currentStreak: 3, longestStreak: 3, lastActivityDate: '2026-10-04' });
  });

  it('un hueco reinicia la actual y conserva la mejor', () => {
    let state = recordActivityDay(new Set(), null, '2026-10-01');
    state = recordActivityDay(state.days, state.result.streak, '2026-10-02');
    state = recordActivityDay(state.days, state.result.streak, '2026-10-05');
    expect(state.result.streak).toEqual({ currentStreak: 1, longestStreak: 2, lastActivityDate: '2026-10-05' });
  });

  it('timezone America/Mexico_City', () => {
    expect(teamDay('2026-10-04T05:59:00Z')).toBe('2026-10-03');
    expect(teamDay('2026-10-04T06:00:00Z')).toBe('2026-10-04');
    expect(weekStartDay('2026-10-04')).toBe('2026-09-28');
    expect(weekStartDay('2026-09-28')).toBe('2026-09-28');
    expect(SQL).toContain("(p_occurred_at AT TIME ZONE 'America/Mexico_City')::date");
    expect(SQL).toContain("CHECK (timezone = 'America/Mexico_City')");
  });

  it('racha visible: hoy o ayer cuenta; antes, cero', () => {
    const streak = { currentStreak: 4, longestStreak: 6, lastActivityDate: '2026-10-03' };
    expect(visibleStreak(streak, '2026-10-03')).toBe(4);
    expect(visibleStreak(streak, '2026-10-04')).toBe(4);
    expect(visibleStreak(streak, '2026-10-05')).toBe(0);
    expect(visibleStreak(null, '2026-10-05')).toBe(0);
  });

  it('eventos antiguos y futuros quedan fuera', () => {
    const now = new Date('2026-10-04T18:00:00Z');
    expect(isFreshTeamEvent('2026-10-03T18:00:00Z', now)).toBe(true);
    expect(isFreshTeamEvent('2026-10-02T16:00:00Z', now)).toBe(false);
    expect(isFreshTeamEvent('2026-10-04T18:10:00Z', now)).toBe(false);
    expect(isFreshTeamEvent('no-date', now)).toBe(false);
    expect(SQL).toContain("p_occurred_at < now() - interval '49 hours'");
    expect(SQL).toContain("RAISE EXCEPTION 'stale_event'");
  });

  it('copy: trabajo validado, no visitas', () => {
    expect(streakLine(0)).toContain('trabajo queda validado');
    expect(streakLine(3)).toBe('3 días seguidos con trabajo validado');
  });
});

describe('Phase J — leaderboard', () => {
  const day = '2026-10-04';
  const members: RankMember[] = [
    { userId: 'a', teamId: 'moderation', status: 'ACTIVE' },
    { userId: 'b', teamId: 'moderation', status: 'ACTIVE' },
    { userId: 'c', teamId: 'moderation', status: 'ACTIVE' },
    { userId: 's', teamId: 'moderation', status: 'SUSPENDED' },
    { userId: 'r', teamId: 'moderation', status: 'REMOVED' },
    { userId: 'h', teamId: 'hunter', status: 'ACTIVE' },
  ];
  const grants: RankGrant[] = [
    { userId: 'a', teamId: 'moderation', amount: 30, origin: 'rule', day },
    { userId: 'b', teamId: 'moderation', amount: 20, origin: 'rule', day },
    { userId: 'b', teamId: 'moderation', amount: 10, origin: 'mission', day },
    { userId: 'c', teamId: 'moderation', amount: 10, origin: 'rule', day: '2026-09-01' },
    { userId: 'c', teamId: 'moderation', amount: 5000, origin: 'manual', day },
    { userId: 's', teamId: 'moderation', amount: 900, origin: 'rule', day },
    { userId: 'r', teamId: 'moderation', amount: 800, origin: 'rule', day },
    { userId: 'h', teamId: 'hunter', amount: 700, origin: 'rule', day },
  ];

  it('ranking con empates (rank de SQL)', () => {
    const rows = rankTeam('moderation', grants, members, { fromDay: '2026-09-28', toDay: day }, 10);
    expect(rows).toEqual([
      { position: 1, userId: 'a', xp: 30 },
      { position: 1, userId: 'b', xp: 30 },
    ]);
  });

  it('all_time incluye días anteriores; el periodo no', () => {
    const rows = rankTeam('moderation', grants, members, { fromDay: null, toDay: day }, 10);
    expect(rows.map((row) => row.userId)).toEqual(['a', 'b', 'c']);
    expect(rows[2]).toEqual({ position: 3, userId: 'c', xp: 10 });
  });

  it('XP manual no rankea', () => {
    const rows = rankTeam('moderation', grants, members, { fromDay: null, toDay: day }, 10);
    expect(rows.find((row) => row.userId === 'c')?.xp).toBe(10);
  });

  it('aislamiento por equipo', () => {
    expect(rankTeam('hunter', grants, members, { fromDay: null, toDay: day }, 10)).toEqual([
      { position: 1, userId: 'h', xp: 700 },
    ]);
  });

  it('suspendidos y removidos quedan fuera y no tienen posición', () => {
    const ids = rankTeam('moderation', grants, members, { fromDay: null, toDay: day }, 10).map((row) => row.userId);
    expect(ids).not.toContain('s');
    expect(ids).not.toContain('r');
    expect(positionInTeam('moderation', 's', grants, members, { fromDay: null, toDay: day })).toBeNull();
    expect(positionInTeam('moderation', 'r', grants, members, { fromDay: null, toDay: day })).toBeNull();
  });

  it('posición propia sin descargar el ranking', () => {
    expect(positionInTeam('moderation', 'c', grants, members, { fromDay: null, toDay: day })).toEqual({
      position: 3,
      xp: 10,
      rankedMembers: 3,
    });
    expect(positionInTeam('moderation', 'c', grants, members, { fromDay: '2026-10-04', toDay: day })).toEqual({
      position: null,
      xp: 0,
      rankedMembers: 2,
    });
  });

  it('la UI no recibe user ids', () => {
    const entries = readLeaderboardRows(
      [
        { rank_position: 1, member_id: MOD, display_name: 'Ana', xp: '40' },
        { rank_position: 2, member_id: OTHER, display_name: null, xp: 20 },
        { rank_position: 'x', member_id: OTHER, display_name: 'bad', xp: 1 },
      ],
      MOD,
    );
    expect(entries).toEqual([
      { position: 1, displayName: 'Ana', teamXp: 40, isSelf: true },
      { position: 2, displayName: 'Miembro del equipo', teamXp: 20, isSelf: false },
    ]);
    expect(JSON.stringify(entries)).not.toContain(MOD);
    expect(readLeaderboardSelf([{ rank_position: null, xp: 0, ranked_members: 3 }])).toEqual({
      position: null,
      teamXp: 0,
      rankedMembers: 3,
    });
  });

  it('SQL: solo ACTIVE, solo XP automático, ventanas y límite', () => {
    expect(SQL).toContain("m.status = 'ACTIVE'");
    expect(SQL).toContain('rank() OVER (ORDER BY b.ranked_xp DESC)');
    expect(SQL).toContain("WHERE origin <> 'manual'");
    expect(SQL).toContain("p_period NOT IN ('daily', 'weekly', 'monthly', 'all_time')");
    expect(SQL).toContain('p_limit < 1 OR p_limit > 100');
    expect(SQL).toContain('team_xp_balances_rank_idx');
    expect(SQL).toContain('PRIMARY KEY (team_id, day, user_id)');
    const read = readFileSync('lib/team/progression/leaderboard/read.ts', 'utf8');
    expect(read).toContain('p_team_id: membership.teamId');
    expect(read).toContain('p_user_id: membership.userId');
  });
});

describe('Phase J — Team XP vs Community XP', () => {
  it('ranking, niveles y SQL no leen XP de comunidad', () => {
    expect(SQL).not.toContain('profiles.achievement_xp,');
    expect(SQL).not.toMatch(/SELECT[^;]*achievement_xp/);
    for (const file of [
      'lib/team/progression/levels.ts',
      'lib/team/progression/read.ts',
      'lib/team/progression/leaderboard/rank.ts',
      'lib/team/progression/leaderboard/read.ts',
      'lib/team/progression/apply.ts',
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('achievement_xp');
      expect(source).not.toContain('getCommunityXP');
    }
  });

  it('achievements de comunidad intactos y separados', () => {
    expect(readFileSync('lib/achievements/sync.ts', 'utf8')).not.toContain('team_');
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS public.team_achievement_awards');
    expect(SQL).not.toContain('public.user_achievements');
  });

  it('la UI explica la diferencia', () => {
    expect(TEAM_XP_EXPLAINER).toContain('Team XP');
    expect(TEAM_XP_EXPLAINER).toContain('XP de comunidad');
  });
});

describe('Phase J — Team Achievements', () => {
  it('se concede una sola vez por user + team + key', () => {
    const facts = { ruleGrants: { 'moderation.offer_decision': 120 }, longestStreak: 0 };
    const first = commitAchievementAward(EMPTY_ACHIEVEMENT_LEDGER, {
      userId: MOD,
      activeMember: true,
      achievement: achievement(),
      facts,
    });
    expect(first.status).toBe('awarded');
    const replay = commitAchievementAward(first.state, {
      userId: MOD,
      activeMember: true,
      achievement: achievement({ version: 2 }),
      facts,
    });
    expect(replay.status).toBe('duplicate');
    expect(replay.state.xpGranted).toBe(20);
    expect(SQL).toContain('CONSTRAINT team_achievement_awards_once UNIQUE (user_id, team_id, achievement_key)');
  });

  it('criterio no alcanzado o membresía inactiva no concede', () => {
    expect(
      commitAchievementAward(EMPTY_ACHIEVEMENT_LEDGER, {
        userId: MOD,
        activeMember: true,
        achievement: achievement(),
        facts: { ruleGrants: { 'moderation.offer_decision': 99 }, longestStreak: 0 },
      }).status,
    ).toBe('not_met');
    expect(
      commitAchievementAward(EMPTY_ACHIEVEMENT_LEDGER, {
        userId: MOD,
        activeMember: false,
        achievement: achievement(),
        facts: { ruleGrants: { 'moderation.offer_decision': 500 }, longestStreak: 0 },
      }).status,
    ).toBe('skipped');
    expect(criteriaMet({ kind: 'longest_streak', threshold: 7 }, { ruleGrants: {}, longestStreak: 7 })).toBe(true);
  });

  it('el llamador no afirma métricas: el SQL las cuenta', () => {
    const args = achievementRpcArgs(achievement(), { userId: MOD, sourceKey: 'k1' });
    expect(Object.keys(args)).not.toContain('p_metric');
    expect(args.p_team_id).toBe('moderation');
    expect(SQL).toContain("RETURN jsonb_build_object('status', 'not_met'");
    expect(SQL).toContain('FROM public.team_xp_grants\n    WHERE user_id = p_user_id AND team_id = p_team_id');
  });

  it('definición inválida o de otro equipo no se verifica', () => {
    expect(achievementProblems(achievement({ key: 'hunter.first_hundred' }))).toContain('team');
    expect(achievementProblems(achievement({ xpReward: 1001 }))).toContain('xp');
    expect(
      achievementProblems(achievement({ criteria: { kind: 'rule_grants', ruleId: 'hunter.batch_item_published', threshold: 5 } })),
    ).toContain('rule');
    expect(achievementsForGrant({ teamId: 'hunter', ruleId: 'hunter.batch_item_published' }, [achievement()])).toEqual([]);
    expect(TEAM_ACHIEVEMENTS).toEqual([]);
  });
});

describe('Phase J — levels', () => {
  it('cálculo y límites', () => {
    expect(getTeamLevel('moderation', 0).level).toBe(1);
    expect(getTeamLevel('moderation', 99).level).toBe(1);
    expect(getTeamLevel('moderation', 100).level).toBe(2);
    expect(getTeamLevel('moderation', 299).xpToNext).toBe(1);
    const top = getTeamLevel('moderation', 1_000_000);
    expect(top.level).toBe(TEAM_LEVEL_THRESHOLDS.moderation.length);
    expect(top.nextLevelAt).toBeNull();
    expect(top.progress).toBe(1);
    expect(getTeamLevel('moderation', -50).level).toBe(1);
    expect(getTeamLevel('moderation', Number.NaN).teamXp).toBe(0);
    expect(getTeamLevel('moderation', 150).progress).toBeCloseTo(0.25);
  });

  it('monotónica y determinista', () => {
    let previous = 0;
    for (let xp = 0; xp <= 12000; xp += 37) {
      const level = getTeamLevel('hunter', xp).level;
      expect(level).toBeGreaterThanOrEqual(previous);
      expect(getTeamLevel('hunter', xp).level).toBe(level);
      previous = level;
    }
  });

  it('tabla configurable y validada', () => {
    expect(validateLevelThresholds([0, 10, 20])).toBe(true);
    expect(validateLevelThresholds([5, 10])).toBe(false);
    expect(validateLevelThresholds([0, 10, 10])).toBe(false);
    expect(validateLevelThresholds([])).toBe(false);
    const custom = { ...TEAM_LEVEL_THRESHOLDS, moderation: [0, 10, 20] };
    expect(getTeamLevel('moderation', 15, custom).level).toBe(2);
    expect(() => getTeamLevel('moderation', 1, { ...TEAM_LEVEL_THRESHOLDS, moderation: [3] })).toThrow('invalid_level_table');
  });

  it('una sola fuente: la UI no define umbrales', () => {
    const panel = readFileSync('app/team/progress/TeamProgressPanel.tsx', 'utf8');
    expect(panel).not.toMatch(/\[0,\s*100/);
    expect(panel).not.toContain('getTeamLevel');
  });
});

describe('Phase J — evento persistido, replay y datos del cliente', () => {
  it('la foto del contexto produce el evento; sin foto no hay evento', () => {
    const parsed = moderationEventFromLog(logRow());
    expect(parsed?.event.eventRef).toBe('moderation_logs:log-1');
    expect(parsed?.occurredAt).toBe('2026-10-04T18:00:00.000Z');
    expect(moderationEventFromLog(logRow({ metadata: {} }))).toBeNull();
    expect(moderationEventFromLog(logRow({ metadata: null }))).toBeNull();
    expect(moderationEventFromLog(logRow({ previous_status: null }))).toBeNull();
  });

  it('bulk se lee del evento persistido, no se asume', () => {
    const parsed = moderationEventFromLog(logRow({}, { bulk: true }));
    expect(parsed?.event.bulk).toBe(true);
    const decisions = parsed ? evaluateTeamXpEvent(parsed.event, parsed.memberships) : [];
    expect(decisions.every((decision) => decision.skipReason === 'not_bulk')).toBe(true);
    expect(readTeamXpSnapshot({ team_xp: { ...logRow().metadata as object, bulk: 'yes' } })).toBeNull();
  });

  it('membresía del momento del evento, no la actual', () => {
    const parsed = moderationEventFromLog(logRow({}, { memberships: [] }));
    const decisions = parsed ? evaluateTeamXpEvent(parsed.event, parsed.memberships) : [];
    expect(decisions.map((decision) => decision.skipReason)).toEqual(['recipient_not_active', 'recipient_not_active']);
    const reconcile = readFileSync('lib/team/xp/rules/moderation.ts', 'utf8');
    expect(reconcile).not.toContain('loadActiveMemberships');
    expect(readFileSync('lib/team/xp/rules/apply.ts', 'utf8')).not.toContain('loadActiveMemberships');
  });

  it('replay: misma fila → mismas llaves de idempotencia', () => {
    const a = moderationEventFromLog(logRow());
    const b = moderationEventFromLog(logRow());
    const keys = (value: typeof a) =>
      value ? evaluateTeamXpEvent(value.event, value.memberships).map((decision) => decision.idempotencyKey) : [];
    expect(keys(a)).toEqual(keys(b));
    expect(keys(a)).toEqual([
      'team-xp:moderation.offer_decision:offer-1',
      'team-xp:hunter.batch_item_published:item-1',
    ]);
  });

  it('rol o equipo inventado en la foto no concede', () => {
    const parsed = moderationEventFromLog(
      logRow({}, { memberships: [{ userId: MOD, teamId: 'moderation', role: 'owner' }, { userId: HUNTER, teamId: 'admin', role: 'hunter' }] }),
    );
    expect(parsed?.memberships.size).toBe(0);
  });

  it('ids de usuario inválidos no producen evento', () => {
    expect(moderationEventFromLog(logRow({ user_id: null }))).toBeNull();
    expect(moderationEventFromLog(logRow({ user_id: '' }))).toBeNull();
    expect(moderationEventFromLog(logRow({}, { batchItem: { id: 'item-1', submittedBy: 42 } }))).toBeNull();
    expect(moderationEventFromLog(logRow({ action: 'expired' }))).toBeNull();
  });

  it('la ruta en vivo rechaza un actor distinto al de la fila', async () => {
    const unused = {} as SupabaseClient;
    await expect(
      recordModerationDecisionTeamXp(unused, { logId: 'log-1', actorUserId: OTHER, logRow: logRow() }),
    ).resolves.toEqual({ results: [], progress: [] });
    await expect(
      recordModerationDecisionTeamXp(unused, { logId: 'log-2', actorUserId: MOD, logRow: logRow() }),
    ).resolves.toEqual({ results: [], progress: [] });
  });

  it('la ruta congela el contexto en la misma fila del log', () => {
    const route = source('app/api/admin/moderate-offer/route.ts');
    expect(route).toContain('buildModerationTeamXpSnapshot(supabase, {\n      actorUserId: auth.user.id');
    expect(route).toContain('metadata: { team_xp: teamXpSnapshot }');
    expect(route.indexOf('buildModerationTeamXpSnapshot(supabase')).toBeLessThan(route.indexOf("from('moderation_logs').insert"));
    expect(route).not.toContain('body?.team');
    expect(route).not.toContain('body?.role');
  });
});

describe('Phase J — reconciliación y performance', () => {
  it('un solo cron, paginado, sobre created_at indexado', () => {
    const vercel = readFileSync('vercel.json', 'utf8');
    expect(vercel.match(/team-xp-reconcile/g)?.length).toBe(1);
    const index = readFileSync('docs/supabase-migrations/moderation_logs_created_at_index.sql', 'utf8');
    expect(index).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS moderation_logs_created_at_idx');
    expect(index).toContain('ON public.moderation_logs (created_at)');
    const reconcile = readFileSync('lib/team/xp/rules/moderation.ts', 'utf8');
    expect(reconcile).toContain(".gte('created_at', cursor)");
    expect(reconcile).toContain('RECONCILE_MAX_PAGES');
    expect(reconcile).toContain("from('team_xp_rule_outcomes')");
    expect(reconcile).toContain("from('team_xp_progress_receipts')");
  });

  it('el ranking no suma el ledger completo', () => {
    const fn = SQL.slice(SQL.indexOf('CREATE OR REPLACE FUNCTION team_ops.team_leaderboard('));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).not.toContain('team_xp_grants');
    expect(body).toContain('team_xp_daily_totals');
  });

  it('migración forward-only, sin DEFINER, sin DROP de tablas', () => {
    expect(SQL).not.toContain('SECURITY DEFINER');
    expect(SQL).not.toMatch(/DROP TABLE/);
    expect(SQL).not.toMatch(/DROP COLUMN/);
    expect(SQL).toContain('FORCE ROW LEVEL SECURITY');
    expect(SQL).toContain('REVOKE ALL ON TABLE public.team_streaks FROM PUBLIC, anon, authenticated');
    expect(SQL).toContain("RAISE EXCEPTION 'invalid_team'");
  });
});

describe('Phase J — integración en Team OS', () => {
  it('panel solo con regla real y permiso, no por membresía', () => {
    expect(teamProgressAccess(member(MOD, 'moderation', 'moderator'))).toBe(true);
    expect(teamProgressAccess(member(HUNTER, 'hunter', 'hunter'))).toBe(true);
    expect(teamProgressAccess(member(MOD, 'moderation', 'moderator', 'SUSPENDED'))).toBe(false);
    expect(teamProgressAccess(member(MOD, 'finance', 'finance_viewer'))).toBe(false);
    expect(teamProgressAccess(member(MOD, 'growth', 'growth_member'))).toBe(false);
  });

  it('mismo shell y misma ruta', () => {
    const page = readFileSync('app/team/[team]/page.tsx', 'utf8');
    expect(page).toContain('teamProgressAccess(entry.membership)');
    expect(page).toContain('<TeamProgressPanel');
    expect(page.match(/<TeamShell/g)?.length).toBe(1);
  });

  it('reconocimiento de trabajo real, sin lenguaje de juego', () => {
    expect(recognitionLine('moderation.offer_decision', 24)).toBe('Has ayudado a validar 24 ofertas');
    expect(recognitionLine('hunter.batch_item_published', 1)).toBe('1 hallazgo tuyo ya está publicado');
    expect(recognitionLine('growth.anything', 5)).toBeNull();
    const copy = [
      readFileSync('lib/team/progression/present.ts', 'utf8'),
      readFileSync('app/team/progress/TeamProgressPanel.tsx', 'utf8'),
    ].join('\n').toLowerCase();
    for (const word of ['gema', 'loot', 'legendari', 'moneda', 'cofre', 'casino']) expect(copy).not.toContain(word);
  });

  it('fuera de scope intacto', () => {
    const files = [
      'lib/team/progression/apply.ts',
      'lib/team/progression/read.ts',
      'lib/team/progression/access.ts',
      'lib/team/xp/rules/moderation.ts',
      'lib/team/xp/rules/moderationSource.ts',
      'app/team/progress/TeamProgressPanel.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const word of ['user_roles', 'commission', 'payout', 'settlement', 'admin/owner']) expect(source).not.toContain(word);
    }
    expect(SQL).not.toContain('public.user_roles');
  });
});
