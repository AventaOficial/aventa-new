import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { canonicalSubmissionHash, validateCandidates, type ValidCandidate } from '@/lib/mcp/candidates';
import { CANDIDATE_REJECTION_CODES, MCP_HUNTER_COMMENT_MAX } from '@/lib/mcp/contract';
import { OFFER_HUNTER_COMMENT_MAX } from '@/lib/contracts/offers';
import { compareWithListPrice } from '@/lib/offers/listPriceComparison';
import { parseHunterCommentReview, reviewHunterComment } from '@/lib/offers/hunterCommentReview';
import type { PreparedMachineCandidate } from '@/lib/offers/ingestion/prepareMachineCandidateOffer';

vi.mock('@/lib/offers/batch/service', () => ({
  appendBatchEvent: vi.fn(async () => undefined),
  recountBatch: vi.fn(async () => undefined),
}));

const { enqueueHunterOffer } = await import('@/lib/offers/ingestion/enqueueHunterOffer');
const { default: FocusHunterComment } = await import('@/app/components/moderation/FocusHunterComment');

const NOW = new Date('2026-10-12T18:00:00Z');
const AMAZON = 'https://www.amazon.com.mx/dp/B0TESTASI1';

function raw(over: Record<string, unknown> = {}) {
  return {
    url: AMAZON,
    title: 'Arroz Verde Valle Super Extra 1 kg',
    price: 42,
    currency: 'MXN',
    observedAt: '2026-10-12T17:00:00Z',
    ...over,
  };
}

describe('contrato MCP: hunterComment', () => {
  it('es opcional: un cliente que no lo envía sigue válido', () => {
    const r = validateCandidates([raw()], NOW);
    expect(r.rejected).toEqual([]);
    expect(r.valid[0].hunterComment).toBeNull();
  });

  it('vacío o solo espacios cuenta como ausente', () => {
    expect(validateCandidates([raw({ hunterComment: '   ' })], NOW).valid[0].hunterComment).toBeNull();
    expect(validateCandidates([raw({ hunterComment: null })], NOW).valid[0].hunterComment).toBeNull();
  });

  it('normaliza espacios y conserva el texto', () => {
    const r = validateCandidates([raw({ hunterComment: '  Bolsa de 1 kg   a $42 en Amazon.  ' })], NOW);
    expect(r.valid[0].hunterComment).toBe('Bolsa de 1 kg a $42 en Amazon.');
  });

  it('formato inválido se rechaza por índice con INVALID_HUNTER_COMMENT', () => {
    const cases = [
      { hunterComment: 'x'.repeat(MCP_HUNTER_COMMENT_MAX + 1) },
      { hunterComment: '<b>oferta</b>' },
      { hunterComment: 'linea\u0007' },
      { hunterComment: 42 },
    ];
    const r = validateCandidates(cases.map((c) => raw(c)), NOW);
    expect(r.valid).toEqual([]);
    expect(r.rejected.every((x) => x.code === 'INVALID_HUNTER_COMMENT')).toBe(true);
  });

  it('el tope coincide con la columna pública y el código es aditivo', () => {
    expect(MCP_HUNTER_COMMENT_MAX).toBe(OFFER_HUNTER_COMMENT_MAX);
    expect(CANDIDATE_REJECTION_CODES).toContain('INVALID_NOTE');
    expect(CANDIDATE_REJECTION_CODES).toContain('INVALID_HUNTER_COMMENT');
  });

  it('el hash de idempotencia de payloads sin el campo no cambia', () => {
    const base = { runId: 'r1', candidates: [raw()] };
    expect(canonicalSubmissionHash(base)).toBe(canonicalSubmissionHash({ runId: 'r1', candidates: [raw({ hunterComment: undefined })] }));
  });
});

describe('filtro editorial del comentario', () => {
  const title = 'Arroz Verde Valle Super Extra 1 kg';
  const noDiscount = { title, comparison: null };
  const withList = { title, comparison: compareWithListPrice(42, 60) };

  it('sin comentario: ausente, sin inventar nada', () => {
    expect(reviewHunterComment(null, noDiscount)).toEqual({ comment: null, review: { status: 'absent', reason: null } });
  });

  it('precio conocido sin descuento: se conserva un comentario factual', () => {
    const r = reviewHunterComment('Bolsa de 1 kg a $42, buena opción para la despensa semanal.', noDiscount);
    expect(r.review.status).toBe('kept');
    expect(r.comment).toContain('$42');
  });

  it('precio conocido sin descuento: hablar de descuento o porcentaje se descarta', () => {
    expect(reviewHunterComment('Tiene un gran descuento hoy en Amazon.', noDiscount).review).toMatchObject({ reason: 'DISCOUNT_NOT_CONFIRMED' });
    expect(reviewHunterComment('Baja 30% respecto a su precio normal.', noDiscount).review).toMatchObject({ reason: 'DISCOUNT_NOT_CONFIRMED' });
    expect(reviewHunterComment('Rebajado a $42 por tiempo limitado', noDiscount).review).toMatchObject({ status: 'dropped' });
  });

  it('descuento confirmado: porcentaje correcto se conserva, incorrecto se descarta', () => {
    expect(withList.comparison?.percent).toBe(30);
    expect(reviewHunterComment('Baja 30% frente al precio de lista de la tienda.', withList).review.status).toBe('kept');
    expect(reviewHunterComment('Arroz de 1 kg con -50% sobre el precio de lista.', withList).review).toMatchObject({ reason: 'DISCOUNT_MISMATCH' });
  });

  it('un porcentaje de composición no es un descuento', () => {
    expect(reviewHunterComment('Playera 100% algodón, talla mediana, a $199.', noDiscount).review.status).toBe('kept');
  });

  it.each([
    'Precio histórico, no lo vas a ver más bajo',
    'Es el más barato que hay ahora mismo',
    'Últimas unidades disponibles en tienda',
    'Oferta irrepetible para tu despensa',
    'Ahorras $120 comprándolo hoy en línea',
    'Más barato que en Walmart y en Soriana',
    'Mejor precio del mercado para este arroz',
    'Solo hoy a este precio en Amazon México',
  ])('afirmación no demostrable se descarta: %s', (text) => {
    expect(reviewHunterComment(text, withList).review).toMatchObject({ status: 'dropped', reason: 'UNSUPPORTED_CLAIM' });
  });

  it('comentarios sin valor se descartan: muy corto, repite el título o trae enlace', () => {
    expect(reviewHunterComment('Buenísimo', noDiscount).review).toMatchObject({ reason: 'TOO_SHORT' });
    expect(reviewHunterComment('arroz verde valle super extra 1 kg', noDiscount).review).toMatchObject({ reason: 'REPEATS_TITLE' });
    expect(reviewHunterComment('Míralo en https://amzn.to/xyz ahora', noDiscount).review).toMatchObject({ reason: 'CONTAINS_LINK' });
  });

  it('bot_meta se lee de forma tolerante', () => {
    expect(parseHunterCommentReview(null)).toBeNull();
    expect(parseHunterCommentReview({ hunter_comment: { status: 'weird' } })).toBeNull();
    expect(parseHunterCommentReview({ hunter_comment: { status: 'dropped', reason: 'NOPE', submitted: ' x ' } })).toEqual({
      status: 'dropped',
      reason: null,
      submitted: 'x',
    });
  });
});

function prepared(over: Partial<PreparedMachineCandidate> = {}): PreparedMachineCandidate {
  return {
    pageKind: 'PRODUCT',
    product: true,
    title: 'Arroz Verde Valle Super Extra 1 kg',
    imageUrl: 'https://m.media-amazon.com/images/I/arroz.jpg',
    imageUrls: [],
    store: 'Amazon',
    price: 42,
    originalPrice: null,
    priceSource: 'amazon_html',
    originalPriceSource: null,
    category: 'Despensa',
    currency: 'MXN',
    retailer: 'amazon',
    imageFailure: null,
    fetched: true,
    ...over,
  };
}

function candidate(over: Partial<ValidCandidate> = {}): ValidCandidate {
  return {
    index: 0,
    url: AMAZON,
    identityKey: 'amz:B0TESTASI1',
    title: 'Arroz Verde Valle 1 kg',
    price: 40,
    originalPrice: null,
    note: null,
    hunterComment: null,
    observedAt: NOW.toISOString(),
    ...over,
  };
}

function fakeSupabase() {
  const updates: Array<Record<string, unknown>> = [];
  const supabase = {
    from() {
      return {
        update(values: Record<string, unknown>) {
          updates.push(values);
          const chain = { eq: () => chain };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { supabase, updates };
}

type IngestCall = [unknown, { body: Record<string, unknown>; offerExtras: { bot_meta: Record<string, unknown> } }];

async function run(c: ValidCandidate, p: PreparedMachineCandidate = prepared()) {
  const { supabase, updates } = fakeSupabase();
  const ingest = vi.fn(async () => ({ ok: true as const, offerId: 'o1' }));
  const r = await enqueueHunterOffer(
    supabase,
    { batchId: 'b1', createdBy: 'bot', machineClientId: 'mc1', candidate: c },
    {
      negativeMemory: async () => ({ suppressed: false, reason: null, fingerprint: null }),
      prepare: async () => p,
      ingest: ingest as never,
      lowQualityTitle: () => false,
    },
  );
  const call = (ingest.mock.calls[0] as unknown as IngestCall)[1];
  return { r, call, updates };
}

describe('writer MCP: comentario en la oferta pendiente', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sin comentario: el cuerpo no cambia y no hay rastro en bot_meta', async () => {
    const { call } = await run(candidate());
    expect(call.body).not.toHaveProperty('hunter_comment');
    expect(call.offerExtras.bot_meta).not.toHaveProperty('hunter_comment');
  });

  it('comentario válido: va a hunter_comment, la oferta sigue pending y se registra la procedencia', async () => {
    const text = 'Bolsa de 1 kg a $42, buena opción para la despensa semanal.';
    const { r, call, updates } = await run(candidate({ hunterComment: text, note: 'nota interna' }));
    expect(r.offerId).toBe('o1');
    expect(call.body.hunter_comment).toBe(text);
    expect(call.body.description).toBe('nota interna');
    expect(call.body).not.toHaveProperty('status');
    expect(call.offerExtras.bot_meta.hunter_comment).toEqual({ status: 'kept', reason: null, submitted: text });
    expect(updates.some((u) => u.status === 'PUBLISHED')).toBe(false);
  });

  it('el bot declara lista pero la página no: hablar de descuento se descarta y la oferta entra igual', async () => {
    const text = 'Tiene 30% de descuento sobre su precio normal.';
    const { r, call } = await run(candidate({ originalPrice: 60, hunterComment: text }));
    expect(r.offerId).toBe('o1');
    expect(call.body.original_price).toBeNull();
    expect(call.body).not.toHaveProperty('hunter_comment');
    expect(call.offerExtras.bot_meta.hunter_comment).toEqual({
      status: 'dropped',
      reason: 'DISCOUNT_NOT_CONFIRMED',
      submitted: text,
    });
  });

  it('lista confirmada por la página: el porcentaje que coincide se conserva', async () => {
    const text = 'Baja 30% frente al precio de lista que muestra Amazon.';
    const { call } = await run(
      candidate({ originalPrice: 60, hunterComment: text }),
      prepared({ originalPrice: 60, originalPriceSource: 'amazon_html' }),
    );
    expect(call.body.original_price).toBe(60);
    expect(call.body.hunter_comment).toBe(text);
  });
});

describe('moderación muestra el comentario', () => {
  const html = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(FocusHunterComment, { mode: 'admin', ...props } as never));

  it('sin comentario ni borrador: no pinta nada', () => {
    expect(html({ hunterComment: null, botMeta: null })).toBe('');
  });

  it('comentario vigente: visible y marcado como público', () => {
    const out = html({ hunterComment: 'Bolsa de 1 kg a $42.', botMeta: { hunter_comment: { status: 'kept' } } });
    expect(out).toContain('Bolsa de 1 kg a $42.');
    expect(out).toContain('tarjeta pública');
  });

  it('borrador descartado: motivo y texto, aclarando que no se publica', () => {
    const out = html({
      hunterComment: null,
      botMeta: { hunter_comment: { status: 'dropped', reason: 'UNSUPPORTED_CLAIM', submitted: 'El más barato' } },
    });
    expect(out).toContain('afirmación no demostrable');
    expect(out).toContain('El más barato');
    expect(out).toContain('no se publica');
  });

  it('Focus usa el componente en el panel de contexto y en «Ver por qué»', () => {
    for (const f of ['FocusDesktopContext.tsx', 'FocusDetailsDrawer.tsx']) {
      const src = readFileSync(join(process.cwd(), 'app/components/moderation', f), 'utf8');
      expect(src).toContain('<FocusHunterComment');
    }
  });
});
