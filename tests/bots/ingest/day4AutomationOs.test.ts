/**
 * Day 4 automation KPI + lifecycle + freshness contract tests.
 */

import { describe, expect, it } from 'vitest';
import {
  accumulateAutomationOutcome,
  buildAutomationCycleMetrics,
  classifyAutomationOutcome,
  emptyAutomationCycleCounts,
  metricsFromWorkerResults,
  AUTOMATION_KPI_FORMULAS,
} from '@/lib/bots/ingest/automationCycleMetrics';
import {
  classifyTerminalFromGate,
  emptyStageCounts,
  recordStage,
} from '@/lib/bots/ingest/automationLifecycle';
import { diagnosePriceMemoryFreshness } from '@/lib/hunter/priceMemory/freshnessCycle';
import { summarizeRetailerMatrix } from '@/lib/hunter/retailerCapabilityMatrix';
import { remainingHumanRequiredSteps } from '@/lib/hunter/humanInterventionMatrix';

describe('automation KPI durability', () => {
  it('documents formulas', () => {
    expect(AUTOMATION_KPI_FORMULAS.automation_rate).toMatch(/auto_processed/);
    expect(AUTOMATION_KPI_FORMULAS.terminal_rate).toMatch(/candidate_count/);
  });

  it('dry-run cannot inflate automation_rate', () => {
    let counts = emptyAutomationCycleCounts();
    counts = accumulateAutomationOutcome(counts, 'auto_processed', {
      pendingCreated: true,
      dryRun: true,
    });
    const m = buildAutomationCycleMetrics(counts);
    expect(m.auto_processed).toBe(0);
    expect(m.pending_created).toBe(0);
    expect(m.blocked).toBe(1);
    expect(m.automation_rate).toBe(0);
  });

  it('duplicate cannot inflate automation_rate', () => {
    let counts = emptyAutomationCycleCounts();
    counts = accumulateAutomationOutcome(counts, 'duplicate');
    counts = accumulateAutomationOutcome(counts, 'auto_processed', {
      pendingCreated: true,
    });
    const m = buildAutomationCycleMetrics(counts);
    expect(m.duplicates).toBe(1);
    expect(m.auto_processed).toBe(1);
    expect(m.automation_rate).toBe(0.5);
    expect(m.terminal_rate).toBe(1);
  });

  it('classifyAutomationOutcome treats dry-run inserted as blocked', () => {
    expect(
      classifyAutomationOutcome({
        status: 'inserted',
        pendingCreated: true,
        dryRun: true,
      }),
    ).toBe('blocked');
  });

  it('metricsFromWorkerResults dry-run excludes auto', () => {
    const m = metricsFromWorkerResults(
      [
        { status: 'inserted' },
        { status: 'skipped', skipReason: 's61_blocked' },
        { status: 'duplicate' },
      ],
      { dryRun: true },
    );
    expect(m.auto_processed).toBe(0);
    expect(m.duplicates).toBe(1);
    expect(m.blocked).toBe(2);
    expect(m.automation_rate).toBe(0);
  });

  it('blocked source outcome is not auto success', () => {
    expect(
      classifyAutomationOutcome({
        status: 'skipped',
        skipReason: 'source_blocked',
      }),
    ).toBe('retryable');
  });
});

describe('lifecycle terminal classification', () => {
  it('fetch blocked → FETCH_BLOCKED', () => {
    const t = classifyTerminalFromGate({
      dryRun: false,
      extracted: false,
      identified: false,
      pmEnriched: false,
      dqeDecision: null,
      s61WouldInsert: false,
      fetchBlocked: true,
    });
    expect(t.lossCode).toBe('FETCH_BLOCKED');
  });

  it('dry-run would-insert → WRITER_BLOCK not AUTO', () => {
    const t = classifyTerminalFromGate({
      dryRun: true,
      extracted: true,
      identified: true,
      pmEnriched: true,
      dqeDecision: 'VERIFIED_DEAL',
      s61WouldInsert: true,
    });
    expect(t.terminalActor).toBe('BLOCKED');
    expect(t.lossCode).toBe('WRITER_BLOCK');
  });

  it('records stage actors', () => {
    const c = emptyStageCounts();
    recordStage(c, 'DISCOVERED', 'AUTO');
    recordStage(c, 'PENDING', 'HUMAN');
    expect(c.DISCOVERED.AUTO).toBe(1);
    expect(c.PENDING.HUMAN).toBe(1);
  });
});

describe('price memory freshness diagnosis', () => {
  it('flags stale calendar days', () => {
    const d = diagnosePriceMemoryFreshness({
      observations: 4911,
      uniqueProducts: 1636,
      calendarDays: 36,
      historyReady: 388,
      nearReady: 157,
      notReady: 1091,
      lastDay: '2026-09-24',
      firstDay: '2026-08-20',
      todayYmd: '2026-09-26',
      rowsToday: 0,
      staleDays: 2,
    });
    expect(d.largestLoss).toBe('FETCH_BLOCKED');
    expect(d.diagnosis).toMatch(/behind today/);
  });

  it('current day is not stale', () => {
    const d = diagnosePriceMemoryFreshness({
      observations: 100,
      uniqueProducts: 10,
      calendarDays: 5,
      historyReady: 2,
      nearReady: 1,
      notReady: 7,
      lastDay: '2026-09-24',
      firstDay: '2026-09-20',
      todayYmd: '2026-09-24',
      rowsToday: 50,
      staleDays: 0,
    });
    expect(d.largestLoss).toBeNull();
    expect(d.diagnosis).toMatch(/current/);
  });
});

describe('retailer + human matrices', () => {
  it('retailer matrix includes Amazon and Mercado Libre', () => {
    const s = summarizeRetailerMatrix();
    expect(s.rows.some((r) => r.retailer.includes('Amazon'))).toBe(true);
    expect(s.rows.some((r) => r.retailer.includes('Mercado Libre'))).toBe(true);
    expect(s.rows.some((r) => r.retailer === 'Coppel')).toBe(true);
  });

  it('human matrix keeps moderation approve required', () => {
    const rem = remainingHumanRequiredSteps();
    expect(rem.some((r) => r.id === 'moderation_approve')).toBe(true);
    expect(rem.every((r) => r.id !== 'url_paste_discovery' || r.day4Status === 'removed')).toBe(
      true,
    );
  });
});
