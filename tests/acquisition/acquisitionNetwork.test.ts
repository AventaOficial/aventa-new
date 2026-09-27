import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACQUISITION_MAX_TEXT_CHARS, ACQUISITION_SOURCES } from '@/lib/acquisition/contract';
import {
  forbiddenAcquisitionMetadata,
  planAcquisitionUrls,
  scoutDailyRoom,
} from '@/lib/acquisition/plan';
import { summarizeAcquisition } from '@/lib/acquisition/metrics';
import { acquisitionOperatorReceipt } from '@/lib/acquisition/receipt';
import {
  registerAcquisitionScout,
  registerAcquisitionSource,
  submitAcquisitionCandidates,
} from '@/lib/acquisition/submit';
import { planHunterCandidateBridge } from '@/lib/offers/batch/hunterBridge';
import { findDuplicateOfferByUrl } from '@/lib/offers/findDuplicateOffer';

vi.mock('@/lib/offers/findDuplicateOffer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/offers/findDuplicateOffer')>();
  return { ...actual, findDuplicateOfferByUrl: vi.fn(async () => null) };
});

const URL_A = 'https://www.amazon.com.mx/dp/B0TEST0001';
const URL_A_TRACKING = 'https://www.amazon.com.mx/dp/B0TEST0001?tag=otro-20';
const URL_B = 'https://www.amazon.com.mx/dp/B0TEST0002';

function urlAt(index: number): string {
  return `https://www.amazon.com.mx/dp/B0${String(index).padStart(8, '0')}`;
}

type SourceRow = {
  id: string;
  source_key: string;
  source_type: string;
  display_name: string;
  description: string | null;
  active: boolean;
};

function harness(options?: {
  daily?: number;
  sources?: SourceRow[];
  scouts?: Array<{ id: string; source_id: string; active: boolean; display_name?: string; created_by?: string }>;
  failInsertAfter?: number;
}) {
  const sources = options?.sources ?? [
    { id: 'src-human', source_key: 'human_scout', source_type: 'human', display_name: 'Scout humano', description: null, active: true },
    { id: 'src-admin', source_key: 'admin_manual', source_type: 'internal', display_name: 'Admin manual', description: null, active: true },
    { id: 'src-hunter', source_key: 'chatgpt_deal_hunter', source_type: 'automated', display_name: 'ChatGPT Deal Hunter', description: null, active: true },
    { id: 'src-everyday', source_key: 'chatgpt_everyday', source_type: 'automated', display_name: 'ChatGPT Everyday', description: null, active: true },
  ];
  const scouts = options?.scouts ?? [{ id: 'scout-1', source_id: 'src-human', active: true, display_name: 'Ana', created_by: 'staff-1' }];
  const rows: Array<Record<string, unknown>> = [];
  const keys = new Set<string>();
  const upserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  let inserts = 0;

  function from(table: string) {
    const filters: Record<string, string> = {};
    let payload: Record<string, unknown> | null = null;
    let mode = 'select';
    const api = {
      select() {
        return api;
      },
      eq(key: string, value: string) {
        filters[key] = value;
        return api;
      },
      gte() {
        return api;
      },
      filter() {
        return api;
      },
      order() {
        return api;
      },
      upsert(row: Record<string, unknown>) {
        mode = 'upsert';
        payload = row;
        upserts.push({ table, row });
        return api;
      },
      insert(row: Record<string, unknown>) {
        mode = 'insert';
        payload = row;
        inserts += 1;
        if (options?.failInsertAfter != null && inserts > options.failInsertAfter) {
          return Promise.resolve({ data: null, error: { code: 'XX000', message: 'connection reset' } });
        }
        const key = `${row.run_id}\0${row.candidate_key}`;
        if (keys.has(key)) {
          return Promise.resolve({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint "hunter_offer_candidates_run_key_uidx"' },
          });
        }
        keys.add(key);
        rows.push(row);
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle() {
        return Promise.resolve(read(true));
      },
      single() {
        return Promise.resolve(read(true));
      },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(read(false)).then(onFulfilled, onRejected);
      },
    };

    function read(one: boolean) {
      if (mode === 'upsert' && table === 'acquisition_sources' && payload) {
        const saved = {
          id: 'src-new',
          source_key: payload.source_key,
          source_type: payload.source_type,
          display_name: payload.display_name,
          description: payload.description ?? null,
          active: true,
        };
        return { data: one ? saved : [saved], error: null, count: 1 };
      }
      if (mode === 'upsert' && table === 'acquisition_scouts' && payload) {
        const saved = {
          id: 'scout-new',
          source_id: payload.source_id,
          display_name: payload.display_name,
          active: true,
          created_by: payload.created_by,
        };
        return { data: one ? saved : [saved], error: null, count: 1 };
      }
      if (table === 'acquisition_sources') {
        const row = sources.find((source) => !filters.source_key || source.source_key === filters.source_key) ?? null;
        return { data: one ? row : sources, error: null, count: sources.length };
      }
      if (table === 'acquisition_scouts') {
        const row = scouts.find((scout) => scout.id === filters.id) ?? null;
        return { data: one ? row : scouts, error: null, count: scouts.length };
      }
      return { data: null, error: null, count: options?.daily ?? 0 };
    }

    return api;
  }

  return { from, rows, keys, upserts };
}

describe('catalogo y registro', () => {
  it('registra las cinco fuentes iniciales', () => {
    expect(ACQUISITION_SOURCES.map((source) => source.sourceKey)).toEqual([
      'chatgpt_deal_hunter',
      'chatgpt_everyday',
      'chatgpt_promotions',
      'human_scout',
      'admin_manual',
    ]);
  });

  it('registra una fuente', async () => {
    const db = harness();
    const result = await registerAcquisitionSource(db as never, {
      sourceKey: 'external_partner',
      sourceType: 'external',
      displayName: 'Partner',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.source_key).toBe('external_partner');
    expect(result.source.source_type).toBe('external');
  });

  it('registra un scout solo en una fuente humana', async () => {
    const db = harness();
    const scout = await registerAcquisitionScout(db as never, {
      sourceKey: 'human_scout',
      displayName: 'Ana',
      createdBy: 'staff-1',
    });
    expect(scout.ok).toBe(true);
    if (!scout.ok) return;
    expect(scout.scout.display_name).toBe('Ana');
    expect(scout.scout.created_by).toBe('staff-1');

    const blocked = await registerAcquisitionScout(db as never, {
      sourceKey: 'admin_manual',
      displayName: 'Nadie',
      createdBy: 'staff-1',
    });
    expect(blocked.ok).toBe(false);
  });
});

describe('planAcquisitionUrls', () => {
  it('acepta una y varias URLs con la misma función', () => {
    const one = planAcquisitionUrls(URL_A);
    const many = planAcquisitionUrls([URL_A, URL_B, urlAt(3)].join('\n'));
    expect('error' in one).toBe(false);
    expect('error' in many).toBe(false);
    if ('error' in one || 'error' in many) return;
    expect(one.accepted).toBe(1);
    expect(many.accepted).toBe(3);
  });

  it('deduplica la misma URL y la misma identidad dentro del envío', () => {
    const plan = planAcquisitionUrls(`${URL_A}\n${URL_A}\n${URL_A_TRACKING}`);
    expect('error' in plan).toBe(false);
    if ('error' in plan) return;
    expect(plan.accepted).toBe(1);
    expect(plan.duplicates).toBe(2);
  });

  it('rechaza una URL inválida', () => {
    const plan = planAcquisitionUrls(`https://no-es-valida\n${URL_B}`);
    expect('error' in plan).toBe(false);
    if ('error' in plan) return;
    expect(plan.invalid).toBe(1);
    expect(plan.accepted).toBe(1);
  });

  it('rechaza un payload enorme', () => {
    const plan = planAcquisitionUrls('a'.repeat(ACQUISITION_MAX_TEXT_CHARS + 1));
    expect(plan).toEqual({ error: `El texto supera ${ACQUISITION_MAX_TEXT_CHARS} caracteres.` });
  });

  it('corta en el tope de 100', () => {
    const text = Array.from({ length: 101 }, (_, index) => urlAt(index + 1)).join('\n');
    const plan = planAcquisitionUrls(text);
    expect('error' in plan).toBe(false);
    if ('error' in plan) return;
    expect(plan.accepted).toBe(100);
    expect(plan.overCap).toBe(1);
  });

  it('no acepta metadata de publicación', () => {
    expect(forbiddenAcquisitionMetadata({ offer_id: 'x' })).toMatch(/offer_id/);
    expect(forbiddenAcquisitionMetadata({ published: true })).toMatch(/published/);
    expect(scoutDailyRoom(500, 1)).toBe(false);
    expect(scoutDailyRoom(10, 1)).toBe(true);
  });
});

describe('submitAcquisitionCandidates', () => {
  beforeEach(() => {
    vi.mocked(findDuplicateOfferByUrl).mockReset();
    vi.mocked(findDuplicateOfferByUrl).mockResolvedValue(null);
  });

  it('crea un candidato con fuente, scout y URL original', async () => {
    const db = harness();
    const result = await submitAcquisitionCandidates({
      supabase: db as never,
      actorUserId: 'staff-1',
      sourceKey: 'human_scout',
      scoutId: 'scout-1',
      text: URL_A,
      externalRunId: 'run-chatgpt-1',
      discoveredAt: '2026-09-27T18:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.accepted).toBe(1);
    expect(result.submissionId).toBe('acq:human_scout:run-chatgpt-1');
    const row = db.rows[0];
    expect(row?.decision).toBe('NEEDS_REVIEW');
    expect(row?.inserted_offer_id).toBeNull();
    expect(row?.source_url).toBe(URL_A);
    const acquisition = (row?.evidence as { acquisition: Record<string, unknown> }).acquisition;
    expect(acquisition).toMatchObject({
      source_key: 'human_scout',
      scout_id: 'scout-1',
      submission_id: 'acq:human_scout:run-chatgpt-1',
      original_url: URL_A,
      actor_user_id: 'staff-1',
    });
  });

  it('el mismo envío de la misma URL es idempotente', async () => {
    const db = harness();
    const input = {
      supabase: db as never,
      actorUserId: 'staff-1',
      sourceKey: 'chatgpt_deal_hunter',
      text: URL_A,
      externalRunId: 'tarea-1',
    };
    const first = await submitAcquisitionCandidates(input);
    const second = await submitAcquisitionCandidates(input);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.accepted).toBe(1);
    expect(second.idempotent).toBe(1);
    expect(db.rows).toHaveLength(1);
  });

  it('un fallo a mitad conserva las URL ya guardadas', async () => {
    const db = harness({ failInsertAfter: 1 });
    const result = await submitAcquisitionCandidates({
      supabase: db as never,
      actorUserId: 'staff-1',
      sourceKey: 'chatgpt_deal_hunter',
      text: `${URL_A}\n${URL_B}`,
      externalRunId: 'tarea-parcial',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.accepted).toBe(1);
    expect(result.persistError).toMatch(/guardar/);
    expect(result.items.some((item) => item.outcome === 'persist_failed')).toBe(true);
    expect(db.rows).toHaveLength(1);
  });

  it('la misma URL desde dos fuentes conserva las dos atribuciones', async () => {
    const db = harness();
    const hunter = await submitAcquisitionCandidates({
      supabase: db as never,
      actorUserId: 'staff-1',
      sourceKey: 'chatgpt_deal_hunter',
      text: URL_A,
      externalRunId: 'tarea-a',
    });
    const everyday = await submitAcquisitionCandidates({
      supabase: db as never,
      actorUserId: 'staff-1',
      sourceKey: 'chatgpt_everyday',
      text: URL_A,
      externalRunId: 'tarea-b',
    });
    expect(hunter.ok && everyday.ok).toBe(true);
    expect(db.rows).toHaveLength(2);
    const sources = db.rows.map((row) => (row.evidence as { acquisition: { source_key: string } }).acquisition.source_key);
    expect(sources.sort()).toEqual(['chatgpt_deal_hunter', 'chatgpt_everyday']);
  });

  it('la misma identidad desde dos fuentes no borra el segundo candidato', async () => {
    const db = harness();
    await submitAcquisitionCandidates({
      supabase: db as never,
      actorUserId: 'staff-1',
      sourceKey: 'chatgpt_deal_hunter',
      text: URL_A,
      externalRunId: 'uno',
    });
    await submitAcquisitionCandidates({
      supabase: db as never,
      actorUserId: 'staff-1',
      sourceKey: 'admin_manual',
      text: URL_A_TRACKING,
      externalRunId: 'dos',
    });
    expect(db.rows).toHaveLength(2);
    const bridge = planHunterCandidateBridge({
      candidates: db.rows.map((row) => ({
        run_id: String(row.run_id),
        candidate_key: String(row.candidate_key),
        decision: String(row.decision),
        inserted_offer_id: null,
        source_url: String(row.source_url),
        canonical_url: String(row.canonical_url),
        affiliate_url: null,
        product_fingerprint: null,
        evidence: row.evidence,
      })),
      openItems: [{ identityKey: 'amz:B0TEST0001', status: 'INGESTED', evidence: {} }],
    });
    expect(bridge.accepted).toHaveLength(0);
    expect(bridge.skipped.every((skip) => skip.reason === 'open_identity')).toBe(true);
  });

  it('una oferta ya existente queda como duplicado y no como lista para publicar', async () => {
    vi.mocked(findDuplicateOfferByUrl).mockResolvedValue({
      id: 'offer-1',
      status: 'published',
      kind: 'live',
      ageHours: 2,
      price: 10,
    });
    const db = harness();
    const result = await submitAcquisitionCandidates({
      supabase: db as never,
      actorUserId: 'staff-1',
      sourceKey: 'admin_manual',
      text: URL_B,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.accepted).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(db.rows[0]?.decision).toBe('DUPLICATE');
    expect(db.rows[0]?.inserted_offer_id).toBeNull();
  });

  it('el puente conserva la atribución en el linaje del ítem', () => {
    const plan = planHunterCandidateBridge({
      candidates: [
        {
          run_id: 'acq:human_scout:run-1',
          candidate_key: 'cand-1',
          decision: 'NEEDS_REVIEW',
          inserted_offer_id: null,
          source_url: URL_A,
          canonical_url: URL_A,
          affiliate_url: null,
          product_fingerprint: 'amz:B0TEST0001',
          evidence: {
            acquisition: {
              source_key: 'human_scout',
              source_type: 'human',
              scout_id: 'scout-1',
              submission_id: 'acq:human_scout:run-1',
              external_run_id: 'run-1',
              original_url: URL_A,
              discovered_at: '2026-09-27T18:00:00.000Z',
              actor_user_id: 'staff-1',
            },
          },
        },
      ],
      openItems: [],
    });
    expect(plan.accepted[0]?.lineage.acquisition).toMatchObject({
      sourceKey: 'human_scout',
      scoutId: 'scout-1',
      actorUserId: 'staff-1',
      submissionId: 'acq:human_scout:run-1',
    });
  });
});

describe('avance al lote', () => {
  it('procesa como máximo tres chunks y no convierte un error en listo', async () => {
    const { advanceAcquisitionSubmission } = await import('@/lib/acquisition/advance');
    const advance = await advanceAcquisitionSubmission({
      supabase: {
        from() {
          return {
            update() {
              return { eq: () => ({ eq: async () => ({ error: null }) }) };
            },
          };
        },
      } as never,
      createdBy: 'staff-1',
      runId: 'acq:human_scout:run-1',
      maxChunks: 10,
      bridge: async () => ({
        ok: true,
        batch: { id: 'batch-1' } as never,
        inserted: 2,
        skipped: [],
        accepted: [],
      }),
      processChunk: async () => ({
        claimed: 1,
        processed: 1,
        remaining: 20,
        reclaimed: 0,
        batch: null,
        items: [{ status: 'ERROR' } as never, { status: 'NEEDS_REVIEW' } as never, { status: 'READY' } as never],
      }),
    });
    expect(advance.ok).toBe(true);
    expect(advance.chunks).toBe(3);
    expect(advance.remaining).toBe(20);
    expect(advance.errored).toBe(3);
    expect(advance.needsReview).toBe(3);
    expect(advance.ready).toBe(3);
    expect(advance.forwarded).toBe(2);
  });

  it('un lease vencido reaparece en el conteo y una pasada sin trabajo se detiene', async () => {
    const { advanceAcquisitionSubmission } = await import('@/lib/acquisition/advance');
    let calls = 0;
    const advance = await advanceAcquisitionSubmission({
      supabase: {
        from() {
          return {
            update() {
              return { eq: () => ({ eq: async () => ({ error: null }) }) };
            },
            select() {
              return { filter: () => ({ in: () => ({ limit: async () => ({ data: [{ batch_id: 'batch-open' }], error: null }) }) }) };
            },
          };
        },
      } as never,
      createdBy: 'staff-1',
      runId: 'acq:human_scout:run-1',
      bridge: async () => ({
        ok: true,
        batch: null,
        inserted: 0,
        skipped: [{ runId: 'acq:human_scout:run-1', candidateKey: 'c1', reason: 'open_identity' }],
        accepted: [],
      }),
      processChunk: async () => {
        calls += 1;
        return {
          claimed: 0,
          processed: 0,
          remaining: 1,
          reclaimed: calls === 1 ? 1 : 0,
          batch: null,
          items: [],
        };
      },
    });
    expect(advance.batchId).toBe('batch-open');
    expect(advance.reclaimed).toBe(1);
    expect(advance.chunks).toBe(2);
    expect(advance.skipped[0]?.reason).toBe('open_identity');
  });
});

describe('métricas y contratos', () => {
  it('calcula el embudo desde filas persistidas, sin score', () => {
    const rows = summarizeAcquisition({
      candidates: [
        {
          run_id: 'acq:human_scout:run-1',
          candidate_key: 'c1',
          decision: 'NEEDS_REVIEW',
          discovered_at: '2026-09-27T18:00:00.000Z',
          evidence: {
            acquisition: {
              source_key: 'human_scout',
              source_type: 'human',
              scout_id: 'scout-1',
              submission_id: 'acq:human_scout:run-1',
              external_run_id: null,
              original_url: URL_A,
              discovered_at: '2026-09-27T18:00:00.000Z',
            },
          },
        },
        {
          run_id: 'acq:human_scout:run-1',
          candidate_key: 'c2',
          decision: 'DUPLICATE',
          discovered_at: '2026-09-27T19:00:00.000Z',
          evidence: {
            acquisition: {
              source_key: 'human_scout',
              source_type: 'human',
              scout_id: 'scout-1',
              submission_id: 'acq:human_scout:run-1',
              external_run_id: null,
              original_url: URL_B,
              discovered_at: '2026-09-27T19:00:00.000Z',
            },
          },
        },
      ],
      items: [
        {
          status: 'READY',
          evidence: { hunter: { run_id: 'acq:human_scout:run-1', candidate_key: 'c1' } },
          created_at: '2026-09-27T18:00:05.000Z',
          processed_at: '2026-09-27T18:00:15.000Z',
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sourceKey: 'human_scout',
      scoutId: 'scout-1',
      day: '2026-09-27',
      candidatesFound: 2,
      candidatesAccepted: 1,
      candidatesDuplicate: 1,
      extractionReady: 1,
      approved: 0,
      pending: 0,
      published: 0,
      forwardedToBatch: 1,
      candidateToBatchMs: 5000,
      batchToExtractionMs: 10000,
    });
  });

  it('el recibo separa duplicadas del texto y ofertas ya existentes', () => {
    const receipt = acquisitionOperatorReceipt({
      received: 5,
      accepted: 1,
      duplicates: 2,
      invalid: 1,
      overCap: 0,
      idempotent: 1,
      forwarded: 1,
      items: [
        { outcome: 'accepted' },
        { outcome: 'duplicate' },
        { outcome: 'existing_offer' },
        { outcome: 'idempotent' },
        { outcome: 'invalid' },
      ],
    });
    expect(receipt).toEqual({
      received: 5,
      valid: 1,
      duplicates: 2,
      existing: 1,
      sentToReview: 1,
      rejected: 1,
    });
  });

  it('el intake no publica ni llama al writer de máquina', () => {
    const submit = readFileSync('lib/acquisition/submit.ts', 'utf8');
    const route = readFileSync('app/api/admin/acquisition/submit/route.ts', 'utf8');
    const intake = readFileSync('app/components/moderation/AcquisitionIntake.tsx', 'utf8');
    expect(submit).not.toMatch(/insertIngestedOffer\s*\(/);
    expect(submit).not.toContain('createCommunityOffer');
    expect(submit).not.toContain('extractOfferFromUrl');
    expect(route).toContain('requireBatchAuth');
    expect(route).toContain('advanceAcquisitionSubmission');
    expect(route).not.toContain('createServerClient');
    expect(route).not.toMatch(/insertIngestedOffer\s*\(/);
    expect(intake).not.toContain('/process');
    expect(intake).toContain('No se publica sola');
    expect(intake).toContain('Enviada no es aprobada ni publicada');
  });

  it('el pegado manual de lotes sigue fuera de esta capa', () => {
    const paste = readFileSync('app/api/admin/offer-batch/route.ts', 'utf8');
    expect(paste).toContain('createOfferBatch');
    expect(paste).not.toContain('submitAcquisitionCandidates');
  });
});
