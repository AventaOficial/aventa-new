/**
 * Regresión de los rechazos de moderación del 2026-10-07 (cliente MCP v2):
 * - 49 ofertas sin extracción llegaron a moderación con `/placeholder.png`.
 * - URLs caídas o inexistentes no se distinguían de un bloqueo anti-bot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ValidCandidate } from '@/lib/mcp/candidates';
import type { PreparedMachineCandidate } from '@/lib/offers/ingestion/prepareMachineCandidateOffer';
import {
  classifyHttpStatus,
  isHtmlContentType,
  pageFetchFailureClass,
  readHtmlCapped,
} from '@/lib/offers/offerExtraction/pageFetchFailure';

const events: Array<Record<string, unknown>> = [];
vi.mock('@/lib/offers/batch/service', () => ({
  appendBatchEvent: vi.fn(async (_s: unknown, e: Record<string, unknown>) => {
    events.push(e);
  }),
  recountBatch: vi.fn(async () => undefined),
}));
vi.mock('@/lib/affiliate', async () => {
  const actual = await vi.importActual<typeof import('@/lib/affiliate')>('@/lib/affiliate');
  return { ...actual, resolveAndNormalizeAffiliateOfferUrl: async (url: string) => url.trim() };
});

const { enqueueHunterOffer } = await import('@/lib/offers/ingestion/enqueueHunterOffer');
const { prepareMachineCandidateOffer, machineOfferReadyForModeration } = await import(
  '@/lib/offers/ingestion/prepareMachineCandidateOffer'
);
const { extractOfferFromUrl } = await import('@/lib/offers/offerExtraction/extractOfferFromUrl');
const { ingestOfferObservation } = await import('@/lib/offers/ingestion/ingestOfferObservation');

const SORIANA = 'https://www.soriana.com/cereal-kelloggs-zucaritas-600-g/11669769.html';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clasificación de fallos de la página de producto', () => {
  it('404 y 410 son permanentes; 429, 5xx y timeout transitorios; 401/403 bloqueo', () => {
    expect(classifyHttpStatus(200)).toBeNull();
    expect(pageFetchFailureClass(classifyHttpStatus(404))).toBe('permanent');
    expect(pageFetchFailureClass(classifyHttpStatus(410))).toBe('permanent');
    expect(pageFetchFailureClass(classifyHttpStatus(429))).toBe('transient');
    expect(pageFetchFailureClass(classifyHttpStatus(500))).toBe('transient');
    expect(pageFetchFailureClass(classifyHttpStatus(503))).toBe('transient');
    expect(pageFetchFailureClass('TIMEOUT')).toBe('transient');
    expect(pageFetchFailureClass(classifyHttpStatus(403))).toBe('blocked');
    expect(pageFetchFailureClass(classifyHttpStatus(401))).toBe('blocked');
    expect(pageFetchFailureClass(null)).toBeNull();
  });

  it('solo acepta cuerpos HTML/XML; sin content-type se intenta', () => {
    expect(isHtmlContentType('text/html; charset=utf-8')).toBe(true);
    expect(isHtmlContentType('application/xhtml+xml')).toBe(true);
    expect(isHtmlContentType(null)).toBe(true);
    expect(isHtmlContentType('image/jpeg')).toBe(false);
    expect(isHtmlContentType('application/pdf')).toBe(false);
    expect(isHtmlContentType('application/octet-stream')).toBe(false);
  });

  it('corta cuerpos que exceden el límite, declarado o real', async () => {
    const declared = new Response('x', { headers: { 'content-type': 'text/html', 'content-length': '999999999' } });
    expect(await readHtmlCapped(declared, 1024)).toEqual({ ok: false, failure: 'TOO_LARGE' });
    const streamed = new Response('y'.repeat(4096), { headers: { 'content-type': 'text/html' } });
    expect(await readHtmlCapped(streamed, 1024)).toEqual({ ok: false, failure: 'TOO_LARGE' });
    const binary = new Response('GIF89a', { headers: { 'content-type': 'image/gif' } });
    expect(await readHtmlCapped(binary)).toEqual({ ok: false, failure: 'NOT_HTML' });
    const ok = new Response('<html>ok</html>', { headers: { 'content-type': 'text/html' } });
    expect(await readHtmlCapped(ok)).toEqual({ ok: true, html: '<html>ok</html>' });
  });
});

describe('el extractor expone el fallo HTTP real', () => {
  const html = (status: number, type = 'text/html') =>
    vi.fn(async () => new Response('no', { status, headers: { 'content-type': type } }));

  it.each([
    [404, 'NOT_FOUND'],
    [410, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
    [503, 'UPSTREAM_UNAVAILABLE'],
    [403, 'BLOCKED'],
  ])('HTTP %i → %s', async (status, failure) => {
    vi.stubGlobal('fetch', html(status));
    const outcome = await extractOfferFromUrl(SORIANA);
    expect(outcome.body.title).toBeNull();
    expect(outcome.body.diagnostics?.pageFetchFailure).toBe(failure);
    expect(outcome.body.diagnostics?.pageHttpStatus).toBe(status);
    // `accessFailure` conserva su contrato previo.
    expect(outcome.body.diagnostics?.accessFailure).toBe('ACCESS_BLOCKED');
  });

  it('una respuesta que no es HTML no se parsea', async () => {
    vi.stubGlobal('fetch', html(200, 'image/jpeg'));
    const outcome = await extractOfferFromUrl(SORIANA);
    expect(outcome.body.diagnostics?.pageFetchFailure).toBe('NOT_HTML');
  });

  it('error de red sin respuesta es transitorio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const outcome = await extractOfferFromUrl(SORIANA);
    expect(pageFetchFailureClass(outcome.body.diagnostics?.pageFetchFailure)).toBe('transient');
  });

  it('una redirección a un host fuera de la allowlist no se sigue (SSRF)', async () => {
    const fetchSpy = vi.fn(async () => new Response('', { status: 302, headers: { location: 'http://169.254.169.254/latest' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const outcome = await extractOfferFromUrl(SORIANA);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(outcome.body.diagnostics?.pageFetchFailure).toBe('BLOCKED');
  });

  it('la clasificación llega a prepareMachineCandidateOffer', async () => {
    vi.stubGlobal('fetch', html(404));
    const prepared = await prepareMachineCandidateOffer(SORIANA);
    expect(prepared).toMatchObject({ pageFetchFailure: 'NOT_FOUND', pageFetchFailureClass: 'permanent', pageHttpStatus: 404 });
    expect(machineOfferReadyForModeration(prepared)).toBe(false);
  });
});

function prepared(over: Partial<PreparedMachineCandidate> = {}): PreparedMachineCandidate {
  return {
    pageKind: 'PRODUCT',
    product: true,
    title: 'Cereal Zucaritas 600 g',
    imageUrl: 'https://www.soriana.com/on/demandware.static/zucaritas.jpg',
    imageUrls: [],
    store: 'Soriana',
    price: 79,
    originalPrice: null,
    priceSource: 'retail_html',
    originalPriceSource: null,
    category: 'Despensa',
    currency: 'MXN',
    retailer: 'soriana',
    imageFailure: null,
    fetched: true,
    pageFetchFailure: null,
    pageFetchFailureClass: null,
    pageHttpStatus: null,
    ...over,
  };
}

const unavailable = (over: Partial<PreparedMachineCandidate>) =>
  prepared({ title: null, imageUrl: null, price: null, priceSource: null, imageFailure: 'IMAGE_BLOCKED', ...over });

function fakeSupabase() {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const supabase = {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          updates.push({ table, values });
          const chain = { eq: () => chain };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { supabase, updates };
}

const candidate = { index: 0, url: SORIANA, identityKey: 'soriana', title: 'Zucaritas', price: 79, originalPrice: null, note: null } as ValidCandidate;
const params = { batchId: 'b1', createdBy: 'bot', machineClientId: 'mc1', candidate };
const clean = async () => ({ suppressed: false, reason: null, fingerprint: null });

describe('enqueueHunterOffer no gasta moderación en candidatos inválidos', () => {
  beforeEach(() => {
    events.length = 0;
  });

  it('página inexistente (404): rechazo permanente, sin oferta', async () => {
    const { supabase, updates } = fakeSupabase();
    const ingest = vi.fn();
    const r = await enqueueHunterOffer(supabase, params, {
      negativeMemory: clean,
      prepare: async () => unavailable({ pageFetchFailure: 'NOT_FOUND', pageFetchFailureClass: 'permanent', pageHttpStatus: 404 }),
      ingest,
    });
    expect(r.offerId).toBeNull();
    expect(ingest).not.toHaveBeenCalled();
    expect(updates.filter((u) => u.table === 'offers')).toHaveLength(0);
    expect(updates[0]!.values).toMatchObject({
      status: 'REJECTED',
      error_code: 'PRODUCT_PAGE_UNAVAILABLE',
      rejection_reason: 'page_fetch:permanent:NOT_FOUND',
      evidence: { page_fetch: { class: 'permanent', failure: 'NOT_FOUND', http_status: 404 } },
    });
    expect(events[0]).toMatchObject({ action: 'page_fetch_failed', toStatus: 'REJECTED' });
  });

  it.each([
    ['RATE_LIMITED', 429],
    ['UPSTREAM_UNAVAILABLE', 503],
    ['TIMEOUT', null],
  ] as const)('caída temporal (%s): libera la identidad con código reintentable', async (failure, status) => {
    const { supabase, updates } = fakeSupabase();
    const ingest = vi.fn();
    await enqueueHunterOffer(supabase, params, {
      negativeMemory: clean,
      prepare: async () => unavailable({ pageFetchFailure: failure, pageFetchFailureClass: 'transient', pageHttpStatus: status }),
      ingest,
    });
    expect(ingest).not.toHaveBeenCalled();
    expect(updates[0]!.values).toMatchObject({ status: 'REJECTED', error_code: 'SOURCE_TEMPORARILY_UNAVAILABLE' });
  });

  it('bloqueo anti-bot: queda para revisión humana, no se descarta', async () => {
    const { supabase, updates } = fakeSupabase();
    const ingest = vi.fn();
    await enqueueHunterOffer(supabase, params, {
      negativeMemory: clean,
      prepare: async () => unavailable({ pageFetchFailure: 'BLOCKED', pageFetchFailureClass: 'blocked', pageHttpStatus: 403 }),
      ingest,
    });
    expect(ingest).not.toHaveBeenCalled();
    expect(updates[0]!.values).toMatchObject({ status: 'NEEDS_REVIEW', error_code: 'IMAGE_BLOCKED' });
  });

  it('causa 1 (2026-10-07): sin extracción ni imagen no crea oferta pending', async () => {
    const { supabase, updates } = fakeSupabase();
    const ingest = vi.fn();
    await enqueueHunterOffer(supabase, params, {
      negativeMemory: clean,
      prepare: async () => prepared({ imageUrl: null, imageFailure: 'IMAGE_NOT_FOUND' }),
      ingest,
    });
    expect(ingest).not.toHaveBeenCalled();
    expect(updates[0]!.values).toMatchObject({ status: 'NEEDS_REVIEW', error_code: 'IMAGE_NOT_FOUND' });
  });

  it('el escritor recibe la exigencia de imagen real', async () => {
    const { supabase } = fakeSupabase();
    const ingest = vi.fn(async () => ({ ok: true as const, offerId: 'o1' }));
    await enqueueHunterOffer(supabase, params, { negativeMemory: clean, prepare: async () => prepared(), ingest: ingest as never, lowQualityTitle: () => false });
    const call = (ingest.mock.calls[0] as unknown as [unknown, { requireProductImage?: boolean }])[1];
    expect(call.requireProductImage).toBe(true);
  });
});

describe('escritor único: imagen obligatoria para fuentes de máquina', () => {
  const untouchedDb = () => {
    const from = vi.fn(() => {
      throw new Error('no debe tocar la base');
    });
    return { supabase: { from } as unknown as SupabaseClient, from };
  };
  const body = (image?: string) => ({
    title: 'Cereal Zucaritas 600 g',
    store: 'Soriana',
    price: 79,
    offer_url: SORIANA,
    description: 'Cereal de maíz azucarado, caja de 600 g.',
    ...(image ? { image_url: image } : {}),
  });

  it.each([
    ['placeholder', '/placeholder.png'],
    ['sin imagen', undefined],
    ['http plano', 'http://cdn.example.com/a.jpg'],
    ['logo', 'https://www.soriana.com/static/logo.png'],
  ])('%s → 400 IMAGE_REQUIRED sin escribir', async (_label, image) => {
    const { supabase, from } = untouchedDb();
    const result = await ingestOfferObservation(supabase, {
      createdBy: 'bot',
      source: 'mcp:hunter',
      requireProductImage: true,
      body: body(image),
    });
    expect(result).toMatchObject({ ok: false, httpStatus: 400, issues: [{ path: 'image_url', message: 'IMAGE_REQUIRED' }] });
    expect(from).not.toHaveBeenCalled();
  });

  it('con imagen válida pasa la compuerta y llega a la base', async () => {
    const insertError = { code: 'XX000', message: 'fake' };
    const chain: Record<string, unknown> = {};
    for (const m of ['insert', 'select', 'eq', 'in', 'is', 'limit', 'order']) chain[m] = () => chain;
    chain.single = async () => ({ data: null, error: insertError });
    chain.maybeSingle = async () => ({ data: null, error: insertError });
    const from = vi.fn(() => chain);
    const result = await ingestOfferObservation({ from } as unknown as SupabaseClient, {
      createdBy: 'bot',
      source: 'mcp:hunter',
      requireProductImage: true,
      body: body('https://www.soriana.com/on/demandware.static/zucaritas.jpg'),
    });
    expect(from).toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, httpStatus: 500 });
  });

  it('sin la exigencia (comunidad/admin) el placeholder sigue permitido', async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['insert', 'select', 'eq', 'in', 'is', 'limit', 'order']) chain[m] = () => chain;
    chain.single = async () => ({ data: null, error: { code: 'XX000', message: 'fake' } });
    const from = vi.fn(() => chain);
    await ingestOfferObservation({ from } as unknown as SupabaseClient, {
      createdBy: 'user',
      source: 'community:batch',
      body: body('/placeholder.png'),
    });
    expect(from).toHaveBeenCalled();
  });
});

describe('bot de ingesta', () => {
  it('no envía placeholder y exige imagen al escritor', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('lib/bots/ingest/insertIngestedOffer.ts', 'utf8');
    expect(src).toContain('requireProductImage: true');
    expect(src).not.toContain("|| '/placeholder.png'");
  });
});