/**
 * Day 12 — provenance completeness for sticky_history_ready reacquisition.
 * Does not relax DQE/S6.1; PM history alone never completes provenance.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ML_PRICE_MIN_HISTORY_DAYS } from '@/lib/bots/ingest/mlPriceEngine';
import { evaluateMachineCandidateGate } from '@/lib/bots/ingest/candidateInsertGate';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  diagnoseProvenanceCompleteness,
  appendProvenanceDiagnostics,
} from '@/lib/hunter/discovery/provenanceCompleteness';
import { assignPrimaryTerminalReason } from '@/lib/hunter/discovery/verifiedYieldTerminal';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';

const ROOT = process.cwd();

function meta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-_JM',
    title: 'Producto de prueba CeraVe 340ml',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLA123456789_012025-F.jpg',
    discountPrice: 261,
    originalPrice: 399,
    discountPercent: 35,
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      historyReady: true,
      ...(over.signals ?? {}),
    },
    ...over,
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      historyReady: true,
      ...(over.signals ?? {}),
    },
  };
}

describe('Day12 provenance detection', () => {
  it('complete current evidence + identity → provenance complete', () => {
    const report = diagnoseProvenanceCompleteness({
      meta: meta(),
      expectedProductId: 'MLM1234567890',
    });
    expect(report.complete).toBe(true);
    expect(report.gap).toBe('none');
    expect(report.pmHistoryIsNotProvenance).toBe(true);
  });

  it('PM historyReady alone without original → PROVENANCE missing current', () => {
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
    expect(report.diagnosticCodes).toContain('PROVENANCE_MISSING_CURRENT_EVIDENCE');
  });

  it('identity mismatch → PROVENANCE_IDENTITY_MISMATCH', () => {
    const report = diagnoseProvenanceCompleteness({
      meta: meta(),
      expectedProductId: 'MLM9999999999',
    });
    expect(report.complete).toBe(false);
    expect(report.gap).toBe('identity_mismatch');
  });

  it('stale/absent current evidence → failure', () => {
    const report = diagnoseProvenanceCompleteness({
      meta: null,
      currentEvidenceAbsent: true,
    });
    expect(report.complete).toBe(false);
    expect(report.gap).toBe('stale_or_absent_current');
  });

  it('untrusted provenance tag even with prices → failure', () => {
    const report = diagnoseProvenanceCompleteness({
      meta: meta({
        signals: {
          historyReady: true,
          originalPriceProvenance: 'price_intel_derivation',
          currentPriceProvenance: 'price_intel_derivation',
        },
      }),
    });
    expect(report.complete).toBe(false);
    expect(report.gap).toBe('untrusted_provenance_tag');
  });
});

describe('Day12 gate + terminal', () => {
  it('valid current evidence may continue to DQE/S6.1 authority', () => {
    const m = meta();
    const gate = evaluateMachineCandidateGate({
      url: m.canonicalUrl,
      meta: m,
      config: loadBotIngestConfig(),
      verifierDecision: 'pending',
      verifierReasons: [],
      duplicate: null,
      dealScore: null,
      dealQuality: {
        decision: 'VERIFIED_DEAL',
        reasons: [],
        score: 0.9,
      } as never,
    });
    const diag = diagnoseProvenanceCompleteness({ meta: m, expectedProductId: 'MLM1234567890' });
    expect(diag.complete).toBe(true);
    expect(gate.reasonCodes).not.toContain('ORIGINAL_PRICE_UNTRUSTED');
  });

  it('missing original stays PROVENANCE_FAILURE terminal', () => {
    const codes = appendProvenanceDiagnostics(
      ['INVALID_ORIGINAL_PRICE'],
      diagnoseProvenanceCompleteness({
        meta: meta({ originalPrice: null, discountPercent: 0 }),
      }),
    );
    const terminal = assignPrimaryTerminalReason({
      extracted: true,
      identityValid: true,
      historyReady: true,
      reasonCodes: codes,
      dqeDecision: 'VERIFIED_DEAL',
      s61WouldInsert: false,
      s61QualityDecision: 'SUPPRESSED',
    });
    expect(terminal).toBe('PROVENANCE_FAILURE');
    expect(codes).toContain('PROVENANCE_MISSING_CURRENT_EVIDENCE');
  });

  it('source-specific provenance failure does not invent FAILED taxonomy', () => {
    expect(ML_PRICE_MIN_HISTORY_DAYS).toBe(4);
    const terminal = assignPrimaryTerminalReason({
      extracted: true,
      identityValid: true,
      historyReady: true,
      reasonCodes: ['ORIGINAL_PRICE_UNTRUSTED', 'PROVENANCE_MISSING_CURRENT_EVIDENCE'],
      s61WouldInsert: false,
      s61QualityDecision: 'SUPPRESSED',
    });
    expect(terminal).toBe('PROVENANCE_FAILURE');
  });
});

describe('Day12 safety invariants', () => {
  it('does not fabricate; mint default OFF; sole writer unique', () => {
    const diag = readFileSync(
      join(ROOT, 'lib/hunter/discovery/provenanceCompleteness.ts'),
      'utf8',
    );
    expect(diag).toMatch(/PRICE MEMORY IS NOT PROVENANCE/);
    expect(diag).not.toMatch(/historyReady\)\s*provenance\s*=\s*true/);
    const observe = readFileSync(
      join(ROOT, 'lib/hunter/supply/observeStickySkus.ts'),
      'utf8',
    );
    expect(observe).toMatch(/originalRecoveredVia/);
    expect(observe).toMatch(/products_items/);
    expect(observe).toMatch(/never invent|No inventa|never use PM history/i);
    const writer = readFileSync(
      join(ROOT, 'lib/offers/ingestion/ingestOfferObservation.ts'),
      'utf8',
    );
    expect(writer).toMatch(/from\('offers'\)\.insert/);
    const prev = process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    expect(isMachinePendingWriteEnabled()).toBe(false);
    if (prev === undefined) delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    else process.env.BOT_INGEST_MACHINE_PENDING_WRITES = prev;
  });

  it('DQE/S6.1 thresholds not edited by Day12 provenance module', () => {
    const d12 = readFileSync(
      join(ROOT, 'lib/hunter/discovery/provenanceCompleteness.ts'),
      'utf8',
    );
    expect(d12).not.toMatch(/VERIFIED_DEAL_THRESHOLD|MIN_DISCOUNT|ML_PRICE_MIN_HISTORY_DAYS\s*=/);
  });
});
