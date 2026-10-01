import { describe, expect, it } from 'vitest';
import { supplyInputsFromDiscoveryReport } from '@/lib/hunter/discovery/persistContinuousDiscoveryTruth';
import { emptyVerifiedYieldFunnel } from '@/lib/hunter/discovery/verifiedYieldFunnel';
import { emptyAutomationCycleCounts, buildAutomationCycleMetrics } from '@/lib/bots/ingest/automationCycleMetrics';
import type { DiscoveryCycleReport } from '@/lib/hunter/discovery/continuousDiscoveryCycle';
import { emptySourceFunnel } from '@/lib/bots/ingest/sourceFunnelMetrics';

function minimalReport(): DiscoveryCycleReport {
  const counts = emptyAutomationCycleCounts();
  const verifiedYield = emptyVerifiedYieldFunnel('cycle-day8');
  verifiedYield.discovered = 10;
  verifiedYield.identity_valid = 8;
  verifiedYield.dqe_verified = 2;
  return {
    cycle_id: 'cycle-day8',
    startedAt: '2026-09-25T12:00:00.000Z',
    finishedAt: '2026-09-25T12:01:00.000Z',
    dryRun: true,
    mintAttempted: false,
    sources: [],
    funnel: {
      cycle_id: 'cycle-day8',
      sources_requested: 1,
      sources_succeeded: 1,
      sources_blocked: 0,
      sources_failed: 0,
      sources_empty: 0,
      candidates_discovered: 10,
      candidates_canonicalized: 10,
      duplicates: 0,
      unsupported: 0,
      invalid: 0,
      fetch_attempted: 10,
      fetch_success: 5,
      fetch_blocked: 5,
      fetch_failed: 0,
      extracted: 5,
      identified: 8,
      price_memory_ready: 2,
      price_memory_not_ready: 6,
      offer_standard_pass: 8,
      dqe_verified: 2,
      dqe_potential: 1,
      dqe_blocked: 2,
      dqe_failed: 0,
      s61_pass: 1,
      s61_blocked: 7,
      s7_pass: 0,
      s7_blocked: 0,
      observations_created: 0,
      pending_created: 0,
      dry_run: true,
    },
    cycleFunnel: {
      cycle_id: 'cycle-day8',
      operator_verdict: 'test',
      dry_run: true,
      bottleneck: 'none',
    } as DiscoveryCycleReport['cycleFunnel'],
    automation: buildAutomationCycleMetrics(counts),
    prioritizedUrls: [],
    gateSamples: [],
    mintResults: [],
    hunterSourceRuns: [],
    operator_verdict: 'test',
    bySource: {
      sticky_near_ready: {
        ...emptySourceFunnel('sticky_near_ready', 'SUCCESS'),
        discovered: 7,
        identity_valid: 7,
        dqe_verified: 1,
        dqe_potential: 1,
        s61_pass: 1,
      },
      ml_api_legacy: {
        ...emptySourceFunnel('ml_api_legacy', 'SKIPPED'),
        discovered: 0,
      },
    },
    verifiedYield,
    terminalTraces: [],
  };
}

describe('Day8 durable supply truth mapping', () => {
  it('maps bySource into idempotent supply run inputs keyed by cycle_id', () => {
    const inputs = supplyInputsFromDiscoveryReport(minimalReport());
    expect(inputs.length).toBe(2);
    expect(inputs.every((i) => i.runId === 'cycle-day8')).toBe(true);
    const sticky = inputs.find((i) => i.sourceId === 'sticky_near_ready');
    expect(sticky?.verifiedDeals).toBe(1);
    expect(sticky?.candidatesDiscovered).toBe(7);
    expect(sticky?.pending).toBe(0); // dry-run must not count pending
  });

  it('does not invent a second writer path', () => {
    // Contract: persist module only writes supply truth / snapshots — never offers.
    const src = require('fs').readFileSync(
      require('path').join(
        process.cwd(),
        'lib/hunter/discovery/persistContinuousDiscoveryTruth.ts',
      ),
      'utf8',
    );
    expect(src).not.toMatch(/from\(['\"]offers['\"]\)/);
    expect(src).not.toMatch(/writePendingViaS7/);
  });
});
