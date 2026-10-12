import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  liveSubmitBlocker,
  prepareGrokBatch,
  resolveLiveBatchLimit,
  summarizeSubmissionStatus,
  toMcpCandidate,
} from '@/lib/despensa/grokBatch';
import { normalizeObservation, type RawObservationInput } from '@/lib/despensa/observation';
import { validateCandidates } from '@/lib/mcp/candidates';
import { MCP_MAX_CANDIDATES_PER_CALL, MCP_NOTE_MAX, MCP_TOOLS } from '@/lib/mcp/contract';
import { buildDespensaMissionBrief, DESPENSA_MISSION_EVIDENCE_RULES } from '@/lib/despensa/missions';
import { buildSubmissionRules } from '@/lib/mcp/rules';

const NOW = new Date('2026-10-12T12:00:00.000Z');
const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/despensa/grok-batch-sample.json'), 'utf8'),
) as { fixture: boolean; records: RawObservationInput[] };

describe('lote de Grok Bots', () => {
  const report = prepareGrokBatch(fixture.records, { now: NOW, runId: 'grok-fixture-run' });

  it('rechaza lo inverificable con su motivo y por índice', () => {
    const byIndex = Object.fromEntries(report.rejectedLocally.map((r) => [r.index, r.reasons]));
    expect(byIndex[6]).toContain('link_title_mismatch');
    expect(byIndex[7]).toContain('need_mismatch');
    expect(byIndex[9]).toContain('invalid_price');
    expect(byIndex[10]).toContain('invalid_list_price');
    expect(report.rejectedLocally).toHaveLength(4);
  });

  it('controla duplicados: misma ventana se agrupa, mismo producto en otra ventana lo frena MCP', () => {
    expect(report.duplicates).toBe(1);
    const codes = report.rejectedByMcpRules.map((r) => r.code).sort();
    expect(codes).toEqual(['DUPLICATE_IN_REQUEST', 'UNSUPPORTED_HOST']);
  });

  it('solo produce payloads que el servidor MCP aceptaría, sin campos de publicación', () => {
    expect(report.ready).toBe(7);
    for (const submission of report.submissions) {
      expect(submission.candidates.length).toBeLessThanOrEqual(MCP_MAX_CANDIDATES_PER_CALL);
      expect(submission.idempotencyKey).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
      const check = validateCandidates(submission.candidates, NOW);
      expect(check.rejected).toEqual([]);
      expect(check.duplicatesInRequest).toEqual([]);
      for (const c of submission.candidates) {
        expect(Object.keys(c).sort()).toEqual(expect.arrayContaining(['currency', 'note', 'observedAt', 'price', 'title', 'url']));
        expect(c).not.toHaveProperty('status');
        expect(c).not.toHaveProperty('publish');
        expect(Array.from(c.note).length).toBeLessThanOrEqual(MCP_NOTE_MAX);
      }
    }
  });

  it('solo envía originalPrice cuando la tienda mostró precio de lista', () => {
    const all = report.submissions.flatMap((s) => s.candidates);
    const withList = all.filter((c) => c.originalPrice != null);
    expect(withList.map((c) => c.url)).toEqual(['https://www.chedraui.com.mx/aceite-vegetal-fixture-946ml/p']);
    expect(report.metrics.verifiedDrops).toBe(0);
    expect(report.metrics.withStoreListPrice).toBe(1);
  });

  it('parte lotes grandes en envíos de hasta 20 con llaves idempotentes distintas', () => {
    const many: RawObservationInput[] = Array.from({ length: 45 }, (_, i) => ({
      url: `https://www.walmart.com.mx/ip/arroz-prueba/${1000 + i}`,
      title: `Arroz blanco Prueba ${i} 1 kg`,
      pageTitle: `Arroz blanco Prueba ${i} 1 kg`,
      price: 30 + i,
      currency: 'MXN',
      observedAt: '2026-10-12T10:00:00Z',
      brand: `Marca ${i}`,
      agent: { kind: 'grok_bot', id: 'grok-a' },
    }));
    const big = prepareGrokBatch(many, { now: NOW, runId: 'grok-big-run' });
    expect(big.submissions.map((s) => s.candidates.length)).toEqual([20, 20, 5]);
    expect(new Set(big.submissions.map((s) => s.idempotencyKey)).size).toBe(3);
  });

  it('mide cobertura, fuentes y edad sin inventar ahorro', () => {
    const m = report.metrics;
    expect(m.officialCoverage.total).toBe(24);
    expect(m.officialCoverage.covered).toBeGreaterThanOrEqual(5);
    expect(m.stores).toEqual(expect.arrayContaining(['walmart.com.mx', 'chedraui.com.mx', 'soriana.com']));
    expect(m.regions).toEqual(expect.arrayContaining(['physical_store:Sucursal de prueba', 'online_unknown']));
    expect(m.priorHistory.longitudinal).toBe(0);
    expect(m.newestObservationAgeHours).toBe(1.8);
    expect(m.validRate).toBe(50);
  });

  it('el note describe la evidencia en texto plano y pasa la validación del servidor', () => {
    const r = normalizeObservation(fixture.records[2], NOW);
    if (!r.ok) throw new Error('fixture inválido');
    const c = toMcpCandidate(r.observation);
    expect(c.note).toMatch(/need alimentos\.frijol\/negro/);
    expect(c.note).toMatch(/region physical_store Sucursal de prueba/);
    expect(c.note).not.toMatch(/[<>]/);
    expect(validateCandidates([c], NOW).valid).toHaveLength(1);
  });
});

describe('estado de envíos', () => {
  it('calcula aprobación y publicación solo con decisiones reales', () => {
    const s = summarizeSubmissionStatus([
      { state: 'received' },
      { state: 'in_review' },
      { state: 'accepted' },
      { state: 'rejected' },
      { state: 'duplicate' },
    ]);
    expect(s.approvalRate).toBe(50);
    expect(s.publicationRate).toBe(0);
    expect(s.pendingHumanReview).toBe(2);
    expect(summarizeSubmissionStatus([{ state: 'received' }]).approvalRate).toBeNull();
  });
});

describe('misión de Despensa en get_submission_rules', () => {
  it('es de solo lectura, prioriza la canasta oficial y nombra solo herramientas reales', () => {
    const brief = buildDespensaMissionBrief();
    expect(brief.writeMode).toBe('candidates_only');
    expect(brief.missions[0].priority).toBe('official_list');
    const named = DESPENSA_MISSION_EVIDENCE_RULES.join(' ').match(/\b[a-z]+(?:_[a-z]+){2,}\b/g) ?? [];
    for (const tool of named) expect(MCP_TOOLS as readonly string[]).toContain(tool);
    const rules = buildSubmissionRules(
      { id: 'c1', name: 'grok', status: 'active', scopes: ['candidates:read'], dailyCandidateCap: 200, authorProfileId: 'a' } as never,
      null,
    );
    expect(rules.despensa.contractVersion).toBe('despensa-missions-v2');
    expect(rules.tools.map((t) => t.name).sort()).toEqual([...MCP_TOOLS].sort());
  });
});

describe('envío real del script', () => {
  it('nunca pasa de cinco candidatos', () => {
    expect(resolveLiveBatchLimit(undefined)).toBe(5);
    expect(resolveLiveBatchLimit(true)).toBe(5);
    expect(resolveLiveBatchLimit('3')).toBe(3);
    for (const bad of ['6', '20', '0', '-1', '2.5', 'abc', '', '1e1']) expect(resolveLiveBatchLimit(bad)).toBeNull();
  });

  it('no envía fixtures ni simulaciones', () => {
    expect(liveSubmitBlocker({ path: 'lote.json', fixture: fixture.fixture })).toBe('fixture');
    expect(liveSubmitBlocker({ path: 'tests/fixtures/despensa/grok-batch-sample.json' })).toBe('fixture_path');
    expect(liveSubmitBlocker({ path: 'C:\\repo\\tests\\fixtures\\copia.json' })).toBe('fixture_path');
    expect(liveSubmitBlocker({ path: 'lote.json', simulatedNow: '2026-10-12T12:00:00Z' })).toBe('simulated_now');
    expect(liveSubmitBlocker({ path: 'runs/grok-20261012.json', fixture: false })).toBeNull();
  });
});
