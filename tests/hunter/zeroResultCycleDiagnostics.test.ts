/**
 * Zero-result Hunter cycles must be diagnosticable:
 * empty discovery vs dryRun vs production_blocked vs writes_disabled.
 */

import { describe, expect, it } from 'vitest';
import {
  buildSupplyOpsRunSummary,
  diagnoseSupplyOpsBottleneck,
} from '@/lib/bots/ingest/supplyOpsRunSummary';
import {
  buildCycleFunnelSummary,
  explainCycleVerdict,
} from '@/lib/bots/ingest/cycleFunnelSummary';

const base = {
  runId: 'run-test',
  startedAt: '2026-09-21T12:00:00.000Z',
  finishedAt: '2026-09-21T12:00:05.000Z',
  profile: 'standard',
  discovered: 0,
  identityValid: 0,
  identityInvalid: 0,
  qualityVerified: 0,
  suppressed: 0,
  duplicates: 0,
  liveEligible: 0,
  budgetRejected: 0,
  writeAttempts: 0,
  writeSuccess: 0,
  writeDuplicate: 0,
  writeFailed: 0,
  writesDisabled: 0,
  dryRunSimulated: 0,
};

describe('Hunter zero-result cycle diagnostics', () => {
  it('empty discovery → bottleneck discovery_empty + moderation=0', () => {
    const ops = buildSupplyOpsRunSummary({
      ...base,
      dryRun: true,
      machinePendingWritesEnabled: false,
      discovered: 0,
    });
    expect(ops.bottleneck).toBe('discovery_empty');
    expect(ops.offersSentToModeration).toBe(0);
    const funnel = buildCycleFunnelSummary(ops);
    expect(funnel.offers_sent_to_moderation).toBe(0);
    expect(funnel.operator_verdict).toMatch(/discovery/i);
  });

  it('dryRun with eligible → would_insert observation, not moderation', () => {
    const ops = buildSupplyOpsRunSummary({
      ...base,
      dryRun: true,
      machinePendingWritesEnabled: true,
      discovered: 10,
      identityValid: 8,
      qualityVerified: 5,
      liveEligible: 5,
      dryRunSimulated: 3,
    });
    expect(ops.bottleneck).toBe('dry_run');
    expect(ops.wouldInsertObservation).toBe(3);
    expect(ops.offersSentToModeration).toBe(0);
    const verdict = explainCycleVerdict({
      bottleneck: ops.bottleneck,
      bottleneckDetail: ops.bottleneckDetail,
      discovered: ops.discovered,
      offersSent: 0,
      wouldInsert: 3,
      dryRun: true,
      productionWriteBlocked: true,
      writesEnabled: true,
    });
    expect(verdict).toMatch(/dryRun|WORKER_DISCOVERY_ONLY/i);
    expect(verdict).toMatch(/offers_sent_to_moderation=0/);
  });

  it('production_blocked when not dryRun and eligible', () => {
    const { bottleneck } = diagnoseSupplyOpsBottleneck({
      ...base,
      dryRun: false,
      machinePendingWritesEnabled: true,
      productionWriteBlocked: true,
      discovered: 10,
      identityValid: 8,
      qualityVerified: 4,
      liveEligible: 4,
    });
    expect(bottleneck).toBe('production_blocked');
  });

  it('writes_disabled when not dryRun, not production, writes OFF', () => {
    const { bottleneck } = diagnoseSupplyOpsBottleneck({
      ...base,
      dryRun: false,
      machinePendingWritesEnabled: false,
      productionWriteBlocked: false,
      discovered: 10,
      identityValid: 8,
      qualityVerified: 4,
      liveEligible: 4,
    });
    expect(bottleneck).toBe('writes_disabled');
  });

  it('real moderation inserts clear bottleneck', () => {
    const ops = buildSupplyOpsRunSummary({
      ...base,
      dryRun: false,
      machinePendingWritesEnabled: true,
      productionWriteBlocked: false,
      discovered: 10,
      identityValid: 8,
      qualityVerified: 4,
      liveEligible: 4,
      writeAttempts: 2,
      writeSuccess: 2,
    });
    expect(ops.bottleneck).toBe('none');
    expect(ops.offersSentToModeration).toBe(2);
    expect(buildCycleFunnelSummary(ops).operator_verdict).toMatch(/Moderation received 2/);
  });
});
