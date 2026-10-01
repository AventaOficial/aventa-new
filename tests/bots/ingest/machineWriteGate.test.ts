import { describe, expect, it } from 'vitest';
import { evaluateMachineWriteGate } from '@/lib/bots/ingest/machineWriteGate';

describe('machine write gate (staging canary conditions)', () => {
  it('staging + writes ON + !dryRun → allowed', () => {
    const g = evaluateMachineWriteGate({
      vercelEnv: 'preview',
      nodeEnv: 'development',
      botIngestMachinePendingWrites: '1',
      workerDiscoveryOnlyOrDryRun: false,
    });
    expect(g.allowed).toBe(true);
    expect(g.blockingReason).toBeNull();
  });

  it('dryRun blocks even if writes ON', () => {
    const g = evaluateMachineWriteGate({
      vercelEnv: 'preview',
      nodeEnv: 'development',
      botIngestMachinePendingWrites: '1',
      workerDiscoveryOnlyOrDryRun: true,
    });
    expect(g.allowed).toBe(false);
    expect(g.blockingReason).toBe('DRY_RUN');
  });

  it('production always blocked', () => {
    const g = evaluateMachineWriteGate({
      vercelEnv: 'production',
      nodeEnv: 'production',
      botIngestMachinePendingWrites: '1',
      workerDiscoveryOnlyOrDryRun: false,
    });
    expect(g.allowed).toBe(false);
    expect(g.blockingReason).toBe('PRODUCTION_BLOCKED');
  });

  it('writes flag off blocks', () => {
    const g = evaluateMachineWriteGate({
      vercelEnv: 'preview',
      nodeEnv: 'development',
      botIngestMachinePendingWrites: undefined,
      workerDiscoveryOnlyOrDryRun: false,
    });
    expect(g.blockingReason).toBe('MACHINE_WRITES_DISABLED');
  });
});
