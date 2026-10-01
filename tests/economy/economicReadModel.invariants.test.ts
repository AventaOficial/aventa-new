import { describe, expect, it } from 'vitest';
import { classifyLedgerEconomicKind } from '@/lib/economy/readModel/classifyLedgerRow';
import { listRecentEconomicPeriods, parseEconomicPeriod, resolveEconomicPeriod, periodKeyFromInstant } from '@/lib/economy/readModel/economicPeriod';
import { foldCreatorRewards, foldNetworkEconomy, foldPayoutIntents } from '@/lib/economy/readModel/aggregateEconomicSnapshot';
import { presentEconomicMoney } from '@/lib/economy/readModel/presentEconomicMoney';
import { REWARDS_CREATOR_SHARE_BPS } from '@/lib/rewards/config';
import { SETTLEMENT_EXTERNAL_REF_PREFIX, SETTLEMENT_REVERSAL_PREFIX } from '@/lib/economy/ledger/canonicalLedgerAuthority';

const PERIOD = '2026-09';

function row(partial: {
  id: string;
  cents: number;
  ref: string;
  source?: string;
  createdAt?: string;
  periodStart?: string | null;
  network?: string;
  meta?: unknown;
}) {
  return {
    id: partial.id,
    network: partial.network ?? 'amazon',
    amountCents: partial.cents,
    externalRef: partial.ref,
    source: partial.source ?? 'api',
    createdAt: partial.createdAt ?? '2026-09-15T18:00:00.000Z',
    periodStart: partial.periodStart ?? '2026-09-01',
    meta: partial.meta,
  };
}

describe('economic read model invariants', () => {
  it('INV-001 recognized is settlement rows only, once', () => {
    const folded = foldNetworkEconomy(
      [
        row({ id: 's1', cents: 1000, ref: `${SETTLEMENT_EXTERNAL_REF_PREFIX}c1` }),
        row({ id: 's1-again-other', cents: 1000, ref: `${SETTLEMENT_EXTERNAL_REF_PREFIX}c1` }),
      ],
      PERIOD,
    );
    expect(folded.grossRecognizedCents).toBe(1000);
    expect(folded.settlementIds).toEqual(['s1']);
    expect(folded.anomalies.some((item) => item.code === 'duplicate_external_ref')).toBe(true);
  });

  it('INV-002 a commission fact is not added on top of the ledger', () => {
    const folded = foldNetworkEconomy(
      [
        row({ id: 's1', cents: 1000, ref: `${SETTLEMENT_EXTERNAL_REF_PREFIX}c1` }),
        row({ id: 'csv', cents: 1000, ref: 'amazon-order-9', source: 'csv_import' }),
      ],
      PERIOD,
    );
    expect(folded.grossRecognizedCents).toBe(1000);
    expect(folded.evidenceRows).toBe(1);
  });

  it('INV-003 reward is not summed twice for the same ledger entry', () => {
    const folded = foldCreatorRewards(
      [
        { id: 'r1', ledgerEntryId: 's1', status: 'AVAILABLE', creatorShareCents: 400, platformShareCents: 600 },
        { id: 'r2', ledgerEntryId: 's1', status: 'AVAILABLE', creatorShareCents: 400, platformShareCents: 600 },
      ],
      new Set(['s1']),
    );
    expect(folded.liability).toBe(400);
    expect(folded.anomalies.some((item) => item.code === 'duplicate_reward_ledger')).toBe(true);
  });

  it('INV-004 payout is not part of the reward fold', () => {
    const folded = foldCreatorRewards(
      [{ id: 'r1', ledgerEntryId: 's1', status: 'PAID', creatorShareCents: 400, platformShareCents: 600 }],
      new Set(['s1']),
    );
    expect(folded.paid).toBe(400);
    expect(folded).not.toHaveProperty('payoutIntent');
  });

  it('INV-005 hold is validating, not a new status', () => {
    const folded = foldCreatorRewards(
      [{ id: 'r1', ledgerEntryId: 's1', status: 'VALIDATING', creatorShareCents: 400, platformShareCents: 600, holdUntil: '2026-11-01' }],
      new Set(['s1']),
    );
    expect(folded.hold).toBe(400);
    expect(folded.validating).toBe(400);
    expect(folded.available).toBe(0);
  });

  it('INV-006 cancelled and reversed rewards are not liability', () => {
    const folded = foldCreatorRewards(
      [
        { id: 'r1', ledgerEntryId: 's1', status: 'CANCELLED', creatorShareCents: 400, platformShareCents: 600 },
        { id: 'r2', ledgerEntryId: 's2', status: 'REVERSED', creatorShareCents: 400, platformShareCents: 600 },
      ],
      new Set(['s1', 's2']),
    );
    expect(folded.liability).toBe(0);
  });

  it('INV-007 reversal reduces net with the signed amount and keeps the settlement row', () => {
    const folded = foldNetworkEconomy(
      [
        row({ id: 's1', cents: 1000, ref: `${SETTLEMENT_EXTERNAL_REF_PREFIX}c1` }),
        row({ id: 'rev', cents: -1000, ref: `${SETTLEMENT_REVERSAL_PREFIX}c1` }),
      ],
      PERIOD,
    );
    expect(folded.grossRecognizedCents).toBe(1000);
    expect(folded.reversalCents).toBe(-1000);
    expect(folded.netRecognizedCents).toBe(0);
    expect(folded.settlementIds).toEqual(['s1']);
  });

  it('INV-008 a reward outside the settlement set is not liability', () => {
    const folded = foldCreatorRewards(
      [{ id: 'r1', ledgerEntryId: 'other', status: 'AVAILABLE', creatorShareCents: 400, platformShareCents: 600 }],
      new Set(['s1']),
    );
    expect(folded.liability).toBe(0);
    expect(folded.anomalies[0]?.code).toBe('reward_outside_period_settlement');
  });

  it('INV-009 platform share is the stored cents, not a screen percentage', () => {
    expect(REWARDS_CREATOR_SHARE_BPS).toBe(4000);
    const folded = foldCreatorRewards(
      [{ id: 'r1', ledgerEntryId: 's1', status: 'AVAILABLE', creatorShareCents: 400, platformShareCents: 600 }],
      new Set(['s1']),
    );
    expect(folded.aventa).toBe(600);
    expect(folded.liability).toBe(400);
  });

  it('INV-010 evidence is not recognized revenue', () => {
    const folded = foldNetworkEconomy(
      [row({ id: 'manual', cents: 2_150_550, ref: 'amazon-csv', source: 'manual' })],
      PERIOD,
    );
    expect(folded.grossRecognizedCents).toBe(0);
    expect(folded.netRecognizedCents).toBe(0);
    expect(folded.evidenceRows).toBe(1);
  });

  it('INV-011 synthetic rows and invented year weights do not enter the snapshot fold', () => {
    const folded = foldNetworkEconomy(
      [
        row({
          id: 'qa',
          cents: 999,
          ref: 'qa-settlement:commission:x',
          meta: { staging_qa: true },
        }),
      ],
      PERIOD,
    );
    expect(folded.grossRecognizedCents).toBe(0);
    expect(classifyLedgerEconomicKind({ externalRef: 'qa-x', meta: { staging_qa: true } })).toBe('synthetic');
  });

  it('INV-012 period mismatch is excluded', () => {
    const resolved = resolveEconomicPeriod({
      periodStart: '2026-08-01',
      createdAt: '2026-09-15T18:00:00.000Z',
    });
    expect(resolved.anomaly).toBe('period_mismatch');
    const folded = foldNetworkEconomy(
      [row({ id: 's1', cents: 1000, ref: `${SETTLEMENT_EXTERNAL_REF_PREFIX}c1`, periodStart: '2026-08-01' })],
      PERIOD,
    );
    expect(folded.grossRecognizedCents).toBe(0);
    expect(folded.anomalies[0]?.code).toBe('period_mismatch');
  });

  it('INV-013 missing period_start uses Mexico City month of created_at', () => {
    expect(periodKeyFromInstant('2026-10-01T05:30:00.000Z')).toBe('2026-09');
    const folded = foldNetworkEconomy(
      [
        row({
          id: 's1',
          cents: 500,
          ref: `${SETTLEMENT_EXTERNAL_REF_PREFIX}c1`,
          periodStart: null,
          createdAt: '2026-10-01T05:30:00.000Z',
        }),
      ],
      PERIOD,
    );
    expect(folded.grossRecognizedCents).toBe(500);
  });

  it('INV-014 allocation-like rows are not a paid reward', () => {
    const folded = foldCreatorRewards(
      [{ id: 'alloc', ledgerEntryId: 'pool-row', status: 'paid', creatorShareCents: 400, platformShareCents: 0 }],
      new Set(['s1']),
    );
    expect(folded.paid).toBe(0);
    expect(folded.liability).toBe(0);
  });

  it('INV-015 source=api without settlement prefix is unscoped', () => {
    expect(classifyLedgerEconomicKind({ externalRef: 'order-1', source: 'api' })).toBe('unscoped_api');
    const folded = foldNetworkEconomy(
      [row({ id: 'api', cents: 800, ref: 'order-1', source: 'api' })],
      PERIOD,
    );
    expect(folded.grossRecognizedCents).toBe(0);
    expect(folded.anomalies[0]?.code).toBe('unscoped_api');
  });

  it('the same clock produces one period list for every surface', () => {
    const now = new Date('2026-09-15T18:00:00.000Z');
    expect(listRecentEconomicPeriods(3, now)).toEqual(listRecentEconomicPeriods(3, now));
    expect(listRecentEconomicPeriods(3, now)[0]).toBe('2026-09');
    expect(parseEconomicPeriod('2026-13')).toBeNull();
  });

  it('a payout does not increase recognized income', () => {
    const network = foldNetworkEconomy(
      [row({ id: 's1', cents: 1000, ref: `${SETTLEMENT_EXTERNAL_REF_PREFIX}c1` })],
      PERIOD,
    );
    const payouts = foldPayoutIntents(
      [{ id: 'p1', rewardId: 'r1', status: 'SUCCEEDED', amountCents: 400 }],
      new Set(['r1']),
    );
    expect(network.grossRecognizedCents).toBe(1000);
    expect(payouts.succeededCents).toBe(400);
    expect(payouts.counts.succeeded).toBe(1);
  });

  it('missing data, an unimplemented program and a freeze are not zero dollars', () => {
    expect(presentEconomicMoney({ state: 'no_data', reason: 'error' })).toBe('Sin datos');
    expect(presentEconomicMoney({ state: 'not_implemented', reason: 'budget' })).toBe('No implementado');
    expect(presentEconomicMoney({ state: 'none', reason: 'frozen path has no payout' })).toBe('Sin registro');
    expect(presentEconomicMoney({ state: 'amount', cents: 0 })).toContain('0');
  });
});
