import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyRevisionsToGross,
  canTransitionRevision,
  clearAffiliateNetworkAdapters,
  compareCommissionSnapshot,
  createNotConnectedAdapter,
  ECONOMIC_LEDGER_BOUNDARY,
  getAffiliateNetworkAdapter,
  ingestNetworkHttpEvent,
  registerAffiliateNetworkAdapter,
  resolveNetworkConnectionStatus,
  verifyNetworkSignature,
} from '@/lib/economy';
import { buildConversionCommissionTruth } from '@/lib/economy/buildConversionCommissionTruth';
import {
  createTestAffiliateNetworkAdapter,
  signTestPayload,
  TEST_ADAPTER_SECRET,
} from '@/lib/economy/adapter/testAdapter';
import { recordCommissionRevision } from '@/lib/economy/revisions/recordCommissionRevision';

afterEach(() => {
  clearAffiliateNetworkAdapters();
});

describe('adapter contract + signature fail-closed', () => {
  it('default adapter is not connected and refuses parse/signature', async () => {
    const adapter = getAffiliateNetworkAdapter('amazon');
    expect(adapter.connected).toBe(false);
    expect(adapter.parsePayload({}).ok).toBe(false);
    const sig = await verifyNetworkSignature({
      network: 'amazon',
      headers: {},
      rawBody: '{"a":1}',
    });
    expect(sig.ok).toBe(false);
    if (!sig.ok) expect(sig.code).toBe('network_not_connected');
  });

  it('missing signature / invalid signature / valid signature (test adapter)', async () => {
    registerAffiliateNetworkAdapter(createTestAffiliateNetworkAdapter('amazon'));
    const body = JSON.stringify({ conversions: [] });
    const missing = await verifyNetworkSignature({
      network: 'amazon',
      headers: {},
      rawBody: body,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('missing_signature');

    const invalid = await verifyNetworkSignature({
      network: 'amazon',
      headers: { 'x-aventa-test-signature': 'deadbeef' },
      rawBody: body,
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.code).toBe('invalid_signature');

    const valid = await verifyNetworkSignature({
      network: 'amazon',
      headers: { 'x-aventa-test-signature': signTestPayload(body) },
      rawBody: body,
    });
    expect(valid.ok).toBe(true);
  });

  it('test adapter rejects malformed / missing id / invalid amount / currency', () => {
    const adapter = createTestAffiliateNetworkAdapter('amazon');
    expect(adapter.parsePayload(null).ok).toBe(false);
    expect(
      adapter.parsePayload({
        conversions: [{ externalConversionId: '' }],
      }).ok,
    ).toBe(false);
    expect(
      adapter.parsePayload({
        commissions: [
          {
            externalCommissionId: 'C1',
            externalConversionId: 'O1',
            grossCommissionCents: -1,
            currency: 'MXN',
          },
        ],
      }).ok,
    ).toBe(false);
    expect(
      adapter.parsePayload({
        commissions: [
          {
            externalCommissionId: 'C1',
            externalConversionId: 'O1',
            grossCommissionCents: 100,
            currency: 'peso',
          },
        ],
      }).ok,
    ).toBe(false);
    const ok = adapter.parsePayload({
      conversions: [{ externalConversionId: 'O1', occurredAt: '2026-09-16T00:00:00.000Z' }],
      commissions: [
        {
          externalCommissionId: 'C1',
          externalConversionId: 'O1',
          grossCommissionCents: 1000,
          currency: 'mxn',
          occurredAt: '2026-09-16T00:00:00.000Z',
        },
      ],
    });
    expect(ok.ok).toBe(true);
  });

  it('HTTP ingest fail-closed without connected network', async () => {
    const sb = { from: vi.fn() };
    const r = await ingestNetworkHttpEvent(sb as never, {
      network: 'amazon',
      headers: {},
      rawBody: '{}',
      payload: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('network_not_connected');
  });

  it('refuse register disconnected adapter as live', () => {
    expect(() => registerAffiliateNetworkAdapter(createNotConnectedAdapter('amazon'))).toThrow(
      /disconnected/,
    );
  });
});

describe('commission revisions append-only', () => {
  it('applyRevisionsToGross preserves history semantics', () => {
    expect(
      applyRevisionsToGross(10000, [
        { semantics: 'delta', amount_delta_cents: -3000, absolute_amount_cents: null, status: 'recorded' },
      ]),
    ).toBe(7000);
    expect(
      applyRevisionsToGross(10000, [
        {
          semantics: 'replacement',
          amount_delta_cents: null,
          absolute_amount_cents: 5000,
          status: 'recorded',
        },
        {
          semantics: 'delta',
          amount_delta_cents: 500,
          absolute_amount_cents: null,
          status: 'recorded',
        },
      ]),
    ).toBe(5500);
    expect(
      applyRevisionsToGross(10000, [
        {
          semantics: 'delta',
          amount_delta_cents: -1000,
          absolute_amount_cents: null,
          status: 'superseded',
        },
      ]),
    ).toBe(10000);
  });

  it('revision state machine blocks impossible transitions', () => {
    expect(canTransitionRevision('recorded', 'superseded')).toBe(true);
    expect(canTransitionRevision('recorded', 'reversed')).toBe(true);
    expect(canTransitionRevision('superseded', 'recorded')).toBe(false);
    expect(canTransitionRevision('reversed', 'recorded')).toBe(false);
  });

  it('duplicate revision → reused canonical; forged amount rejected; no ledger write', async () => {
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    const existing = {
      id: 'rev-1',
      commission_id: 'comm-1',
      source: 'api',
      network: 'amazon',
      external_revision_id: 'REV-1',
      revision_kind: 'negative_adjustment',
      semantics: 'delta',
      amount_delta_cents: -3000,
      absolute_amount_cents: null,
      currency: 'MXN',
      status: 'recorded',
      occurred_at: '2026-09-16T12:00:00.000Z',
    };
    let insertAttempts = 0;
    const sb = {
      from: vi.fn((table: string) => {
        if (table === 'affiliate_commissions') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: 'comm-1',
                    gross_commission_cents: 10000,
                    currency: 'MXN',
                    ledger_entry_id: null,
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === 'affiliate_commission_revisions') {
          return {
            insert: vi.fn((row: Record<string, unknown>) => {
              insertAttempts += 1;
              inserts.push({ table, row });
              return {
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: null,
                    error: { code: '23505', message: 'duplicate' },
                  })),
                })),
              };
            }),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
                  })),
                })),
                order: vi.fn(() => ({
                  order: vi.fn(async () => ({
                    data: [
                      {
                        semantics: 'delta',
                        amount_delta_cents: -3000,
                        absolute_amount_cents: null,
                        status: 'recorded',
                      },
                    ],
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }
        if (table === 'affiliate_economic_events') {
          return {
            insert: vi.fn(async () => ({ error: null })),
          };
        }
        return {};
      }),
    };

    const dup = await recordCommissionRevision(sb as never, {
      commissionId: 'comm-1',
      source: 'api',
      network: 'amazon',
      externalRevisionId: 'REV-1',
      revisionKind: 'negative_adjustment',
      semantics: 'delta',
      amountDeltaCents: -3000,
      currency: 'MXN',
      occurredAt: '2026-09-16T12:00:00.000Z',
    });
    expect(dup?.reused).toBe(true);
    expect(dup?.revisionId).toBe('rev-1');
    expect(dup?.effectiveAfterCents).toBe(7000);

    const forged = await recordCommissionRevision(sb as never, {
      commissionId: 'comm-1',
      source: 'api',
      network: 'amazon',
      externalRevisionId: 'REV-2',
      revisionKind: 'negative_adjustment',
      semantics: 'delta',
      amountDeltaCents: 100,
      currency: 'MXN',
      occurredAt: '2026-09-16T12:00:00.000Z',
    });
    expect(forged).toBeNull();

    expect(inserts.every((i) => i.table !== 'creator_rewards')).toBe(true);
    expect(ECONOMIC_LEDGER_BOUNDARY.settlementEnabled).toBe(false);
    expect(createHmac('sha256', TEST_ADAPTER_SECRET).update('x').digest('hex').length).toBe(64);
  });
});

describe('reconciliation foundation', () => {
  it('detects matched / missing internal / amount / status / currency / duplicate', () => {
    const baseExternal = {
      source: 'api' as const,
      network: 'amazon' as const,
      externalCommissionId: 'C1',
      externalConversionId: 'O1',
      occurredAt: '2026-09-16T00:00:00.000Z',
      status: 'approved' as const,
      grossCommissionCents: 1000,
      currency: 'MXN',
      rawReference: {},
    };

    const missing = compareCommissionSnapshot({
      source: 'api',
      network: 'amazon',
      external: baseExternal,
      internal: null,
      seenExternalIds: new Set(),
    });
    expect(missing[0]?.findingType).toBe('MISSING_INTERNAL');

    const matched = compareCommissionSnapshot({
      source: 'api',
      network: 'amazon',
      external: { ...baseExternal, externalCommissionId: 'CM' },
      seenExternalIds: new Set(),
      internal: {
        id: 'i1',
        externalCommissionId: 'CM',
        grossCommissionCents: 1000,
        effectiveCents: 1000,
        currency: 'MXN',
        status: 'approved',
        conversionId: 'conv-1',
      },
    });
    expect(matched.some((f) => f.findingType === 'MATCHED')).toBe(true);

    const amount = compareCommissionSnapshot({
      source: 'api',
      network: 'amazon',
      external: { ...baseExternal, externalCommissionId: 'C2' },
      seenExternalIds: new Set(),
      internal: {
        id: 'i2',
        externalCommissionId: 'C2',
        grossCommissionCents: 1000,
        effectiveCents: 700,
        currency: 'MXN',
        status: 'approved',
        conversionId: 'conv-1',
      },
    });
    expect(amount.some((f) => f.findingType === 'AMOUNT_MISMATCH')).toBe(true);

    const currency = compareCommissionSnapshot({
      source: 'api',
      network: 'amazon',
      external: { ...baseExternal, externalCommissionId: 'C3', currency: 'USD' },
      seenExternalIds: new Set(),
      internal: {
        id: 'i3',
        externalCommissionId: 'C3',
        grossCommissionCents: 1000,
        effectiveCents: 1000,
        currency: 'MXN',
        status: 'approved',
        conversionId: 'conv-1',
      },
    });
    expect(currency.some((f) => f.findingType === 'CURRENCY_MISMATCH')).toBe(true);

    const status = compareCommissionSnapshot({
      source: 'api',
      network: 'amazon',
      external: { ...baseExternal, externalCommissionId: 'C4', status: 'pending' },
      seenExternalIds: new Set(),
      internal: {
        id: 'i4',
        externalCommissionId: 'C4',
        grossCommissionCents: 1000,
        effectiveCents: 1000,
        currency: 'MXN',
        status: 'approved',
        conversionId: 'conv-1',
      },
    });
    expect(status.some((f) => f.findingType === 'STATUS_MISMATCH')).toBe(true);

    const dup = compareCommissionSnapshot({
      source: 'api',
      network: 'amazon',
      external: { ...baseExternal, externalCommissionId: 'C5' },
      seenExternalIds: new Set(['C5']),
      internal: null,
    });
    expect(dup[0]?.findingType).toBe('DUPLICATE');
  });
});

describe('CEO network connection status + money safety docs', () => {
  it('NOT CONNECTED ≠ connected_zero ≠ connected_with_data', () => {
    expect(
      resolveNetworkConnectionStatus({
        hasAnyConnectedAdapter: false,
        conversionCount: 0,
        commissionCount: 0,
      }),
    ).toBe('not_connected');
    expect(
      resolveNetworkConnectionStatus({
        hasAnyConnectedAdapter: true,
        conversionCount: 0,
        commissionCount: 0,
      }),
    ).toBe('connected_zero');
    expect(
      resolveNetworkConnectionStatus({
        hasAnyConnectedAdapter: true,
        conversionCount: 1,
        commissionCount: 0,
      }),
    ).toBe('connected_with_data');
  });

  it('truth remains revenue not connected + reconciliation zeros', async () => {
    const sb = {
      from: vi.fn((table: string) => {
        const empty = {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: [], error: null })),
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
              neq: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
        };
        if (
          table === 'affiliate_conversions' ||
          table === 'affiliate_commissions' ||
          table === 'affiliate_commission_revisions' ||
          table === 'affiliate_reconciliation_runs' ||
          table === 'affiliate_reconciliation_findings'
        ) {
          return empty;
        }
        return {};
      }),
    };
    const snap = await buildConversionCommissionTruth(sb as never);
    expect(snap.networkConnectionStatus).toBe('not_connected');
    expect(snap.ingestSourceConnected).toBe(false);
    expect(snap.revenue.label).toBe('not connected');
    expect(snap.reconciliation.unmatched).toBe(0);
    expect(snap.ledgerBoundary.settlementEnabled).toBe(false);
  });

  it('migration additive + money-safe (executable SQL only)', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'docs/supabase-migrations/20260916_economy_adapter_revisions_reconciliation.sql',
      ),
      'utf8',
    );
    const executable = sql
      .split(/\r?\n/)
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
    expect(executable).toMatch(/affiliate_commission_revisions/);
    expect(executable).toMatch(/affiliate_reconciliation_runs/);
    expect(executable).toMatch(/affiliate_reconciliation_findings/);
    expect(executable).toMatch(/UNIQUE \(source, network, external_revision_id\)/);
    expect(executable).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(executable).not.toMatch(/\bTRUNCATE\b/i);
    expect(executable).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executable).not.toMatch(/\bcreator_rewards\b/);
    expect(executable).not.toMatch(/\breward_payouts\b/);
  });

  it('no public API economy ingest routes', () => {
    // Guard: ingest lives only under lib/economy — no app/api webhook yet.
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    expect(existsSync(join(process.cwd(), 'app/api/webhooks/affiliate/route.ts'))).toBe(
      false,
    );
  });
});
