/**
 * Economy integrity: audit append fail-closed + controlled activation readiness.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appendEconomicEvent } from '@/lib/economy/appendEconomicEvent';
import { evaluateControlledActivationReadiness } from '@/lib/economy/controlledActivationReadiness';

describe('appendEconomicEvent fail-closed', () => {
  it('returns ok:false when insert fails (no silent swallow)', async () => {
    const supabase = {
      from: () => ({
        insert: async () => ({ error: { message: 'relation missing' } }),
      }),
    };
    const result = await appendEconomicEvent(supabase as never, {
      entityType: 'conversion',
      entityId: 'c1',
      eventType: 'created',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/relation missing/);
  });

  it('returns ok:true when insert succeeds', async () => {
    const supabase = {
      from: () => ({
        insert: async () => ({ error: null }),
      }),
    };
    const result = await appendEconomicEvent(supabase as never, {
      entityType: 'commission',
      entityId: 'x',
      eventType: 'created',
    });
    expect(result).toEqual({ ok: true });
  });
});

describe('controlledActivationReadiness', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('production + frozen → SAFE_FROZEN with external blockers listed', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('MONEY_PATH_FROZEN', 'true');
    vi.stubEnv('SETTLEMENT_BRIDGE_ENABLED', 'false');
    vi.stubEnv('REWARDS_PROGRAM_ACTIVE', 'false');
    vi.stubEnv('COMMISSION_PROGRAM_ACTIVE', 'false');

    const report = evaluateControlledActivationReadiness();
    expect(report.productionRuntime).toBe(true);
    expect(report.moneyPathFrozen).toBe(true);
    expect(report.verdict).toBe('SAFE_FROZEN');
    expect(report.remainingBlockers).toContain('network_ingest_evidence');
    expect(report.remainingBlockers).not.toContain('settlement_reversal_money_movement');
  });

  it('non-prod frozen with only network ingest blocker → READY_FOR_CONTROLLED_ACTIVATION', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MONEY_PATH_FROZEN', 'true');
    vi.stubEnv('SETTLEMENT_BRIDGE_ENABLED', 'false');
    vi.stubEnv('REWARDS_PROGRAM_ACTIVE', 'false');
    vi.stubEnv('COMMISSION_PROGRAM_ACTIVE', 'false');

    const report = evaluateControlledActivationReadiness();
    expect(report.productionRuntime).toBe(false);
    expect(report.verdict).toBe('READY_FOR_CONTROLLED_ACTIVATION');
    expect(report.remainingBlockers).toEqual(['network_ingest_evidence']);
    expect(
      report.checks.find((c) => c.id === 'settlement_reversal_money_movement')?.ok,
    ).toBe(true);
  });
});
