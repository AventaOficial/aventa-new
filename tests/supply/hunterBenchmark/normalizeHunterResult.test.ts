import { describe, expect, it } from 'vitest';
import {
  chatGptScheduledSamplePayload,
  grokSamplePayload,
  normalizeHunterResult,
  hunterCandidateToS8Input,
} from '@/lib/supply/hunterBenchmark';

const baseMeta = {
  hunterId: 'hunter-a',
  runId: 'run-1',
  sourceId: 'chatgpt_scheduled',
  collectedAt: '2026-09-18T12:00:00.000Z',
  completedAt: '2026-09-18T12:00:05.000Z',
};

describe('normalizeHunterResult', () => {
  it('normaliza payload ChatGPT scheduled', () => {
    const out = normalizeHunterResult({
      ...baseMeta,
      payload: chatGptScheduledSamplePayload(),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.candidates).toHaveLength(1);
    expect(out.result.candidates[0].canonicalUrl).toContain('mercadolibre.com.mx');
    expect(out.result.candidates[0].currentPrice?.provenance).toBe('source_explicit');
  });

  it('normaliza payload Grok con deals[]', () => {
    const out = normalizeHunterResult({
      ...baseMeta,
      sourceId: 'grok',
      payload: grokSamplePayload(),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.candidates[0].identitySignals.some((s) => s.kind === 'asin')).toBe(true);
  });

  it('fail-closed cuando payload no es objeto', () => {
    const out = normalizeHunterResult({
      ...baseMeta,
      payload: 'garbage',
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.join(' ')).toMatch(/object/i);
  });

  it('fail-closed cuando todos los candidatos son inválidos', () => {
    const out = normalizeHunterResult({
      ...baseMeta,
      payload: {
        candidates: [{}, null],
      },
    });
    expect(out.ok).toBe(false);
  });

  it('expone contrato S8 por candidato', () => {
    const out = normalizeHunterResult({
      ...baseMeta,
      payload: chatGptScheduledSamplePayload(),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const s8Input = hunterCandidateToS8Input(out.result.candidates[0]);
    expect(s8Input.sourceUrl).toBeTruthy();
    expect(s8Input.currentPriceProvenance).toBe('source_explicit');
    expect(s8Input.identitySignals.length).toBeGreaterThan(0);
  });
});
