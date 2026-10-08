import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ActorType } from '@/lib/actors/actorType';
import { supplyWindows } from '@/lib/owner/supplyDomain';
import {
  buildSupplyIntelligence,
  classifySupplyAuthor,
  type CreatedSupplyOffer,
  type SupplyDecision,
  type SupplyLaneObservation,
} from '@/lib/owner/supplyIntelligence';
import { DEFAULT_SUPPLY_THRESHOLDS } from '@/lib/owner/supplyThresholds';

const NOW = new Date('2026-10-08T18:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const quiet = { ...DEFAULT_SUPPLY_THRESHOLDS, pendingWarning: 10_000, pendingCritical: 10_000 };

function offer(partial: Partial<CreatedSupplyOffer> & Pick<CreatedSupplyOffer, 'id' | 'createdAt'>): CreatedSupplyOffer {
  return {
    createdBy: 'human-1',
    status: 'approved',
    store: 'Amazon',
    category: 'Hogar',
    ...partial,
  };
}

function decision(partial: Partial<SupplyDecision> & Pick<SupplyDecision, 'action' | 'at'>): SupplyDecision {
  return { ...partial };
}

function lane(partial: SupplyLaneObservation): SupplyLaneObservation {
  return partial;
}

const directory = {
  classify(userId: string | null | undefined): ActorType {
    if (userId === 'machine') return 'MACHINE_HUNTER';
    if (userId === 'system') return 'SYSTEM';
    if (!userId) return 'HUMAN';
    return 'HUMAN';
  },
};

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('supply intelligence', () => {
  it('no cuenta un autor vacío como humano aunque el directorio lo haría', () => {
    expect(classifySupplyAuthor(null, directory)).toBe('UNATTRIBUTED');
    expect(classifySupplyAuthor('  ', directory)).toBe('UNATTRIBUTED');
    expect(classifySupplyAuthor('', { classify: () => 'HUMAN' })).toBe('UNATTRIBUTED');
    expect(classifySupplyAuthor('human-1', { classify: () => 'OTRO' as ActorType })).toBe('UNAVAILABLE');
  });

  it('máquina y sistema no entran en la oferta humana', () => {
    const report = buildSupplyIntelligence({
      now: NOW,
      pendingNow: 0,
      directory,
      thresholds: quiet,
      offers: [
        offer({ id: '1', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'human-1' }),
        offer({ id: '2', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'machine' }),
        offer({ id: '3', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'system' }),
        offer({ id: '4', createdAt: '2026-10-08T16:00:00.000Z', createdBy: null }),
      ],
      decisions: [],
      lanes: [lane({ offerId: '2', sourceLane: 'community' })],
    });
    expect(report.actorMix.d30).toEqual({ human: 1, machineHunter: 1, system: 1, unattributed: 1 });
    expect(report.humans?.humanOffers).toBe(1);
    expect(report.humans?.machineOffers).toBe(1);
    expect(report.humans?.systemOffers).toBe(1);
    expect(report.humans?.status).toBe('INSUFFICIENT_DATA');
    expect(report.humans?.topHumanPct).toBeNull();
  });

  it('un carril community no convierte a un cazador en humano', () => {
    const report = buildSupplyIntelligence({
      now: NOW,
      pendingNow: 0,
      directory,
      thresholds: quiet,
      offers: [
        offer({ id: '1', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'machine' }),
        offer({ id: '2', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'human-1' }),
      ],
      decisions: [],
      lanes: [
        lane({ offerId: '1', sourceLane: 'community' }),
        lane({ offerId: '2', sourceLane: 'machine' }),
      ],
    });
    expect(report.actorMix.d30).toEqual({ human: 1, machineHunter: 1, system: 0, unattributed: 0 });
    expect(report.source).toMatchObject({ community: 1, machine: 1 });
    expect(report.humans?.humanOffers).toBe(1);
    expect(report.humans?.machineOffers).toBe(1);
  });

  it('sin directorio no publica la mezcla como humana', () => {
    const report = buildSupplyIntelligence({
      now: NOW,
      pendingNow: 0,
      directory: null,
      thresholds: quiet,
      offers: [offer({ id: '1', createdAt: '2026-10-08T16:00:00.000Z' })],
      decisions: [],
    });
    expect(report.actorMix.d30).toBeNull();
    expect(report.humans).toBeNull();
    expect(report.health.conditions.some((item) => item.code === 'actor_directory_unavailable')).toBe(true);
  });

  it('separa creadas, decisiones y pendientes actuales', () => {
    const report = buildSupplyIntelligence({
      now: NOW,
      pendingNow: 4,
      directory,
      offers: [
        offer({ id: 'old', createdAt: '2026-09-01T12:00:00.000Z', status: 'pending' }),
        offer({ id: 'today', createdAt: '2026-10-08T16:00:00.000Z', status: 'pending' }),
      ],
      decisions: [
        decision({ action: 'approved', at: '2026-10-08T17:00:00.000Z' }),
        decision({ action: 'rejected', at: '2026-10-07T17:00:00.000Z' }),
      ],
    });
    expect(report.volume.today).toMatchObject({ created: 1, approved: 1, rejected: 0 });
    expect(report.volume.d7).toMatchObject({ created: 1, approved: 1, rejected: 1 });
    expect(report.pendingNow).toBe(4);
    expect(report.volume.today?.created).not.toBe(report.pendingNow);
  });

  it('hoy empieza en la medianoche de México y 7 días no absorbe el día 8', () => {
    const report = buildSupplyIntelligence({
      now: NOW,
      pendingNow: 0,
      directory,
      offers: [
        offer({ id: 'before-midnight', createdAt: '2026-10-08T05:59:00.000Z' }),
        offer({ id: 'after-midnight', createdAt: '2026-10-08T06:00:00.000Z' }),
        offer({ id: 'eight-days', createdAt: '2026-09-30T17:00:00.000Z' }),
      ],
      decisions: [],
    });
    expect(report.volume.today?.created).toBe(1);
    expect(report.volume.d7?.created).toBe(2);
    expect(report.volume.d30?.created).toBe(3);
  });

  it('el límite exacto de 7 y 30 días es inclusivo al inicio y exclusivo al final', () => {
    const windows = supplyWindows(NOW);
    const at7 = new Date(windows.d7.startMs).toISOString();
    const before7 = new Date(windows.d7.startMs - 1).toISOString();
    const at30 = new Date(windows.d30.startMs).toISOString();
    const before30 = new Date(windows.d30.startMs - 1).toISOString();
    const atEnd = new Date(windows.d7.endMs).toISOString();
    const report = buildSupplyIntelligence({
      now: NOW,
      pendingNow: 0,
      directory,
      offers: [
        offer({ id: 'at7', createdAt: at7 }),
        offer({ id: 'before7', createdAt: before7 }),
        offer({ id: 'at30', createdAt: at30 }),
        offer({ id: 'before30', createdAt: before30 }),
        offer({ id: 'end', createdAt: atEnd }),
      ],
      decisions: [
        decision({ action: 'approved', at: at7 }),
        decision({ action: 'rejected', at: before7 }),
        decision({ action: 'approved', at: at30 }),
        decision({ action: 'rejected', at: before30 }),
      ],
    });
    expect(windows.d7.endMs - windows.d7.startMs).toBe(7 * DAY_MS);
    expect(windows.d30.endMs - windows.d30.startMs).toBe(30 * DAY_MS);
    expect(windows.today.startMs).toBe(Date.parse('2026-10-08T06:00:00.000Z'));
    expect(report.volume.d7).toMatchObject({ created: 1, approved: 1, rejected: 0 });
    expect(report.volume.d30).toMatchObject({ created: 3, approved: 2, rejected: 1 });
  });

  it('la concentración humana no mezcla cazadores ni sistema', () => {
    const offers = [
      ...Array.from({ length: 8 }, (_, index) =>
        offer({ id: `m-${index}`, createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'machine' }),
      ),
      offer({ id: 'h1', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'human-1' }),
      offer({ id: 'h2', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'human-2' }),
    ];
    const report = buildSupplyIntelligence({
      now: NOW,
      pendingNow: 0,
      directory,
      thresholds: {
        ...quiet,
        topAuthorWarning: 0.9,
        topAuthorCritical: 0.95,
        top3Warning: 1.1,
        top3Critical: 1.1,
        minAttributedForActorHealth: 1,
      },
      offers,
      decisions: [],
    });
    expect(report.humans).toMatchObject({
      status: 'ok',
      uniqueHumans: 2,
      humanOffers: 2,
      machineOffers: 8,
      systemOffers: 0,
      unattributed: 0,
      coverage: 1,
      topHumanPct: 0.5,
    });
    expect(report.health.conditions.some((item) => item.code === 'author_concentration')).toBe(false);
    expect(report.health.conditions.some((item) => item.code === 'machine_dependence' && item.level === 'WARNING')).toBe(true);
  });

  it('publica la participación del contribuidor humano sobre la oferta humana', () => {
    const offers = [
      ...Array.from({ length: 8 }, (_, index) => offer({ id: `a-${index}`, createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'human-1' })),
      offer({ id: 'b', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'human-2' }),
      offer({ id: 'c', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'human-3' }),
      offer({ id: 'ghost', createdAt: '2026-10-08T16:00:00.000Z', createdBy: null }),
    ];
    const report = buildSupplyIntelligence({
      now: NOW,
      pendingNow: 0,
      directory,
      thresholds: { ...quiet, topAuthorCritical: 0.7 },
      offers,
      decisions: [],
    });
    expect(report.humans?.status).toBe('ok');
    expect(report.humans?.topHumanPct).toBe(0.8);
    expect(report.humans?.uniqueHumans).toBe(3);
    expect(report.humans?.unattributed).toBe(1);
    expect(report.humans?.coverage).toBe(0.909);
    expect(report.health.conditions.some((item) => item.code === 'author_concentration' && item.level === 'CRITICAL')).toBe(true);
  });

  it('con cobertura baja no publica un porcentaje humano', () => {
    const report = buildSupplyIntelligence({
      now: NOW,
      pendingNow: 0,
      directory,
      thresholds: quiet,
      offers: [
        offer({ id: '1', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'human-1' }),
        offer({ id: '2', createdAt: '2026-10-08T16:00:00.000Z', createdBy: null }),
        offer({ id: '3', createdAt: '2026-10-08T16:00:00.000Z', createdBy: null }),
      ],
      decisions: [],
    });
    expect(report.humans?.status).toBe('INSUFFICIENT_DATA');
    expect(report.humans?.attributed).toBe(1);
    expect(report.humans?.unattributed).toBe(2);
    expect(report.humans?.coverage).toBe(0.333);
    expect(report.humans?.topHumanPct).toBeNull();
    expect(report.health.conditions.some((item) => item.code === 'attribution_coverage')).toBe(true);
    expect(report.health.conditions.some((item) => item.code === 'author_concentration')).toBe(false);
  });

  it('no esconde tienda o categoría vacía', () => {
    const report = buildSupplyIntelligence({
      now: NOW,
      pendingNow: 0,
      directory,
      thresholds: quiet,
      offers: [
        offer({ id: '1', createdAt: '2026-10-08T16:00:00.000Z', store: '  ', category: null, status: 'approved' }),
        offer({ id: '2', createdAt: '2026-10-08T16:00:00.000Z', store: 'Amazon', category: 'Hogar', status: 'rejected' }),
      ],
      decisions: [],
    });
    expect(report.retailers?.some((row) => row.key === 'Sin tienda' && row.approved === 1)).toBe(true);
    expect(report.categories?.some((row) => row.key === 'Sin categoría' && row.approved === 1)).toBe(true);
    expect(report.missingCategory).toEqual({ created: 1, approved: 1 });
    expect(report.health.conditions.some((item) => item.code === 'missing_category')).toBe(true);
  });

  it('la fuente desconocida queda incompleta y no se vuelve humana', () => {
    const report = buildSupplyIntelligence({
      now: NOW,
      pendingNow: 0,
      directory,
      offers: [
        offer({ id: '1', createdAt: '2026-10-08T16:00:00.000Z' }),
        offer({ id: '2', createdAt: '2026-10-08T16:00:00.000Z' }),
      ],
      decisions: [decision({ action: 'approved', at: '2026-10-08T17:00:00.000Z' })],
      lanes: [lane({ offerId: '1', sourceLane: 'unknown' })],
    });
    expect(report.source).toMatchObject({ community: 0, machine: 0, unknownLane: 1, missing: 1 });
    expect(report.actorMix.d30?.human).toBe(2);
    expect(report.volume.today).toMatchObject({ approved: 1, rejected: 0 });
  });

  it('aprobadas y rechazadas salen de la misma consulta canónica', () => {
    const domain = read('lib/owner/supplyDomain.ts');
    const loader = read('lib/owner/loadSupplyIntelligence.ts');
    const command = read('lib/owner/buildOwnerCommand.ts');
    const intelligence = read('lib/owner/supplyIntelligence.ts');
    expect(domain).toContain("SUPPLY_DECISION_TABLE = 'moderation_logs'");
    expect(domain).toContain("SUPPLY_APPROVED_ACTION = 'approved'");
    expect(domain).toContain("SUPPLY_REJECTED_ACTION = 'rejected'");
    expect(loader).toContain('supplyDecisionCount');
    expect(command).toContain('supplyDecisionCount');
    expect(loader).not.toMatch(/eq\('decision', 'approve'\)/);
    expect(intelligence).not.toMatch(/from\('moderation_/);
    expect(intelligence).toContain("from '@/lib/actors/actorType'");
    expect(intelligence).not.toMatch(/sourceLane === 'community'/);
  });

  it('los módulos de oferta no importan dinero ni escriben', () => {
    const files = [
      'lib/owner/supplyIntelligence.ts',
      'lib/owner/loadSupplyIntelligence.ts',
      'lib/owner/supplyThresholds.ts',
      'lib/owner/supplyDomain.ts',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/lib\/rewards|lib\/economy|lib\/finance|recordAttributedClick|moneyPathFreeze|payout_intents|creator_rewards/);
      expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    }
  });
});
