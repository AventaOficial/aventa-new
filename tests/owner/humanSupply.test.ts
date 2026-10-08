import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ActorType } from '@/lib/actors/actorType';
import { previewOfferDraft } from '@/lib/contracts/offers';
import { explainRejection } from '@/lib/me/rejectionFeedback';
import { FOCUS_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';
import { buildHumanSupply, supplyIdentity, type HumanSupplyOffer } from '@/lib/owner/humanSupply';

const NOW = new Date('2026-10-08T18:00:00.000Z');

const directory = {
  classify(userId: string | null | undefined): ActorType {
    if (userId === 'machine') return 'MACHINE_HUNTER';
    if (userId === 'system') return 'SYSTEM';
    if (!userId) return 'HUMAN';
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

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('human supply', () => {
  it('no cuenta máquina, sistema ni autor vacío como humano', () => {
    const rows = [
      offer({ id: 'h', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'human-1' }),
      offer({ id: 'm', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'machine' }),
      offer({ id: 's', createdAt: '2026-10-08T16:00:00.000Z', createdBy: 'system' }),
      offer({ id: 'u', createdAt: '2026-10-08T16:00:00.000Z', createdBy: null }),
    ];
    const report = buildHumanSupply({ now: NOW, windowOffers: rows, history: rows, directory });
    expect(report?.d30.contributors).toBe(1);
    expect(report?.d30.offers).toBe(1);
    expect(report?.diversity).toMatchObject({ human: 1, machineHunter: 1, system: 1, unattributed: 1 });
  });

  it('sin directorio no publica la oferta humana', () => {
    const rows = [offer({ id: 'h', createdAt: '2026-10-08T16:00:00.000Z' })];
    expect(buildHumanSupply({ now: NOW, windowOffers: rows, history: rows, directory: null })).toBeNull();
    expect(buildHumanSupply({
      now: NOW,
      windowOffers: rows,
      history: rows,
      directory: { classify: () => 'OTRO' as ActorType },
    })).toBeNull();
  });

  it('un reintento del mismo producto no es un cazador recurrente', () => {
    const rows = [
      offer({ id: 'a', createdAt: '2026-10-01T16:00:00.000Z', productFingerprint: 'same', status: 'rejected' }),
      offer({ id: 'b', createdAt: '2026-10-08T16:00:00.000Z', productFingerprint: 'same', status: 'pending' }),
    ];
    expect(supplyIdentity(rows[0]!)).toBe(supplyIdentity(rows[1]!));
    const report = buildHumanSupply({ now: NOW, windowOffers: rows, history: rows, directory });
    expect(report?.d30.repeatContributors).toBe(0);
    expect(report?.d30.offers).toBe(2);
  });

  it('dos productos distintos sí son un cazador recurrente', () => {
    const rows = [
      offer({ id: 'a', createdAt: '2026-10-01T16:00:00.000Z', offerUrl: 'https://tienda.example/p/uno' }),
      offer({ id: 'b', createdAt: '2026-10-08T16:00:00.000Z', offerUrl: 'https://tienda.example/p/dos' }),
    ];
    const report = buildHumanSupply({ now: NOW, windowOffers: rows, history: rows, directory });
    expect(report?.d30.repeatContributors).toBe(1);
    expect(report?.d30.contributors).toBe(1);
    expect(report?.d30.offersPerContributor).toBe(2);
  });

  it('mide el primer éxito y el segundo intento con otra identidad', () => {
    const accepted = offer({ id: 'ok', createdAt: '2026-10-08T12:00:00.000Z', createdBy: 'ana', status: 'approved' });
    const rejected = offer({
      id: 'no',
      createdAt: '2026-10-07T12:00:00.000Z',
      createdBy: 'beto',
      status: 'rejected',
      offerUrl: 'https://tienda.example/p/malo',
      rejectionReason: FOCUS_REJECTION_PRESETS.find((item) => item.short === 'Duplicada')?.full,
    });
    const retry = offer({
      id: 'retry',
      createdAt: '2026-10-08T15:00:00.000Z',
      createdBy: 'beto',
      status: 'pending',
      offerUrl: 'https://tienda.example/p/mejor',
    });
    const sameRetry = offer({
      id: 'same',
      createdAt: '2026-09-01T12:00:00.000Z',
      createdBy: 'caro',
      status: 'rejected',
      offerUrl: 'https://tienda.example/p/caro',
    });
    const sameAgain = offer({
      id: 'same-2',
      createdAt: '2026-10-08T15:00:00.000Z',
      createdBy: 'caro',
      status: 'pending',
      offerUrl: 'https://tienda.example/p/caro',
    });
    const rows = [accepted, rejected, retry, sameRetry, sameAgain];
    const report = buildHumanSupply({
      now: NOW,
      windowOffers: rows.filter((row) => row.createdAt >= '2026-09-08'),
      history: rows,
      directory,
      approveAtByOfferId: { ok: '2026-10-08T14:00:00.000Z' },
    });
    expect(report?.d30.firstSubmissions).toBe(2);
    expect(report?.d30.firstHuntSuccessRate).toBe(0.5);
    expect(report?.d30.firstHuntRejectionRate).toBe(0.5);
    expect(report?.d30.secondAttemptRate).toBe(1);
    expect(report?.d30.firstAcceptLatencyHours).toBe(2);
    expect(report?.d30.approvalRate).toBe(0.5);
    expect(report?.rejectionReasons?.groups.some((group) => group.key === 'duplicate' && group.count === 1)).toBe(true);
  });

  it('no publica latencia si falta el log de aprobación', () => {
    const rows = [offer({ id: 'ok', createdAt: '2026-10-08T12:00:00.000Z', status: 'approved' })];
    const report = buildHumanSupply({ now: NOW, windowOffers: rows, history: rows, directory });
    expect(report?.d30.firstHuntSuccessRate).toBe(1);
    expect(report?.d30.firstAcceptLatencyHours).toBeNull();
  });

  it('marca motivos incompletos cuando la mayoría no trae razón', () => {
    const rows = [
      offer({ id: 'a', createdAt: '2026-10-08T12:00:00.000Z', status: 'rejected', rejectionReason: null }),
      offer({ id: 'b', createdAt: '2026-10-08T13:00:00.000Z', status: 'rejected', rejectionReason: '   ' }),
      offer({ id: 'c', createdAt: '2026-10-08T14:00:00.000Z', status: 'approved' }),
    ];
    const report = buildHumanSupply({ now: NOW, windowOffers: rows, history: rows, directory });
    expect(report?.rejectionReasons?.status).toBe('INCOMPLETE');
    expect(report?.rejectionReasons?.unspecified).toBe(2);
    expect(report?.d30.rejectionRate).toBe(0.667);
  });

  it('respeta la frontera de 7 días', () => {
    const inside = offer({ id: 'in', createdAt: '2026-10-02T18:00:00.000Z' });
    const outside = offer({ id: 'out', createdAt: '2026-10-01T17:59:59.000Z', createdBy: 'human-2' });
    const report = buildHumanSupply({ now: NOW, windowOffers: [inside, outside], history: [inside, outside], directory });
    expect(report?.d7.contributors).toBe(1);
    expect(report?.d30.contributors).toBe(2);
  });

  it('el preflight usa el schema canónico y el rechazo no inventa un motivo', () => {
    expect(previewOfferDraft({ title: '', store: 'Amazon', description: 'Una oferta clara', price: 10 }).ready).toBe(false);
    const ready = previewOfferDraft({
      title: 'Leche',
      store: 'Amazon',
      description: 'Precio de anaquel',
      price: 10,
      original_price: 20,
    });
    expect(ready.ready).toBe(true);
    expect(explainRejection(null).detail).toBe('No hay un motivo registrado.');
    expect(explainRejection('nota interna inventada').detail).toBe('nota interna inventada');
    expect(explainRejection(FOCUS_REJECTION_PRESETS[0]?.full).headline).toBe(FOCUS_REJECTION_PRESETS[0]?.short);
  });

  it('no usa eventos de producto ni dinero para definir cazadores', () => {
    const files = [
      'lib/owner/humanSupply.ts',
      'lib/owner/loadSupplyIntelligence.ts',
      'lib/me/rejectionFeedback.ts',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/lib\/rewards|lib\/economy|lib\/finance|recordAttributedClick|moneyPathFreeze|payout_intents|creator_rewards|product_events|recordProductEvent/);
      expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    }
    expect(read('lib/owner/humanSupply.ts')).not.toMatch(/source_lane|sourceLane/);
    expect(read('lib/me/rejectionFeedback.ts')).not.toMatch(/source_lane|sourceLane/);
  });
});
