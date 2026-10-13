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

  it('formato inválido no rechaza el candidato: el comentario se marca y no se conserva el texto', () => {
    const cases = [{ hunterComment: '<b>oferta</b>' }, { hunterComment: 'linea\u0007' }, { hunterComment: 42 }];
    const r = validateCandidates(cases.map((c, i) => raw({ ...c, url: `${AMAZON}${i}` })), NOW);
    expect(r.rejected).toEqual([]);
    expect(r.valid).toHaveLength(cases.length);
    for (const v of r.valid) {
      expect(v.hunterComment).toBeNull();
      expect(v.hunterCommentInvalid).toBe(true);
    }
  });

  it('un comentario largo no rechaza el candidato: llega acotado para que el filtro lo descarte', () => {
    const r = validateCandidates([raw({ hunterComment: 'x'.repeat(MCP_HUNTER_COMMENT_MAX * 5) })], NOW);
    expect(r.rejected).toEqual([]);
    expect(r.valid[0].hunterCommentInvalid).toBeUndefined();
    expect(Array.from(r.valid[0].hunterComment ?? '').length).toBe(MCP_HUNTER_COMMENT_MAX * 2);
  });

  it('saltos de línea cuentan como espacios, no como caracteres de control', () => {
    const r = validateCandidates([raw({ hunterComment: 'Bolsa de 1 kg\na $42 en Amazon.' })], NOW);
    expect(r.valid[0].hunterComment).toBe('Bolsa de 1 kg a $42 en Amazon.');
    expect(r.valid[0].hunterCommentInvalid).toBeUndefined();
  });

  it('el tope coincide con la columna pública y hunterComment no tiene código de rechazo', () => {
    expect(MCP_HUNTER_COMMENT_MAX).toBe(OFFER_HUNTER_COMMENT_MAX);
    expect(CANDIDATE_REJECTION_CODES).toContain('INVALID_NOTE');
    expect(CANDIDATE_REJECTION_CODES).not.toContain('INVALID_HUNTER_COMMENT');
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

  it.each([
    'Ofertón: bolsa de 1 kg de arroz a $42.',
    'Ahorro garantizado con esta bolsa de 1 kg.',
    'Precio de remate para el arroz de 1 kg.',
  ])('lenguaje de venta agresivo se descarta: %s', (text) => {
    expect(reviewHunterComment(text, withList).review).toMatchObject({ status: 'dropped', reason: 'UNSUPPORTED_CLAIM' });
  });

  it.each([
    'Lo compré la semana pasada y rinde bastante.',
    'En casa lo usamos diario, bolsa de 1 kg a $42.',
    'Me encantó este arroz, 1 kg a $42.',
    'Cabe perfecto en tu presupuesto de la semana.',
    'Ideal si tu quincena ya viene justa: 1 kg a $42.',
  ])('no inventa experiencias ni supone la situación del comprador: %s', (text) => {
    expect(reviewHunterComment(text, noDiscount).review).toMatchObject({ status: 'dropped', reason: 'PERSONAL_CLAIM' });
  });

  it.each([
    'Encontré este paquete de arroz que puede valer la pena revisar para la despensa. Checa el precio por kilo y las condiciones de la tienda.',
    'Bolsa de 1 kg a $42 en Soriana; sale en $42 el kilo, útil para la despensa de la semana.',
    'Si comes arroz seguido, la bolsa de 1 kg a $42 rinde para varias comidas.',
  ])('un comentario natural y factual se conserva: %s', (text) => {
    expect(reviewHunterComment(text, noDiscount).review.status).toBe('kept');
  });

  it.each([
    'Encontrado por Grok: bolsa de 1 kg a $42.',
    'Como IA te recomiendo este arroz de 1 kg.',
    'Seleccionado por nuestro bot para tu despensa.',
    'Sugerencia de inteligencia artificial: 1 kg a $42.',
  ])('el comentario no puede presentarse como bot o IA: %s', (text) => {
    expect(reviewHunterComment(text, noDiscount).review).toMatchObject({ status: 'dropped', reason: 'MENTIONS_BOT' });
  });

  it.each([
    'Está bien pinche barato este arroz de 1 kg.',
    'Para los pendejos que pagan de más: 1 kg a $42.',
    'Precio de poca madre para 1 kg de arroz.',
  ])('el comentario editorial no lleva groserías: %s', (text) => {
    expect(reviewHunterComment(text, noDiscount).review).toMatchObject({ status: 'dropped', reason: 'OFFENSIVE' });
  });

  it('un comentario normal con «matar» o «retrasado» en otro sentido se conserva', () => {
    expect(reviewHunterComment('Snack de 1 kg ideal para matar el antojo a $42.', noDiscount).review.status).toBe('kept');
  });

  it('palabras parecidas no cuentan como autorreferencia de bot', () => {
    expect(reviewHunterComment('Bote de 1 kg con tapa hermética a $42.', noDiscount).review.status).toBe('kept');
    expect(reviewHunterComment('Botella de agua de 1 L ideal para el día.', noDiscount).review.status).toBe('kept');
  });

  it('pasar del tope público descarta el comentario', () => {
    const long = `Bolsa de 1 kg a $42 para la despensa. ${'Ideal para comidas diarias. '.repeat(6)}`;
    expect(Array.from(long.trim()).length).toBeGreaterThan(OFFER_HUNTER_COMMENT_MAX);
    expect(reviewHunterComment(long, noDiscount)).toEqual({ comment: null, review: { status: 'dropped', reason: 'TOO_LONG' } });
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
    expect(call.body.description).not.toContain('nota interna');
    expect(call.body.description).toContain('Revisa disponibilidad');
    expect(call.offerExtras.bot_meta.internal_note).toBe('nota interna');
    expect(call.offerExtras.moderator_comment).toBe('Nota interna del bot: nota interna');
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

  it('comentario largo: la oferta entra igual y moderación ve el borrador con su motivo', async () => {
    const text = 'Arroz de 1 kg a $42. '.repeat(10).trim();
    const { r, call } = await run(candidate({ hunterComment: text }));
    expect(r.offerId).toBe('o1');
    expect(call.body).not.toHaveProperty('hunter_comment');
    expect(call.offerExtras.bot_meta.hunter_comment).toEqual({ status: 'dropped', reason: 'TOO_LONG', submitted: text });
  });

  it('comentario que no es texto plano: la oferta entra igual y no se guarda el texto', async () => {
    const { r, call } = await run(candidate({ hunterComment: null, hunterCommentInvalid: true }));
    expect(r.offerId).toBe('o1');
    expect(call.body).not.toHaveProperty('hunter_comment');
    expect(call.offerExtras.bot_meta.hunter_comment).toEqual({ status: 'dropped', reason: 'INVALID_FORMAT', submitted: null });
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
