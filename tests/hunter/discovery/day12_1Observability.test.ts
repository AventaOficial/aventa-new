/**
 * Day 12.1 — observability-only hardening.
 * Instrumentation must NOT change DQE / S6.1 / provenance / artificial decisions.
 */

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeMlPriceIntel,
  diagnoseArtificialListPriceClauses,
  type MlDailySnapshot,
} from '@/lib/bots/ingest/mlPriceEngine';
import { evaluateMachineCandidateGate } from '@/lib/bots/ingest/candidateInsertGate';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import {
  buildCandidateObservation,
  normalizeOriginalRecoveredVia,
} from '@/lib/hunter/discovery/discoveryObservability';
import {
  diagnoseProvenanceCompleteness,
  appendProvenanceDiagnostics,
} from '@/lib/hunter/discovery/provenanceCompleteness';
import { persistDiscoveryCycleSnapshot } from '@/lib/hunter/discovery/persistContinuousDiscoveryTruth';
import { assignPrimaryTerminalReason } from '@/lib/hunter/discovery/verifiedYieldTerminal';
import { emptyVerifiedYieldFunnel } from '@/lib/hunter/discovery/verifiedYieldFunnel';
import {
  accumulateAutomationOutcome,
  buildAutomationCycleMetrics,
  emptyAutomationCycleCounts,
} from '@/lib/bots/ingest/automationCycleMetrics';
import type { DiscoveryCycleReport } from '@/lib/hunter/discovery/continuousDiscoveryCycle';

function day(recordedOn: string, lastPrice: number): MlDailySnapshot {
  return { recordedOn, lastPrice, minPrice: lastPrice, listPrice: null, regularPrice: null };
}

function priorHistory(prices: number[], today = '2026-09-22'): MlDailySnapshot[] {
  return prices.map((p, i) => {
    const d = new Date(`${today}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - (prices.length - i));
    const ymd = d.toISOString().slice(0, 10);
    return day(ymd, p);
  });
}

function meta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-_JM',
    title: 'Producto de prueba CeraVe 340ml observabilidad',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLA123456789_012025-F.jpg',
    discountPrice: 261,
    originalPrice: 399,
    discountPercent: 35,
    ...over,
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      historyReady: true,
      suspectedArtificialListPrice: false,
      ...(over.signals ?? {}),
    },
  };
}

function memorySnapshots() {
  const rows: Record<string, unknown>[] = [];
  const api = {
    from() {
      return {
        insert(row: Record<string, unknown>) {
          const exists = rows.some((r) => r.cycle_id === row.cycle_id);
          if (exists) return Promise.resolve({ error: { code: '23505', message: 'duplicate' } });
          rows.push(structuredClone(row));
          return Promise.resolve({ error: null });
        },
        upsert(row: Record<string, unknown>) {
          const idx = rows.findIndex((r) => r.cycle_id === row.cycle_id);
          if (idx >= 0) rows[idx] = structuredClone(row);
          else rows.push(structuredClone(row));
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(_col: string, id: string) {
              return {
                maybeSingle() {
                  const found = rows.find((r) => r.cycle_id === id) ?? null;
                  return Promise.resolve({ data: found, error: null });
                },
              };
            },
          };
        },
        update(row: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              return {
                filter(expr: string, _op: string, token: string) {
                  return {
                    select() {
                      const found = rows.find((r) => r.cycle_id === id);
                      const payload = (found?.payload ?? {}) as { claim_token?: string };
                      const key = expr.includes('claim_token') ? payload.claim_token : undefined;
                      if (!found || key !== token) return Promise.resolve({ data: [], error: null });
                      Object.assign(found, structuredClone(row));
                      return Promise.resolve({ data: [{ cycle_id: id }], error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { rows, client: api as unknown as SupabaseClient };
}

function baseReport(
  cycleId: string,
  obs: ReturnType<typeof buildCandidateObservation>[],
): DiscoveryCycleReport {
  const verifiedYield = emptyVerifiedYieldFunnel(cycleId);
  verifiedYield.discovered = obs.length;
  verifiedYield.identity_valid = obs.length;
  const counts = emptyAutomationCycleCounts();
  return {
    cycle_id: cycleId,
    startedAt: '2026-09-26T08:00:00.000Z',
    finishedAt: '2026-09-26T08:02:00.000Z',
    dryRun: true,
    mintAttempted: false,
    sources: [],
    funnel: {
      cycle_id: cycleId,
      sources_requested: 1,
      sources_succeeded: 1,
      sources_blocked: 0,
      sources_failed: 0,
      sources_empty: 0,
      candidates_discovered: obs.length,
      candidates_canonicalized: obs.length,
      duplicates: 0,
      unsupported: 0,
      invalid: 0,
      fetch_attempted: 1,
      fetch_success: 1,
      fetch_blocked: 0,
      fetch_failed: 0,
      extracted: obs.length,
      identified: obs.length,
      price_memory_ready: obs.filter((o) => o.history_ready).length,
      price_memory_not_ready: 0,
      offer_standard_pass: 0,
      dqe_verified: 0,
      dqe_potential: 0,
      dqe_blocked: 0,
      dqe_failed: 0,
      s61_pass: 0,
      s61_blocked: obs.length,
      s7_pass: 0,
      s7_blocked: 0,
      observations_created: 0,
      pending_created: 0,
      dry_run: true,
    },
    cycleFunnel: { cycle_id: cycleId } as DiscoveryCycleReport['cycleFunnel'],
    automation: buildAutomationCycleMetrics(counts),
    prioritizedUrls: obs.map((o) => o.url),
    gateSamples: obs.map((o) => ({
      url: o.url,
      qualityDecision: o.quality_decision,
      wouldInsert: o.would_insert,
      historyReady: o.history_ready,
      reasonCodes: o.reason_codes,
      provenanceGap: o.provenance?.gap,
      originalRecoveredVia: o.original_recovered_via,
      acquisitionPath: o.acquisition_path,
    })),
    candidateObservations: obs,
    mintResults: [],
    hunterSourceRuns: [],
    operator_verdict: 'dry-run',
    bySource: {},
    verifiedYield,
    terminalTraces: [],
  };
}

describe('Day12.1 originalRecoveredVia vocabulary', () => {
  it('A. explicit prices_endpoint normalizes correctly', () => {
    expect(normalizeOriginalRecoveredVia('prices_endpoint')).toBe('prices_endpoint');
  });

  it('B. products_items recovery path is first-class', () => {
    expect(normalizeOriginalRecoveredVia('products_items')).toBe('products_items');
  });

  it('C. absent original maps none → unavailable', () => {
    expect(normalizeOriginalRecoveredVia('none')).toBe('unavailable');
    expect(normalizeOriginalRecoveredVia('')).toBe('unavailable');
    expect(normalizeOriginalRecoveredVia(null)).toBe('unavailable');
  });
});

describe('Day12.1 provenance diagnostics (exact reasons)', () => {
  it('D. missing original → exact gap + diagnostic code', () => {
    const report = diagnoseProvenanceCompleteness({
      meta: meta({
        originalPrice: null,
        discountPercent: 0,
        signals: {
          historyReady: true,
          originalPriceProvenance: 'unknown',
          currentPriceProvenance: 'source_explicit',
        },
      }),
      expectedProductId: 'MLM1234567890',
    });
    expect(report.complete).toBe(false);
    expect(report.gap).toBe('missing_current_original');
    expect(report.diagnosticCodes).toEqual(['PROVENANCE_MISSING_CURRENT_EVIDENCE']);
    const codes = appendProvenanceDiagnostics(['INVALID_ORIGINAL_PRICE'], report);
    expect(codes).toContain('INVALID_ORIGINAL_PRICE');
    expect(codes).toContain('PROVENANCE_MISSING_CURRENT_EVIDENCE');
  });
});

describe('Day12.1 artificial-list clauses (detection unchanged)', () => {
  it('E1. list_vs_regular clause', () => {
    const d = diagnoseArtificialListPriceClauses({
      current: 4699,
      listPrice: 8999,
      regularPrice: 4699,
      habitual30d: null,
      historyReady: false,
    });
    expect(d.detected).toBe(true);
    expect(d.clauses).toContain('list_vs_regular');
  });

  it('E2. list_vs_habitual clause', () => {
    const d = diagnoseArtificialListPriceClauses({
      current: 3300,
      listPrice: 10000,
      regularPrice: null,
      habitual30d: 3400,
      historyReady: true,
    });
    expect(d.detected).toBe(true);
    expect(d.clauses).toContain('list_vs_habitual');
  });

  it('E3. extreme_list_no_history clause', () => {
    const d = diagnoseArtificialListPriceClauses({
      current: 1000,
      listPrice: 2000,
      regularPrice: null,
      habitual30d: null,
      historyReady: false,
    });
    expect(d.detected).toBe(true);
    expect(d.clauses).toContain('extreme_list_no_history');
  });

  it('E4. extreme_list with historyReady preserves detection boolean', () => {
    const d = diagnoseArtificialListPriceClauses({
      current: 1000,
      listPrice: 1800,
      regularPrice: null,
      habitual30d: 2000,
      historyReady: true,
    });
    expect(d.detected).toBe(true);
    expect(d.clauses).toContain('extreme_list');
    const intel = computeMlPriceIntel(
      { current: 1000, listPrice: 1800, regularPrice: null },
      priorHistory([2000, 2000, 2000, 2000]),
      '2026-09-22',
    );
    expect(intel.suspectedArtificialListPrice).toBe(true);
    expect(intel.artificialListPriceClauses).toContain('extreme_list');
  });
});

describe('Day12.1 gate decisions unchanged by observability', () => {
  it('F. provenance complete + not artificial → observation mirrors pass path', () => {
    const m = meta({
      signals: {
        historyReady: true,
        currentPriceProvenance: 'source_explicit',
        originalPriceProvenance: 'source_explicit',
        suspectedArtificialListPrice: false,
        artificialListPriceClauses: [],
      },
    });
    const prov = diagnoseProvenanceCompleteness({
      meta: m,
      expectedProductId: 'MLM1234567890',
    });
    expect(prov.complete).toBe(true);
    const obs = buildCandidateObservation({
      url: m.canonicalUrl,
      sourceId: 'sticky_history_ready',
      productId: 'MLM1234567890',
      historyReady: true,
      meta: m,
      acquisitionPath: 'sticky_observe',
      originalRecoveredVia: 'prices_endpoint',
      qualityDecision: 'VERIFIED_OPPORTUNITY',
      wouldInsert: true,
      dqeDecision: 'VERIFIED_DEAL',
      primaryTerminal: 'DRY_RUN_WOULD_INSERT',
      reasonCodes: [],
      provenanceDiag: prov,
    });
    expect(obs.provenance?.complete).toBe(true);
    expect(obs.artificial?.detected).toBe(false);
    expect(obs.original_recovered_via).toBe('prices_endpoint');
  });

  it('G. provenance complete but S6.1 still blocks → terminal remains S6.1 authority', () => {
    const m = meta({
      originalPrice: 262,
      discountPercent: 0,
      signals: {
        historyReady: true,
        currentPriceProvenance: 'source_explicit',
        originalPriceProvenance: 'source_explicit',
        suspectedArtificialListPrice: false,
      },
    });
    const config = loadBotIngestConfig();
    const gate = evaluateMachineCandidateGate({
      url: m.canonicalUrl,
      meta: m,
      config,
      verifierDecision: 'pending',
      verifierReasons: [],
      duplicate: null,
      dealScore: null,
      dealQuality: { decision: 'VERIFIED_DEAL', reasons: [] } as never,
    });
    const prov = diagnoseProvenanceCompleteness({
      meta: m,
      expectedProductId: 'MLM1234567890',
    });
    expect(prov.complete).toBe(true);
    expect(gate.wouldInsert).toBe(false);
    const terminal = assignPrimaryTerminalReason({
      dryRun: true,
      identityValid: true,
      extracted: true,
      fetchBlocked: false,
      historyReady: true,
      dqeDecision: 'VERIFIED_DEAL',
      s61WouldInsert: gate.wouldInsert,
      s61QualityDecision: gate.qualityDecision,
      reasonCodes: gate.reasonCodes,
    });
    expect(terminal).not.toBe('VERIFIED_YIELD');
    const obs = buildCandidateObservation({
      url: m.canonicalUrl,
      sourceId: 'sticky_history_ready',
      productId: 'MLM1234567890',
      historyReady: true,
      meta: m,
      acquisitionPath: 'sticky_observe',
      originalRecoveredVia: 'products_items',
      qualityDecision: gate.qualityDecision,
      wouldInsert: gate.wouldInsert,
      dqeDecision: 'VERIFIED_DEAL',
      primaryTerminal: terminal,
      reasonCodes: gate.reasonCodes,
      provenanceDiag: prov,
    });
    expect(obs.would_insert).toBe(false);
    expect(obs.provenance?.complete).toBe(true);
    expect(obs.primary_terminal).toBe(terminal);
  });
});

describe('Day12.1 durable snapshot + idempotency + dry-run safety', () => {
  it('H. snapshot payload retains candidate_observations + gate_samples', async () => {
    const { rows, client } = memorySnapshots();
    const m = meta({
      signals: {
        historyReady: true,
        suspectedArtificialListPrice: true,
        artificialListPriceClauses: ['list_vs_habitual'],
        habitual30d: 3400,
        currentPriceProvenance: 'source_explicit',
        originalPriceProvenance: 'source_explicit',
      },
    });
    const prov = diagnoseProvenanceCompleteness({
      meta: m,
      expectedProductId: 'MLM1234567890',
    });
    const obs = buildCandidateObservation({
      url: m.canonicalUrl,
      sourceId: 'sticky_history_ready',
      productId: 'MLM1234567890',
      historyReady: true,
      meta: m,
      acquisitionPath: 'sticky_observe',
      originalRecoveredVia: 'products_items',
      qualityDecision: 'REJECT',
      wouldInsert: false,
      dqeDecision: 'NO_VERIFIED_DEAL',
      primaryTerminal: 'ARTIFICIAL_LIST_PRICE',
      reasonCodes: ['ARTIFICIAL_LIST_PRICE'],
      provenanceDiag: prov,
    });
    expect(obs.artificial?.reason).toBe('list_vs_habitual');

    const report = baseReport('00000000-0000-4000-8000-000000001201', [obs]);
    const written = await persistDiscoveryCycleSnapshot(report, { supabase: client });
    expect(written.persisted).toBe(true);
    const payload = rows[0]!.payload as Record<string, unknown>;
    expect(payload.observability_schema_version).toBe(1);
    expect(Array.isArray(payload.candidate_observations)).toBe(true);
    expect((payload.candidate_observations as unknown[]).length).toBe(1);
    expect(Array.isArray(payload.gate_samples)).toBe(true);
    const sample = (payload.gate_samples as Array<Record<string, unknown>>)[0]!;
    expect(sample.originalRecoveredVia).toBe('products_items');
  });

  it('I. retry same cycle_id upserts once — no duplicate rows / KPI inflation', async () => {
    const { rows, client } = memorySnapshots();
    const cycleId = '00000000-0000-4000-8000-000000001202';
    const obs = buildCandidateObservation({
      url: 'https://articulo.mercadolibre.com.mx/MLM-1-_JM',
      sourceId: 'sticky_history_ready',
      productId: 'MLM1',
      historyReady: true,
      meta: meta(),
      acquisitionPath: 'sticky_observe',
      originalRecoveredVia: 'prices_endpoint',
      qualityDecision: 'REJECT',
      wouldInsert: false,
      dqeDecision: 'REJECT',
      primaryTerminal: 'PROVENANCE_FAILURE',
      reasonCodes: ['PROVENANCE_MISSING_CURRENT_EVIDENCE'],
      provenanceDiag: diagnoseProvenanceCompleteness({ meta: meta({ originalPrice: null }) }),
    });
    const report = baseReport(cycleId, [obs]);
    await persistDiscoveryCycleSnapshot(report, { supabase: client });
    await persistDiscoveryCycleSnapshot(
      {
        ...report,
        finishedAt: '2026-09-26T08:05:00.000Z',
        candidateObservations: [obs, obs],
      },
      { supabase: client },
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.cycle_id).toBe(cycleId);
    const payload = rows[0]!.payload as { candidate_observations: unknown[] };
    expect(payload.candidate_observations.length).toBe(2);
  });

  it('J. dry-run never enables pending/mint/money writes', () => {
    expect(isMachinePendingWriteEnabled()).toBe(false);
    const counts = emptyAutomationCycleCounts();
    const next = accumulateAutomationOutcome(counts, 'blocked', {
      dryRun: true,
      enriched: true,
      dqeVerified: true,
      s61Passed: true,
    });
    const metrics = buildAutomationCycleMetrics(next);
    expect(metrics.pending_created).toBe(0);
    const report = baseReport('00000000-0000-4000-8000-000000001203', []);
    expect(report.dryRun).toBe(true);
    expect(report.mintAttempted).toBe(false);
    expect(report.funnel.pending_created).toBe(0);
  });
});

describe('Day12.1 safety assertions', () => {
  it('money path frozen + machine pending absent', () => {
    expect(process.env.MONEY_PATH_FROZEN ?? 'true').not.toBe('false');
    expect(isMachinePendingWriteEnabled()).toBe(false);
    const pendingFlag = process.env.BOT_INGEST_MACHINE_PENDING_WRITES ?? '';
    expect(pendingFlag).not.toMatch(/^(1|true|on|yes)$/i);
  });
});
