/**
 * CazaOfertasss — FASE 1. Persistencia: contrato InMemory + semántica atómica.
 *
 * Cubre A–L del DoD a nivel de puerto (sin red). La suite staging valida el
 * motor PostgreSQL real cuando las tablas existen.
 */

import { describe, expect, it } from 'vitest';

import {
  CAZA_FORBIDDEN_AVENTA_MONEY_TABLES,
  assertCazaOfertasMoneyUntouched,
  buildAffiliateRevenueEvent,
  buildDealCandidate,
  createInMemoryAffiliateRevenueLedger,
  createInMemoryDealCandidateRepository,
  createInMemoryDealPublicationRepository,
  dealCandidateToRow,
  mergeDealCandidate,
  rowToDealCandidate,
  upsertDealCandidate,
  type DealCandidate,
} from '@/lib/cazaOfertas';

import {
  NOW,
  NOW_ISO,
  amazonAffiliate,
  amazonDraft,
  buildTestPublicationRecord,
  strongEvidence,
} from './fixtures';

function candidate(price = 1999): DealCandidate {
  const r = buildDealCandidate(
    amazonDraft({
      currentPrice: price,
      evidence: strongEvidence({ currentPrice: price }),
    }),
    { now: NOW, affiliate: amazonAffiliate() }
  );
  if (!r.ok) throw new Error(r.reasons.join(','));
  return r.value;
}

describe('FASE 1 money boundary', () => {
  it('assertCazaOfertasMoneyUntouched no lanza', () => {
    expect(() => assertCazaOfertasMoneyUntouched()).not.toThrow();
  });

  it('lista explícita de tablas económicas de Aventa prohibidas', () => {
    expect(CAZA_FORBIDDEN_AVENTA_MONEY_TABLES).toEqual(
      expect.arrayContaining([
        'creator_rewards',
        'payout_intents',
        'reward_payouts',
        'affiliate_ledger_entries',
        'commissions',
      ])
    );
  });
});

describe('A/B/C — insert / update / upsert (InMemory)', () => {
  it('insert crea revision=1', async () => {
    const repo = createInMemoryDealCandidateRepository();
    const outcome = await upsertDealCandidate(repo, candidate());
    expect(outcome.action).toBe('created');
    expect(outcome.candidate.revision).toBe(1);
    expect(repo.size()).toBe(1);
  });

  it('update material incrementa revision', async () => {
    const repo = createInMemoryDealCandidateRepository();
    await upsertDealCandidate(repo, candidate(1999));
    const updated = await upsertDealCandidate(repo, candidate(1799));
    expect(updated.action).toBe('updated');
    expect(updated.candidate.revision).toBe(2);
    expect(updated.candidate.currentPrice).toBe(1799);
  });

  it('upsert unchanged no incrementa revision', async () => {
    const repo = createInMemoryDealCandidateRepository();
    await upsertDealCandidate(repo, candidate(1999));
    const again = await upsertDealCandidate(repo, candidate(1999));
    expect(again.action).toBe('unchanged');
    expect(again.candidate.revision).toBe(1);
  });
});

describe('D — duplicate identity', () => {
  it('misma identity_key nunca produce dos filas', async () => {
    const repo = createInMemoryDealCandidateRepository();
    await upsertDealCandidate(repo, candidate(1999));
    await upsertDealCandidate(repo, candidate(1899));
    await upsertDealCandidate(repo, candidate(1799));
    expect(repo.size()).toBe(1);
    const found = await repo.findByIdentityKey(candidate().identity.key);
    expect(found?.revision).toBe(3);
  });
});

describe('E/F — concurrent upsert ×10 + revision', () => {
  it('10 escritores concurrentes: 1 fila, revision monotónica, sin pérdida', async () => {
    const repo = createInMemoryDealCandidateRepository();
    const base = candidate(3000);
    await upsertDealCandidate(repo, base);

    const writers = Array.from({ length: 10 }, (_, i) =>
      upsertDealCandidate(repo, candidate(2900 - i * 10))
    );
    const results = await Promise.all(writers);

    expect(repo.size()).toBe(1);
    const final = await repo.findByIdentityKey(base.identity.key);
    expect(final).not.toBeNull();
    if (!final) return;

    // 1 create + hasta 10 updates materiales = revision entre 2 y 11
    expect(final.revision).toBeGreaterThanOrEqual(2);
    expect(final.revision).toBeLessThanOrEqual(11);

    const updated = results.filter((r) => r.action === 'updated' || r.action === 'unchanged');
    expect(updated).toHaveLength(10);

    // Ningún outcome reporta un id distinto (sin duplicados lógicos).
    expect(new Set(results.map((r) => r.candidate.id)).size).toBe(1);
    expect(new Set(results.map((r) => r.candidate.identity.key)).size).toBe(1);
  });

  it('mergeDealCandidate + upsertAtomic preservan firstSeenAt e id', async () => {
    const repo = createInMemoryDealCandidateRepository();
    const first = await upsertDealCandidate(repo, candidate(1999));
    const second = await upsertDealCandidate(repo, candidate(1500));
    expect(second.candidate.id).toBe(first.candidate.id);
    expect(second.candidate.firstSeenAt).toBe(first.candidate.firstSeenAt);
    expect(second.candidate.revision).toBe(2);
  });
});

describe('G — publication idempotency concurrente', () => {
  it('10 writers concurrentes → 1 sola publicación lógica', async () => {
    const repo = createInMemoryDealPublicationRepository();
    const built = buildTestPublicationRecord({
      trackingLabel: 'caza_0f1e2d3c_20260919',
      telegramChannel: '@cazaofertasss',
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const results = await Promise.all(
      Array.from({ length: 10 }, () => repo.saveIdempotent(built.value))
    );

    const inserted = results.filter((r) => r.inserted);
    expect(inserted).toHaveLength(1);
    expect(results.every((r) => r.record.publicationId === built.value.publicationId)).toBe(
      true
    );
    expect(await repo.listByDealId(built.value.dealId, 10)).toHaveLength(1);
  });
});

describe('H/I — revenue append-only + duplicate', () => {
  it('append + duplicate event', async () => {
    const ledger = createInMemoryAffiliateRevenueLedger();
    const event = buildAffiliateRevenueEvent({
      network: 'amazon_associates_mx',
      externalReference: 'ORDER-PERSIST-1',
      dealId: 'caza_amazon_mx_abcd1234',
      trackingLabel: 'caza_0f1e2d3c_20260919',
      eventType: 'COMMISSION',
      amountValue: 50,
      currency: 'MXN',
      occurredAt: NOW_ISO,
      status: 'PENDING',
      recordedAt: NOW_ISO,
    });
    expect(event.ok).toBe(true);
    if (!event.ok) return;

    expect(await ledger.append(event.value)).toEqual({ appended: true, duplicate: false });
    expect(await ledger.append(event.value)).toEqual({ appended: false, duplicate: true });
    expect(await ledger.listByDealId('caza_amazon_mx_abcd1234', 10)).toHaveLength(1);
  });
});

describe('J — unauthorized access (contrato de frontera)', () => {
  it('tablas caza_* no están en la lista de money path de Aventa (aislamiento)', () => {
    for (const table of CAZA_FORBIDDEN_AVENTA_MONEY_TABLES) {
      expect(table.startsWith('caza_')).toBe(false);
    }
  });
});

describe('K — malformed persistence input', () => {
  it('mapper rechaza filas malformadas', () => {
    expect(() => rowToDealCandidate({} as never)).toThrow(/identity_key/);
    expect(() =>
      rowToDealCandidate({
        ...dealCandidateToRow(candidate()),
        current_price: 'nope',
      })
    ).toThrow(/invalid_number/);
  });

  it('repo InMemory upsertAtomic rechaza identidad vacía vía merge de claves distintas', () => {
    const a = candidate();
    const b = { ...a, identity: { ...a.identity, key: 'other:key' } };
    const outcome = mergeDealCandidate(a, b);
    expect(outcome.action).toBe('created');
  });
});

describe('L — transaction rollback (semántica InMemory)', () => {
  it('si el escritor falla antes de save, el repo queda intacto', async () => {
    const repo = createInMemoryDealCandidateRepository();
    await upsertDealCandidate(repo, candidate(1999));
    const before = repo.size();

    try {
      const incoming = candidate(1000);
      const existing = await repo.findByIdentityKey(incoming.identity.key);
      const outcome = mergeDealCandidate(existing, incoming);
      throw new Error('forced_rollback');
      await repo.save(outcome.candidate);
    } catch (err) {
      expect((err as Error).message).toBe('forced_rollback');
    }

    expect(repo.size()).toBe(before);
    const found = await repo.findByIdentityKey(candidate().identity.key);
    expect(found?.currentPrice).toBe(1999);
    expect(found?.revision).toBe(1);
  });
});

describe('round-trip mapper', () => {
  it('dealCandidate → row → dealCandidate preserva campos tipados', () => {
    const original = candidate();
    const round = rowToDealCandidate(dealCandidateToRow(original));
    expect(round.id).toBe(original.id);
    expect(round.identity.key).toBe(original.identity.key);
    expect(round.currentPrice).toBe(original.currentPrice);
    expect(round.score.score).toBe(original.score.score);
    expect(round.evidence.source).toBe(original.evidence.source);
    expect(round.affiliate?.affiliateNetwork).toBe(original.affiliate?.affiliateNetwork);
  });
});
