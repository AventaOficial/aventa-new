import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_ACQUISITION_ITEM_STATUSES } from '@/lib/offers/batch/contract';
import { createOfferBatch, processBatchItem } from '@/lib/offers/batch/service';
import { extractOfferFromUrl } from '@/lib/offers/offerExtraction/extractOfferFromUrl';
import {
  bridgeHunterCandidatesToBatch,
  planHunterCandidateBridge,
  type HunterBridgeCandidate,
} from '@/lib/offers/batch/hunterBridge';
import { communityPersistStatus } from '@/lib/hunter/supply/communityPipeline';
import { findDuplicateOfferByUrl } from '@/lib/offers/findDuplicateOffer';

vi.mock('@/lib/offers/findDuplicateOffer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/offers/findDuplicateOffer')>();
  return {
    ...actual,
    findDuplicateOfferByUrl: vi.fn(async () => null),
  };
});

vi.mock('@/lib/offers/offerExtraction/extractOfferFromUrl', () => ({
  extractOfferFromUrl: vi.fn(),
}));

const URL_A = 'https://www.amazon.com.mx/dp/B0TEST0001';
const URL_B = 'https://www.amazon.com.mx/dp/B0TEST0002';

function candidate(overrides: Partial<HunterBridgeCandidate> = {}): HunterBridgeCandidate {
  return {
    run_id: 'run-1',
    candidate_key: 'cand-1',
    decision: 'WOULD_INSERT',
    inserted_offer_id: null,
    source_url: URL_A,
    canonical_url: 'https://www.amazon.com.mx/dp/B0TEST0001',
    affiliate_url: 'https://www.amazon.com.mx/dp/B0TEST0001?tag=aventa-20',
    product_fingerprint: 'amz:B0TEST0001',
    ...overrides,
  };
}

describe('planHunterCandidateBridge', () => {
  it('WOULD_INSERT crea el ítem', () => {
    const plan = planHunterCandidateBridge({ candidates: [candidate()], openItems: [] });
    expect(plan.accepted).toHaveLength(1);
    expect(plan.accepted[0]?.url).toBe(URL_A);
    expect(plan.skipped).toHaveLength(0);
  });

  it('NEEDS_REVIEW crea el ítem', () => {
    const plan = planHunterCandidateBridge({
      candidates: [candidate({ decision: 'NEEDS_REVIEW', candidate_key: 'cand-review' })],
      openItems: [],
    });
    expect(plan.accepted).toHaveLength(1);
    expect(plan.skipped).toHaveLength(0);
  });

  it.each(['REJECTED_QUALITY', 'DUPLICATE', 'INSERTED_PENDING', 'PUBLISHED'])(
    '%s no crea',
    (decision) => {
      const plan = planHunterCandidateBridge({
        candidates: [candidate({ decision })],
        openItems: [],
      });
      expect(plan.accepted).toHaveLength(0);
      expect(plan.skipped[0]?.reason).toBe('not_eligible');
    },
  );

  it('inserted_offer_id existente no crea', () => {
    const plan = planHunterCandidateBridge({
      candidates: [candidate({ inserted_offer_id: 'offer-1' })],
      openItems: [],
    });
    expect(plan.accepted).toHaveLength(0);
    expect(plan.skipped[0]?.reason).toBe('already_inserted_offer');
  });

  it('el mismo (run_id, candidate_key) en un lote abierto no se repite', () => {
    const plan = planHunterCandidateBridge({
      candidates: [candidate()],
      openItems: [
        {
          identityKey: 'amz:OTRO',
          status: 'READY',
          evidence: { hunter: { run_id: 'run-1', candidate_key: 'cand-1', source_url: URL_B } },
        },
      ],
    });
    expect(plan.accepted).toHaveLength(0);
    expect(plan.skipped[0]?.reason).toBe('already_sent');
  });

  it('la misma identidad de producto en un lote abierto no se duplica', () => {
    const plan = planHunterCandidateBridge({
      candidates: [candidate({ candidate_key: 'cand-nuevo', run_id: 'run-2' })],
      openItems: [{ identityKey: 'amz:B0TEST0001', status: 'INGESTED', evidence: {} }],
    });
    expect(plan.accepted).toHaveLength(0);
    expect(plan.skipped[0]?.reason).toBe('open_identity');
  });

  it('conserva run_id, candidate_key y source_url en el linaje', () => {
    const plan = planHunterCandidateBridge({ candidates: [candidate()], openItems: [] });
    expect(plan.accepted[0]?.lineage).toMatchObject({
      runId: 'run-1',
      candidateKey: 'cand-1',
      sourceUrl: URL_A,
      productFingerprint: 'amz:B0TEST0001',
      canonicalUrl: 'https://www.amazon.com.mx/dp/B0TEST0001',
      affiliateUrl: 'https://www.amazon.com.mx/dp/B0TEST0001?tag=aventa-20',
    });
  });

  it('un ítem publicado o rechazado no cuenta como trabajo abierto', () => {
    const plan = planHunterCandidateBridge({
      candidates: [candidate()],
      openItems: [
        {
          identityKey: 'amz:B0TEST0001',
          status: 'PUBLISHED',
          evidence: { hunter: { run_id: 'run-1', candidate_key: 'cand-1' } },
        },
        {
          identityKey: 'amz:B0TEST0001',
          status: 'REJECTED',
          evidence: { hunter: { run_id: 'run-1', candidate_key: 'cand-1' } },
        },
      ],
    });
    expect(plan.accepted).toHaveLength(1);
  });
});

type InsertCall = { table: string; rows: unknown[] };

function recordingClient(options?: {
  candidates?: HunterBridgeCandidate[];
  openBatches?: Array<{ id: string }>;
  openItems?: Array<{ identity_key: string; status: string; evidence: unknown }>;
  /** Simula offer_batch_items_open_identity_uidx compartido entre clientes. */
  claims?: Map<string, string>;
  hardFailIdentity?: string;
}) {
  const inserts: InsertCall[] = [];
  const deletes: string[] = [];
  const batchRow = {
    id: 'batch-1',
    status: 'draft',
    name: null,
    created_by: 'staff-1',
    total_items: 0,
    pending_items: 0,
    ready_items: 0,
    review_items: 0,
    error_items: 0,
    approved_items: 0,
    published_items: 0,
    rejected_items: 0,
    duplicate_items: 0,
    meta: {},
  };

  function from(table: string) {
    let mode = 'select';
    let payload: unknown;
    let violation = false;
    const api = {
      select() {
        return api;
      },
      insert(row: unknown) {
        mode = 'insert';
        payload = row;
        const rows = Array.isArray(row) ? row : [row];
        const hardFail = table === 'offer_batch_items' && rows.some((one) => (
          String((one as { identity_key?: string }).identity_key ?? '') === options?.hardFailIdentity
        ));
        if (table === 'offer_batch_items' && options?.claims) {
          for (const one of rows) {
            const key = String((one as { identity_key?: string }).identity_key ?? '');
            const status = String((one as { status?: string }).status ?? '');
            const held = options.claims.get(key);
            const heldOpen = held ? OPEN_ACQUISITION_ITEM_STATUSES.includes(held as (typeof OPEN_ACQUISITION_ITEM_STATUSES)[number]) : false;
            const nextOpen = OPEN_ACQUISITION_ITEM_STATUSES.includes(status as (typeof OPEN_ACQUISITION_ITEM_STATUSES)[number]);
            if (heldOpen && nextOpen) violation = true;
          }
        }
        if (!violation && !hardFail) {
          inserts.push({ table, rows });
          if (table === 'offer_batch_items' && options?.claims) {
            for (const one of rows) {
              const key = String((one as { identity_key?: string }).identity_key ?? '');
              const status = String((one as { status?: string }).status ?? '');
              if (key) options.claims.set(key, status);
            }
          }
        }
        return api;
      },
      update() {
        mode = 'update';
        return api;
      },
      delete() {
        deletes.push(table);
        mode = 'delete';
        return api;
      },
      in() {
        return api;
      },
      is() {
        return api;
      },
      neq() {
        return api;
      },
      eq() {
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      single() {
        return finish('one');
      },
      maybeSingle() {
        return finish('one');
      },
      then(onFulfilled: (value: { data: unknown; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        return finish('many').then(onFulfilled, onRejected);
      },
    };

    function finish(kind: 'one' | 'many') {
      const hardFail = mode === 'insert'
        && table === 'offer_batch_items'
        && (Array.isArray(payload) ? payload : [payload]).some((one) => (
          String((one as { identity_key?: string } | null)?.identity_key ?? '') === options?.hardFailIdentity
        ));
      if (hardFail) {
        return Promise.resolve({ data: null, error: { code: 'XX000', message: 'connection reset' } });
      }
      if (violation) {
        return Promise.resolve({
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint "offer_batch_items_open_identity_uidx"',
          },
        });
      }
      if (mode === 'insert' && table === 'offer_batches') {
        return Promise.resolve({ data: { ...batchRow, ...(payload as object) }, error: null as null });
      }
      if (mode === 'update' && table === 'offer_batches') {
        return Promise.resolve({ data: batchRow, error: null as null });
      }
      if (mode === 'select' && table === 'hunter_offer_candidates') {
        return Promise.resolve({ data: options?.candidates ?? [], error: null as null });
      }
      if (mode === 'select' && table === 'offer_batches') {
        return Promise.resolve({
          data: kind === 'one' ? batchRow : (options?.openBatches ?? []),
          error: null as null,
        });
      }
      if (mode === 'select' && table === 'offer_batch_items') {
        const rows = options?.openItems ?? [{ status: 'INGESTED', duplicate_status: null }];
        return Promise.resolve({ data: kind === 'one' ? rows[0] ?? null : rows, error: null as null });
      }
      return Promise.resolve({ data: null, error: null as null });
    }

    return api;
  }

  return { from, inserts, deletes, batchRow };
}

describe('createOfferBatch lineage', () => {
  it('guarda el linaje en evidence y deja el ítem INGESTED', async () => {
    const client = recordingClient();
    const result = await createOfferBatch({
      supabase: client as never,
      createdBy: 'staff-1',
      text: URL_A,
      lineageByIdentityKey: {
        'amz:B0TEST0001': {
          runId: 'run-1',
          candidateKey: 'cand-1',
          sourceUrl: URL_A,
          productFingerprint: 'amz:B0TEST0001',
          canonicalUrl: URL_A,
          affiliateUrl: `${URL_A}?tag=aventa-20`,
        },
      },
    });
    expect(result.ok).toBe(true);
    const items = client.inserts.filter((call) => call.table === 'offer_batch_items').flatMap((call) => call.rows);
    const row = items[0] as { status: string; evidence: { hunter: Record<string, string> } };
    expect(row.status).toBe('INGESTED');
    expect(row.evidence.hunter).toMatchObject({
      run_id: 'run-1',
      candidate_key: 'cand-1',
      source_url: URL_A,
    });
  });

  it('el pegado manual sigue creando el lote sin linaje de Hunter', async () => {
    const client = recordingClient();
    const result = await createOfferBatch({
      supabase: client as never,
      createdBy: 'staff-1',
      text: `${URL_A}\n${URL_B}`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inserted).toBe(2);
    expect(result.openConflicts).toBe(0);
    const items = client.inserts.filter((call) => call.table === 'offer_batch_items').flatMap((call) => call.rows);
    expect(items).toHaveLength(2);
    for (const row of items) {
      expect(row).not.toHaveProperty('evidence');
      expect((row as { status: string }).status).toBe('INGESTED');
    }
  });

  it('un fallo al guardar una URL no borra las ya insertadas', async () => {
    const client = recordingClient({ hardFailIdentity: 'amz:B0TEST0002' });
    const result = await createOfferBatch({
      supabase: client as never,
      createdBy: 'staff-1',
      text: `${URL_A}\n${URL_B}`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inserted).toBe(1);
    expect(result.batch?.id).toBe('batch-1');
    expect(client.deletes).not.toContain('offer_batches');
  });
});

describe('identidad abierta', () => {
  it('dos creaciones concurrentes dejan un solo ítem', async () => {
    const claims = new Map<string, string>();
    const [left, right] = await Promise.all([
      createOfferBatch({ supabase: recordingClient({ claims }) as never, createdBy: 'staff-1', text: URL_A }),
      createOfferBatch({ supabase: recordingClient({ claims }) as never, createdBy: 'staff-2', text: URL_A }),
    ]);
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect([left.inserted, right.inserted].sort()).toEqual([0, 1]);
    expect(left.openConflicts + right.openConflicts).toBe(1);
    const survivor = left.inserted === 1 ? left : right;
    expect(survivor.batch).not.toBeNull();
    const loser = left.inserted === 0 ? left : right;
    expect(loser.batch).toBeNull();
    expect(loser.conflictIdentityKeys).toEqual(['amz:B0TEST0001']);
  });

  it('un ítem REJECTED no bloquea el reintento', async () => {
    const claims = new Map<string, string>([['amz:B0TEST0001', 'REJECTED']]);
    const result = await createOfferBatch({
      supabase: recordingClient({ claims }) as never,
      createdBy: 'staff-1',
      text: URL_A,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inserted).toBe(1);
    expect(result.openConflicts).toBe(0);
  });

  it('el índice parcial cubre el trabajo abierto y libera publicado y rechazado', () => {
    const sql = readFileSync('docs/supabase-migrations/20260927_offer_batch_open_identity.sql', 'utf8');
    expect(sql).toContain('offer_batch_items_open_identity_uidx');
    expect(sql).toContain('UNIQUE INDEX');
    for (const status of OPEN_ACQUISITION_ITEM_STATUSES) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).not.toContain("'PUBLISHED'");
    expect(sql).not.toContain("'REJECTED'");
  });
});

describe('bridgeHunterCandidatesToBatch', () => {
  beforeEach(() => {
    vi.mocked(findDuplicateOfferByUrl).mockReset();
    vi.mocked(findDuplicateOfferByUrl).mockResolvedValue(null);
  });

  it('una oferta ya existente no se duplica', async () => {
    vi.mocked(findDuplicateOfferByUrl).mockResolvedValue({
      id: 'offer-live',
      status: 'published',
      kind: 'live',
      ageHours: 1,
      price: 99,
    });
    const client = recordingClient({
      candidates: [candidate()],
      openBatches: [],
    });
    const result = await bridgeHunterCandidatesToBatch({
      supabase: client as never,
      createdBy: 'staff-1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inserted).toBe(0);
    expect(result.skipped.some((skip) => skip.reason === 'existing_offer')).toBe(true);
    expect(client.inserts.some((call) => call.table === 'offer_batches')).toBe(false);
  });

  it('envía el candidato elegible a createOfferBatch con el actor staff', async () => {
    const client = recordingClient({
      candidates: [candidate()],
      openBatches: [],
    });
    const result = await bridgeHunterCandidatesToBatch({
      supabase: client as never,
      createdBy: 'staff-1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inserted).toBe(1);
    const batch = client.inserts.find((call) => call.table === 'offer_batches');
    expect(batch?.rows[0]).toMatchObject({ created_by: 'staff-1' });
  });
});

describe('fallo de duplicado durante la extracción', () => {
  it('no deja el ítem listo si no se pudo comprobar la oferta existente', async () => {
    vi.mocked(findDuplicateOfferByUrl).mockRejectedValueOnce(new Error('db down'));
    vi.mocked(extractOfferFromUrl).mockResolvedValueOnce({
      ok: true,
      body: {
        extraction_status: 'ok',
        title: 'Audífonos',
        images: ['https://img.example/a.jpg', 'https://img.example/b.jpg'],
        suggested_discount_price: 100,
        suggested_original_price: 150,
        store: 'Amazon',
        diagnostics: { offerResolvedConfidence: 'high', htmlFetched: true },
        reason: null,
        missing: [],
      },
      core: {
        provider: 'amazon',
        canonicalUrl: URL_A,
        normalizedUrl: URL_A,
        outboundUrl: URL_A,
        media: { images: ['https://img.example/a.jpg', 'https://img.example/b.jpg'] },
        product: { title: 'Audífonos' },
        pricing: { currentPrice: 100, originalPrice: 150, priceSource: 'page' },
        identity: { productFingerprint: 'amz:B0TEST0001', productIdentity: 'amz:B0TEST0001' },
        diagnostics: {},
        extraction: { warnings: [] },
        merchant: { seller: null },
        availability: { status: null },
      },
      adapter: {
        provider: 'amazon',
        productFingerprint: 'amz:B0TEST0001',
        blockedByHostPolicy: false,
        canonicalUrl: URL_A,
        normalizedUrl: URL_A,
      },
    } as never);
    let patch: Record<string, unknown> | null = null;
    const supabase = {
      from() {
        return {
          update(next: Record<string, unknown>) {
            patch = next;
            return this;
          },
          eq() {
            return this;
          },
          select() {
            return this;
          },
          insert() {
            return Promise.resolve({ error: null });
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };
    const result = await processBatchItem(supabase as never, {
      id: 'item-1',
      batch_id: 'batch-1',
      status: 'PROCESSING',
      source_url: URL_A,
      attempts: 0,
      hint_price: null,
      hint_original_price: null,
      store: 'Amazon',
      evidence: { hunter: { run_id: 'acq:human_scout:run-1', candidate_key: 'cand-1' } },
      images: [],
    } as never, 'staff-1');
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(patch?.status).toBe('NEEDS_REVIEW');
    expect(patch?.warnings).toContain('DUPLICATE_LOOKUP_FAILED');
    expect((patch?.evidence as { hunter?: { run_id?: string } }).hunter?.run_id).toBe('acq:human_scout:run-1');
  });
});

describe('contratos que el puente no puede romper', () => {
  const bridge = readFileSync('lib/offers/batch/hunterBridge.ts', 'utf8');
  const route = readFileSync('app/api/admin/offer-batch/from-hunter/route.ts', 'utf8');
  const actionBar = readFileSync('app/components/ActionBar.tsx', 'utf8');
  const publicParse = readFileSync('app/api/parse-offer-url/route.ts', 'utf8');

  it('el ítem se procesa con el chunk existente, no con otro extractor', () => {
    expect(route).toContain('processOfferBatchChunk');
    expect(bridge).not.toContain('extractOfferFromUrl');
    expect(bridge).not.toMatch(/insertIngestedOffer\s*\(/);
  });

  it('aprobar sigue persistiendo pending', () => {
    expect(communityPersistStatus({} as never)).toBe('pending');
    expect(bridge).not.toContain('createCommunityOffer');
    expect(bridge).not.toContain('approveOfferBatchItem');
  });

  it('ningún camino del puente llama insertIngestedOffer', () => {
    expect(bridge).not.toMatch(/insertIngestedOffer\s*\(/);
    expect(route).not.toMatch(/insertIngestedOffer\s*\(/);
  });

  it('el formulario público y el parse público no dependen del lote ni del puente', () => {
    expect(actionBar).not.toContain('offer-batch');
    expect(actionBar).not.toContain('hunterBridge');
    expect(publicParse).not.toContain('offer-batch');
    expect(publicParse).not.toContain('hunterBridge');
  });

  it('el endpoint exige el actor de moderación', () => {
    expect(route).toContain('requireBatchAuth');
    expect(route).not.toContain('createServerClient');
  });

  it('from-hunter exige el run y no abre el ledger histórico', () => {
    expect(route).toContain('Indica el run que quieres procesar.');
    expect(route).toContain('runId,');
  });
});
