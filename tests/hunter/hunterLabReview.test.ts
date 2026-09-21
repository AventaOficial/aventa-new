import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LAB_FN_RATE_MIN_FP_FN,
  LAB_FN_RATE_MIN_REVIEWED,
  LAB_PRIMARY_LABELS,
  classifyLabelOutcome,
  computeLabLabelCounters,
  computeLabMetricsPrep,
  computeLabReconciliation,
  derivePipelineStages,
  displayOrNd,
  latestLabelsByCandidate,
  parseLabListFilters,
  type LabCandidateRow,
} from '@/lib/hunter/candidateIntelligence';

describe('Hunter Lab Production Review — filters', () => {
  it('parseLabListFilters requires run_id', () => {
    expect(parseLabListFilters(new URLSearchParams('decision=WOULD_INSERT'))).toBeNull();
  });

  it('parseLabListFilters maps server-side filters + pagination', () => {
    const f = parseLabListFilters(
      new URLSearchParams({
        run_id: '229de9f1-3364-4f9a-9175-7b97c1567997',
        source: 'ml_worker',
        retailer: 'Mercado Libre',
        decision: 'REJECTED_SCORE',
        reason_code: 'score_below',
        stage: 'score',
        score_min: '10',
        score_max: '90',
        human_label: 'FALSE_NEGATIVE',
        unreviewed_only: '1',
        q: 'audífonos',
        page: '2',
        page_size: '25',
      }),
    );
    expect(f).toMatchObject({
      runId: '229de9f1-3364-4f9a-9175-7b97c1567997',
      source: 'ml_worker',
      retailer: 'Mercado Libre',
      decision: 'REJECTED_SCORE',
      reasonCode: 'score_below',
      stage: 'score',
      scoreMin: 10,
      scoreMax: 90,
      humanLabel: 'FALSE_NEGATIVE',
      reviewed: 'unreviewed',
      titleSearch: 'audífonos',
      page: 2,
      pageSize: 25,
    });
  });

  it('missed opportunities view flag', () => {
    const f = parseLabListFilters(
      new URLSearchParams({
        run_id: '229de9f1-3364-4f9a-9175-7b97c1567997',
        missed: '1',
      }),
    );
    expect(f?.missedOpportunities).toBe(true);
  });
});

describe('Hunter Lab — label persistence helpers / FN detection', () => {
  it('primary buttons map to existing CHECK enum values', () => {
    expect(LAB_PRIMARY_LABELS.GOOD).toBe('GOOD_DEAL');
    expect(LAB_PRIMARY_LABELS.BAD).toBe('BAD_DEAL');
    expect(LAB_PRIMARY_LABELS.UNCERTAIN).toBe('UNCERTAIN');
    expect(LAB_PRIMARY_LABELS.FALSE_NEGATIVE).toBe('FALSE_NEGATIVE');
  });

  it('latestLabelsByCandidate keeps newest append-only label', () => {
    const map = latestLabelsByCandidate([
      {
        candidate_id: 'c1',
        human_decision: 'BAD_DEAL',
        reviewed_at: '2026-09-20T10:00:00Z',
        hunter_decision: 'WOULD_INSERT',
      },
      {
        candidate_id: 'c1',
        human_decision: 'GOOD_DEAL',
        reviewed_at: '2026-09-20T12:00:00Z',
        hunter_decision: 'WOULD_INSERT',
      },
    ]);
    expect(map.get('c1')?.human_decision).toBe('GOOD_DEAL');
  });

  it('detects explicit FALSE_NEGATIVE and derived FN from GOOD_DEAL on reject', () => {
    expect(
      classifyLabelOutcome({
        hunterDecision: 'REJECTED_SCORE',
        humanDecision: 'FALSE_NEGATIVE',
      }),
    ).toBe('false_negative');
    expect(
      classifyLabelOutcome({
        hunterDecision: 'REJECTED_SCORE',
        humanDecision: 'GOOD_DEAL',
      }),
    ).toBe('false_negative');
  });

  it('counters + FN RATE sufficiency threshold', () => {
    const map = latestLabelsByCandidate([
      {
        candidate_id: 'a',
        human_decision: 'FALSE_NEGATIVE',
        reviewed_at: '2026-09-20T10:00:00Z',
        hunter_decision: 'REJECTED_SCORE',
      },
      {
        candidate_id: 'b',
        human_decision: 'FALSE_POSITIVE',
        reviewed_at: '2026-09-20T10:00:00Z',
        hunter_decision: 'WOULD_INSERT',
      },
      {
        candidate_id: 'c',
        human_decision: 'GOOD_DEAL',
        reviewed_at: '2026-09-20T10:00:00Z',
        hunter_decision: 'WOULD_INSERT',
      },
      {
        candidate_id: 'd',
        human_decision: 'BAD_DEAL',
        reviewed_at: '2026-09-20T10:00:00Z',
        hunter_decision: 'REJECTED_SCORE',
      },
      {
        candidate_id: 'e',
        human_decision: 'UNCERTAIN',
        reviewed_at: '2026-09-20T10:00:00Z',
        hunter_decision: 'NEEDS_REVIEW',
      },
    ]);
    const counters = computeLabLabelCounters({ total: 100, latestByCandidate: map });
    expect(counters.total).toBe(100);
    expect(counters.reviewed).toBe(5);
    expect(counters.pending).toBe(95);
    expect(counters.buenas).toBe(1);
    expect(counters.malas).toBe(1);
    expect(counters.duda).toBe(1);
    expect(counters.falseNegative).toBe(1);
    expect(counters.falsePositive).toBe(1);
    // 5 reviewed < 20, but FN+FP = 2 < 5 → still insufficient
    expect(counters.fnRate).toBeNull();
    expect(counters.fnRateDisplay).toContain('insuficientes');

    // Add enough FP/FN to hit LAB_FN_RATE_MIN_FP_FN
    const more = latestLabelsByCandidate([
      ...[...map.entries()].map(([id, v]) => ({
        candidate_id: id,
        human_decision: v.human_decision,
        reviewed_at: v.reviewed_at,
        hunter_decision: v.hunter_decision,
      })),
      {
        candidate_id: 'f',
        human_decision: 'FALSE_NEGATIVE',
        reviewed_at: '2026-09-20T11:00:00Z',
        hunter_decision: 'REJECTED_SCORE',
      },
      {
        candidate_id: 'g',
        human_decision: 'FALSE_POSITIVE',
        reviewed_at: '2026-09-20T11:00:00Z',
        hunter_decision: 'WOULD_INSERT',
      },
      {
        candidate_id: 'h',
        human_decision: 'FALSE_NEGATIVE',
        reviewed_at: '2026-09-20T11:00:00Z',
        hunter_decision: 'REJECTED_SCORE',
      },
    ]);
    const ready = computeLabLabelCounters({ total: 100, latestByCandidate: more });
    expect(ready.falseNegative + ready.falsePositive).toBeGreaterThanOrEqual(LAB_FN_RATE_MIN_FP_FN);
    expect(ready.fnRate).not.toBeNull();
    expect(ready.fnRateDisplay).not.toContain('insuficientes');
    expect(LAB_FN_RATE_MIN_REVIEWED).toBe(20);
  });
});

describe('Hunter Lab — reconciliation', () => {
  it('flags gap when discovered ≠ persisted', () => {
    const recon = computeLabReconciliation({
      run: {
        candidate_count: 100,
        decision_breakdown: { WOULD_INSERT: 40, REJECTED_SCORE: 60 },
      },
      persistedCount: 95,
    });
    expect(recon.discovered).toBe(100);
    expect(recon.persisted).toBe(95);
    expect(recon.gapDiscoveredPersisted).toBe(5);
    expect(recon.hasGap).toBe(true);
    expect(recon.kind).toBe('FACT');
  });

  it('silent drop gap from decision_breakdown mismatch', () => {
    const recon = computeLabReconciliation({
      run: {
        candidate_count: 10,
        decision_breakdown: { WOULD_INSERT: 3, REJECTED_SCORE: 5 },
      },
      persistedCount: 10,
    });
    expect(recon.silentDropsOk).toBe(false);
    expect(recon.gapSilentDrops).toBe(2);
    expect(recon.hasGap).toBe(true);
  });

  it('metrics prep separates FACT / LABEL / DERIVED', () => {
    const recon = computeLabReconciliation({
      run: {
        candidate_count: 50,
        decision_breakdown: { WOULD_INSERT: 20, REJECTED_SCORE: 30 },
      },
      persistedCount: 50,
    });
    const counters = computeLabLabelCounters({
      total: 50,
      latestByCandidate: latestLabelsByCandidate([
        {
          candidate_id: '1',
          human_decision: 'GOOD_DEAL',
          reviewed_at: '2026-09-20T10:00:00Z',
          hunter_decision: 'WOULD_INSERT',
        },
        {
          candidate_id: '2',
          human_decision: 'BAD_DEAL',
          reviewed_at: '2026-09-20T10:00:00Z',
          hunter_decision: 'WOULD_INSERT',
        },
      ]),
    });
    const m = computeLabMetricsPrep({
      recon,
      counters,
      run: {
        would_insert_count: 20,
        rejected_count: 30,
        needs_review_count: 0,
        decision_breakdown: recon.decisionTotals,
      },
    });
    expect(m.persisted.kind).toBe('FACT');
    expect(m.humanGood.kind).toBe('LABEL');
    expect(m.precisionApprox.kind).toBe('DERIVED');
    expect(m.precisionApprox.display).toBe('50%');
    expect(m.coverage.display).toBe('4%');
  });
});

describe('Hunter Lab — pipeline stages + display', () => {
  it('displayOrNd never invents values', () => {
    expect(displayOrNd(null)).toBe('N/D');
    expect(displayOrNd('')).toBe('N/D');
    expect(displayOrNd(42)).toBe('42');
  });

  it('derivePipelineStages is best-effort from persisted fields', () => {
    const row: LabCandidateRow = {
      id: 'c1',
      run_id: '229de9f1-3364-4f9a-9175-7b97c1567997',
      source: 'ml_worker',
      retailer: 'Mercado Libre',
      title: 'Audífonos',
      canonical_url: 'https://www.mercadolibre.com.mx/x',
      image_url: 'https://http2.mlstatic.com/x.jpg',
      sale_price: 499,
      original_price: 999,
      discount_percentage: 50,
      hunter_score: 64,
      decision: 'REJECTED_SCORE',
      reason_code: 'score_below_min',
      reason_detail: null,
      rejection_stage: 'score',
      score_explanation: [{ signal: 'price_drop', points: 18 }],
      image_validation_status: 'ok',
      diversity_cut: false,
      negative_memory_level: null,
      product_fingerprint: 'fp1',
      discovered_at: '2026-09-20T10:00:00Z',
    };
    const stages = derivePipelineStages(row);
    expect(stages.find((s) => s.stage === 'DISCOVERY')?.status).toBe('PASS');
    expect(stages.find((s) => s.stage === 'IDENTITY')?.status).toBe('PASS');
    expect(stages.find((s) => s.stage === 'SCORE')?.status).toBe('FAIL');
    expect(stages.find((s) => s.stage === 'DECISION')?.status).toBe('FAIL');
    expect(stages.find((s) => s.stage === 'TOP_K_DIVERSITY')?.status).toBe('PASS');
  });

  it('unknown enrichment without signals → N/D not invented FAIL', () => {
    const stages = derivePipelineStages({
      id: 'c2',
      run_id: 'r',
      source: 'ml_worker',
      retailer: null,
      title: null,
      canonical_url: 'https://x',
      image_url: null,
      sale_price: null,
      original_price: null,
      discount_percentage: null,
      hunter_score: null,
      decision: 'DISCOVERED',
      reason_code: 'discovered',
      reason_detail: null,
      rejection_stage: 'discovery',
      score_explanation: null,
      image_validation_status: null,
      diversity_cut: null,
      negative_memory_level: null,
      discovered_at: '2026-09-20T10:00:00Z',
    });
    expect(stages.find((s) => s.stage === 'ENRICHMENT')?.status).toBe('N/D');
    expect(stages.find((s) => s.stage === 'S9')?.status).toBe('SKIPPED');
  });
});

describe('Hunter Lab — API authorization + boundaries', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/server/requireAdmin');
    vi.doUnmock('@/lib/supabase/server');
    vi.resetModules();
  });

  it('GET /api/admin/hunter-lab rejects unauthorized', async () => {
    vi.resetModules();
    vi.doMock('@/lib/server/requireAdmin', () => ({
      requireUsersLogs: vi.fn(async () => ({ error: 'Unauthorized', status: 401 })),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn(() => ({ from: vi.fn() })),
    }));
    const { GET } = await import('@/app/api/admin/hunter-lab/route');
    const res = await GET(new Request('https://x/api/admin/hunter-lab'));
    expect(res.status).toBe(401);
  });

  it('POST /api/admin/hunter-lab/label rejects unauthorized', async () => {
    vi.resetModules();
    vi.doMock('@/lib/server/requireAdmin', () => ({
      requireUsersLogs: vi.fn(async () => ({ error: 'Unauthorized', status: 401 })),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      createServerClient: vi.fn(() => ({ from: vi.fn() })),
    }));
    const { POST } = await import('@/app/api/admin/hunter-lab/label/route');
    const res = await POST(
      new Request('https://x/api/admin/hunter-lab/label', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          candidate_id: '11111111-1111-4111-8111-111111111111',
          hunter_decision: 'WOULD_INSERT',
          human_decision: 'GOOD_DEAL',
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('label route never publishes / never touches offers mint', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/admin/hunter-lab/label/route.ts'), 'utf8');
    expect(src).toMatch(/hunter_candidate_human_labels|HUNTER_CANDIDATE_LABELS_TABLE/);
    expect(src).toMatch(/No publica/);
    expect(src).not.toMatch(/from\(['"]offers['"]\)/);
    expect(src).not.toMatch(/auto_approve|mintOffer|publishOffer/i);
  });

  it('lab review query uses batched label loads (no N+1 per candidate)', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/hunter/candidateIntelligence/labReviewQuery.ts'),
      'utf8',
    );
    expect(src).toMatch(/chunkSize/);
    expect(src).toMatch(/\.in\('candidate_id'/);
    expect(src).not.toMatch(/for \(const c of candidates\)[\s\S]*from\(HUNTER_CANDIDATE_LABELS/);
  });
});

describe('Hunter Lab — listing pagination helpers', () => {
  it('page_size caps at 100', () => {
    const f = parseLabListFilters(
      new URLSearchParams({
        run_id: '229de9f1-3364-4f9a-9175-7b97c1567997',
        page_size: '999',
      }),
    );
    expect(f?.pageSize).toBe(100);
  });
});
