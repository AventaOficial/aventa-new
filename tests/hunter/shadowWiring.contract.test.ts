import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HUNTER_METRIC_UNIVERSES } from '@/lib/hunter/metricUniverses';

function src(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

function assertShadowObserveOrder(fileSrc: string, fileLabel: string) {
  const evalAt = fileSrc.indexOf('evaluateDealSafe(');
  const observeAt = fileSrc.indexOf('observeIngestShadow(');
  const beginAt = fileSrc.indexOf('beginAutonomousShadowCycle(');
  const enrichAt = fileSrc.indexOf('enrichParsedOfferMetadata(');
  const intelAt = fileSrc.indexOf('enrichWithPriceIntel(');
  const originalPriceSkip = fileSrc.indexOf('sin precio original verificable');
  const insertDup = fileSrc.indexOf('ins.duplicate');

  expect(beginAt, `${fileLabel} beginAutonomousShadowCycle`).toBeGreaterThan(-1);
  expect(enrichAt, `${fileLabel} enrichParsedOfferMetadata`).toBeGreaterThan(-1);
  expect(intelAt, `${fileLabel} enrichWithPriceIntel`).toBeGreaterThan(-1);
  expect(evalAt, `${fileLabel} evaluateDealSafe`).toBeGreaterThan(-1);
  expect(observeAt, `${fileLabel} observeIngestShadow`).toBeGreaterThan(evalAt);
  expect(originalPriceSkip, `${fileLabel} quality skip before observe`).toBeGreaterThan(-1);
  expect(originalPriceSkip).toBeLessThan(observeAt);
  expect(insertDup, `${fileLabel} insert duplicate after observe`).toBeGreaterThan(observeAt);
}

describe('FASE 4.5.1 shadow wiring contract', () => {
  it('ml_worker y runIngestCycle observan después del verifier y de quality gates', () => {
    assertShadowObserveOrder(src('lib/bots/ingest/externalWorker.ts'), 'externalWorker');
    assertShadowObserveOrder(src('lib/bots/ingest/runIngestCycle.ts'), 'runIngestCycle');
  });

  it('universos de métricas no se mezclan (persistencia distinta)', () => {
    expect(HUNTER_METRIC_UNIVERSES.sourceHealth.persistence).toBe('supabase_hunter_source_health');
    expect(HUNTER_METRIC_UNIVERSES.hunterEnrichment.persistence).toBe('process_memory');
    expect(HUNTER_METRIC_UNIVERSES.dealVerifier.persistence).toBe('process_memory');
    expect(HUNTER_METRIC_UNIVERSES.autonomousShadow.persistence).toBe('process_memory');
    expect(HUNTER_METRIC_UNIVERSES.sourceHealth.itemsFound).toMatch(/payload crudo/i);
    expect(HUNTER_METRIC_UNIVERSES.autonomousShadow.evaluated).toMatch(/quality gates/i);
  });

  it('no toca rewards / commissions / ledger', () => {
    for (const rel of [
      'lib/bots/ingest/externalWorker.ts',
      'lib/bots/ingest/runIngestCycle.ts',
      'lib/hunter/metricUniverses.ts',
    ]) {
      const text = src(rel);
      expect(text).not.toMatch(/lib\/rewards|lib\/commissions|lib\/ledger/);
    }
  });
});
