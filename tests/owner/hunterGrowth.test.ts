import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ActorType } from '@/lib/actors/actorType';
import { buildHumanSupply, type HumanSupplyOffer } from '@/lib/owner/humanSupply';
import { buildHunterGrowth, type HunterAudience } from '@/lib/owner/hunterGrowth';
import { deriveHunterNextAction } from '@/lib/me/hunterNextAction';

const NOW = new Date('2026-10-08T18:00:00.000Z');
const D30_START = Date.parse('2026-09-08T18:00:00.000Z');
const D7_START = Date.parse('2026-10-01T18:00:00.000Z');

const directory = {
  classify(userId: string | null | undefined): ActorType {
    if (userId === 'machine') return 'MACHINE_HUNTER';
    if (userId === 'system') return 'SYSTEM';
    return 'HUMAN';
  },
};

function offer(partial: Partial<HumanSupplyOffer> & Pick<HumanSupplyOffer, 'id' | 'createdAt'>): HumanSupplyOffer {
  return {
    createdBy: 'human-1',
    status: 'approved',
    productFingerprint: null,
    offerUrl: `https://tienda.example/p/${partial.id}`,
    rejectionReason: null,
    deletedAt: null,
    ...partial,
  };
}

function audience(partial: Partial<HunterAudience> = {}): HunterAudience {
  return {
    registeredUsers: 100,
    activeUsers: 20,
    intentUsers: 4,
    intentSinceMs: D30_START,
    intentReadable: true,
    ...partial,
  };
}

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('hunter growth', () => {
  it('cuenta la segunda contribución solo si el producto es distinto', () => {
    const rows = [
      offer({ id: 'a', createdAt: '2026-10-07T12:00:00.000Z', status: 'approved', offerUrl: 'https://tienda.example/p/uno' }),
      offer({ id: 'b', createdAt: '2026-10-08T12:00:00.000Z', status: 'pending', offerUrl: 'https://tienda.example/p/uno' }),
    ];
    const retry = buildHumanSupply({ now: NOW, windowOffers: rows, history: rows, directory });
    expect(retry?.d30.firstApprovals).toBe(1);
    expect(retry?.d30.secondContributions).toBe(0);
    expect(retry?.d30.repeatContributors).toBe(0);

    const second = offer({ id: 'c', createdAt: '2026-10-08T15:00:00.000Z', status: 'pending', offerUrl: 'https://tienda.example/p/dos' });
    const grown = buildHumanSupply({ now: NOW, windowOffers: [...rows, second], history: [...rows, second], directory });
    expect(grown?.d30.secondContributions).toBe(1);
    expect(grown?.d30.repeatContributors).toBe(1);
    expect(grown?.d30.offers).toBe(3);
    expect(grown?.d30.approvedOffers).toBe(1);
  });

  it('deja la intención vacía cuando el evento no cubre la ventana', () => {
    const rows = [offer({ id: 'a', createdAt: '2026-10-08T12:00:00.000Z', status: 'approved' })];
    const human = buildHumanSupply({ now: NOW, windowOffers: rows, history: rows, directory });
    const report = buildHunterGrowth({
      human,
      d7: audience({ intentSinceMs: D7_START + 60_000, intentUsers: 2 }),
      d30: audience({ intentSinceMs: D7_START + 60_000, intentUsers: 2 }),
      d7StartMs: D7_START,
      d30StartMs: D30_START,
    });
    expect(report.d7.intentCoverage).toBe('unavailable');
    expect(report.d7.hunterIntent).toBeNull();
    expect(report.d7.userToIntent).toBeNull();
    expect(report.d7.intentToSubmission).toBeNull();
    expect(report.d30.intentCoverage).toBe('unavailable');
    expect(report.d7.newHunters).toBe(1);
    expect(report.d7.firstApprovals).toBe(1);
    expect(report.d7.submissionToApproval).toBe(1);
    expect(report.d7.approvalToSecond).toBe(0);
  });

  it('no publica una conversión imposible ni trata el envío crudo como éxito', () => {
    const rows = [
      offer({ id: 'a', createdAt: '2026-10-08T12:00:00.000Z', status: 'rejected', offerUrl: 'https://tienda.example/p/uno' }),
      offer({ id: 'b', createdAt: '2026-10-08T13:00:00.000Z', createdBy: 'human-2', status: 'pending', offerUrl: 'https://tienda.example/p/dos' }),
    ];
    const human = buildHumanSupply({ now: NOW, windowOffers: rows, history: rows, directory });
    const report = buildHunterGrowth({
      human,
      d7: audience({ intentUsers: 1, intentSinceMs: D30_START - 86_400_000 }),
      d30: audience({ intentUsers: 1, intentSinceMs: D30_START - 86_400_000 }),
      d7StartMs: D7_START,
      d30StartMs: D30_START,
    });
    expect(report.d30.intentCoverage).toBe('ok');
    expect(report.d30.hunterIntent).toBe(1);
    expect(report.d30.firstSubmissions).toBe(2);
    expect(report.d30.intentToSubmission).toBeNull();
    expect(report.d30.firstApprovals).toBe(0);
    expect(human?.d30.offers).toBeGreaterThan(human?.d30.approvedOffers ?? 0);
  });

  it('excluye máquina y sistema del crecimiento humano', () => {
    const rows = [
      offer({ id: 'h', createdAt: '2026-10-08T12:00:00.000Z', createdBy: 'human-1', status: 'approved' }),
      offer({ id: 'm', createdAt: '2026-10-08T12:00:00.000Z', createdBy: 'machine', status: 'approved' }),
      offer({ id: 's', createdAt: '2026-10-08T12:00:00.000Z', createdBy: 'system', status: 'approved' }),
      offer({ id: 'u', createdAt: '2026-10-08T12:00:00.000Z', createdBy: null, status: 'approved' }),
    ];
    const human = buildHumanSupply({ now: NOW, windowOffers: rows, history: rows, directory });
    const report = buildHunterGrowth({
      human,
      d7: audience(),
      d30: audience(),
      d7StartMs: D7_START,
      d30StartMs: D30_START,
    });
    expect(report.d30.newHunters).toBe(1);
    expect(report.d30.firstApprovals).toBe(1);
    expect(human?.d30.offers).toBe(1);
  });

  it('separa 7 y 30 días y no fabrica actividad histórica', () => {
    const old = offer({ id: 'old', createdAt: '2026-09-20T12:00:00.000Z', status: 'approved' });
    const human = buildHumanSupply({ now: NOW, windowOffers: [old], history: [old], directory });
    const report = buildHunterGrowth({
      human,
      d7: audience({ activeUsers: null, registeredUsers: 10 }),
      d30: audience({ activeUsers: 8, registeredUsers: 10 }),
      d7StartMs: D7_START,
      d30StartMs: D30_START,
    });
    expect(report.d7.newHunters).toBe(0);
    expect(report.d30.newHunters).toBe(1);
    expect(report.d7.activeUsers).toBeNull();
    expect(report.d30.activeUsers).toBe(8);
    const source = [
      read('lib/owner/hunterGrowth.ts'),
      read('lib/owner/loadHunterGrowth.ts'),
      read('app/admin/owner/command/ceo/HunterGrowthCard.tsx'),
    ].join('\n');
    expect(source).not.toMatch(/user_activity/);
    expect(source).not.toMatch(/creator_rewards|payout_intents|affiliate_ledger|REWARDS_PAYOUT/);
  });

  it('activa sin recompensa y no baja el estándar de moderación', () => {
    expect(deriveHunterNextAction({
      published: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      expired: 0,
      publicHref: null,
    }).cta).toBe('Subir mi primera oferta');
    const growth = read('lib/owner/hunterGrowth.ts');
    const route = read('app/api/me/hunter-intent/route.ts');
    const next = read('lib/me/hunterNextAction.ts');
    const onboard = read('app/me/dashboard/HunterFirstHunt.tsx');
    expect(`${growth}\n${route}\n${next}\n${onboard}`).not.toMatch(/garantiz|ganarás|payout|comisi[oó]n/i);
    expect(route).toMatch(/hunter_intent/);
    expect(route).not.toMatch(/event: 'submission'/);
    expect(onboard).toMatch(/Qué es un cazador/);
    expect(onboard).not.toMatch(/localStorage|dismiss/);
    expect(read('lib/owner/loadHunterGrowth.ts')).toMatch(/limit\(CAP\)/);
    expect(read('lib/actors/actorType.ts')).not.toMatch(/hunterGrowth/);
  });
});
