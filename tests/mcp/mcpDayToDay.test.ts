import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { validateCandidates, type ValidCandidate } from '@/lib/mcp/candidates';
import { CANDIDATE_REJECTION_CODES, MCP_TOOL_SCOPE, MCP_TOOLS } from '@/lib/mcp/contract';
import { getPriceReference, listPriceVerdict, priceVerdict, summarizeHistory } from '@/lib/mcp/priceReference';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import { inferStoreFromHostname } from '@/lib/inferStoreFromHostname';
import { mexicanRetailerCurrency } from '@/lib/offers/sourceCurrency';
import { isAllowedOfferParseHost } from '@/lib/server/fetchUrlSafety';
import { decideMultiBuy } from '@/lib/moderation/multiBuyDecision';
import { buildPendingMultiBuy, multiBuyConditionsText, parseMultiBuyMeta } from '@/lib/offers/multiBuy';
import type { PreparedMachineCandidate } from '@/lib/offers/ingestion/prepareMachineCandidateOffer';
import { createMemoryDb, memorySupabase } from '../helpers/memorySupabase';

vi.mock('@/lib/offers/batch/service', () => ({
  appendBatchEvent: vi.fn(async () => undefined),
  recountBatch: vi.fn(async () => undefined),
}));
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => ({ session: null }) }));

const { enqueueHunterOffer } = await import('@/lib/offers/ingestion/enqueueHunterOffer');
const { default: MultiBuyReview } = await import('@/app/components/moderation/MultiBuyReview');

const NOW = new Date('2026-10-13T18:00:00Z');
const AMAZON = 'https://www.amazon.com.mx/dp/B0PRICEREF';
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

describe('farmacias en la allowlist', () => {
  it.each([
    ['www.farmaciasguadalajara.com', 'Farmacias Guadalajara'],
    ['www.fahorro.com', 'Farmacias del Ahorro'],
    ['www.farmaciasanpablo.com.mx', 'Farmacia San Pablo'],
    ['www.benavides.com.mx', 'Farmacias Benavides'],
  ])('%s: permitida, con nombre de tienda y en MXN', (host, store) => {
    expect(isAllowedOfferParseHost(host)).toBe(true);
    expect(inferStoreFromHostname(host)).toBe(store);
    expect(mexicanRetailerCurrency(`https://${host}/producto`)).toBe('MXN');
  });

  it('dominios parecidos siguen fuera', () => {
    expect(isAllowedOfferParseHost('fahorro.com.evil.example')).toBe(false);
    expect(isAllowedOfferParseHost('farmaciasanpablo.com')).toBe(false);
  });
});

describe('get_price_reference: contrato', () => {
  it('es de sólo lectura con catalog:read', () => {
    expect(MCP_TOOLS).toContain('get_price_reference');
    expect(MCP_TOOL_SCOPE.get_price_reference).toBe('catalog:read');
  });

  it('la migración de auditoría admite todas las herramientas', () => {
    const sql = read('docs/supabase-migrations/20261013_machine_client_calls_price_reference.sql');
    for (const tool of MCP_TOOLS) expect(sql).toContain(`'${tool}'`);
    expect(sql).not.toMatch(/\bDROP TABLE\b|\bDELETE FROM\b|\bTRUNCATE\b|\bGRANT\b/i);
  });

  it('el servidor registra la herramienta y no hace fetch', () => {
    expect(read('lib/mcp/server.ts')).toContain("'get_price_reference'");
    const src = read('lib/mcp/priceReference.ts');
    expect(src).not.toMatch(/\bfetch\(|prepareMachineCandidateOffer|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });
});

describe('get_price_reference: veredictos', () => {
  const obs = (price: number, day: string, listPrice: number | null = null) => ({ price, listPrice, at: `2026-${day}T12:00:00Z` });

  it('sin historial suficiente no inventa un veredicto', () => {
    const h = summarizeHistory([obs(100, '10-01')]);
    expect(priceVerdict(80, h)).toBe('insufficient_history');
    expect(listPriceVerdict(200, h, null)).toBe('unknown');
    expect(listPriceVerdict(null, h, null)).toBe('not_provided');
  });

  it('ubica el precio contra mínimo, mediana y máximo', () => {
    const h = summarizeHistory([obs(100, '09-01'), obs(120, '09-10'), obs(140, '09-20')]);
    expect(h).toMatchObject({ distinctDays: 3, minPrice: 100, medianPrice: 120, maxPrice: 140 });
    expect(priceVerdict(95, h)).toBe('lowest_seen');
    expect(priceVerdict(110, h)).toBe('below_typical');
    expect(priceVerdict(130, h)).toBe('within_seen');
    expect(priceVerdict(150, h)).toBe('above_seen');
  });

  it('lista inflada: más alta que la que Aventa vio antes o que el mercado', () => {
    const h = summarizeHistory([obs(100, '09-01', 150), obs(110, '09-10', 150)]);
    expect(listPriceVerdict(300, h, null)).toBe('raised_vs_history');
    expect(listPriceVerdict(155, h, null)).toBe('consistent');
    const none = summarizeHistory([]);
    const market = { source: 'profeco_qqp' as const, periodEnd: '2026-09-30', minPrice: 90, medianPrice: 100, maxPrice: 120, observations: 10 };
    expect(listPriceVerdict(200, none, market)).toBe('above_market');
    expect(listPriceVerdict(125, none, market)).toBe('unknown');
  });
});

describe('get_price_reference: lectura', () => {
  function seed() {
    const db = createMemoryDb();
    const identity = resolveIngestionIdentity(AMAZON);
    db.tables.offers = [
      { id: 'o1', title: 'Pañales Huggies etapa 3', price: 400, original_price: 500, created_at: '2026-08-01T10:00:00Z', offer_url: AMAZON, ingestion_identity_key: identity.key, product_fingerprint: identity.productFingerprint },
      { id: 'o2', title: 'Pañales Huggies etapa 3', price: 350, original_price: 500, created_at: '2026-09-01T10:00:00Z', offer_url: AMAZON, ingestion_identity_key: identity.key, product_fingerprint: identity.productFingerprint },
      { id: 'o3', title: 'Otro producto', price: 10, original_price: null, created_at: '2026-09-02T10:00:00Z', offer_url: 'https://www.amazon.com.mx/dp/B0OTHERXXX', ingestion_identity_key: 'x', product_fingerprint: 'y' },
    ];
    db.tables.offer_price_snapshots = [
      { offer_id: 'o1', price: 400, original_price: 500, recorded_at: '2026-08-01T10:00:00Z', validation_status: null, availability: null },
      { offer_id: 'o2', price: 350, original_price: 500, recorded_at: '2026-09-01T10:00:00Z', validation_status: null, availability: null },
      { offer_id: 'o2', price: 1, original_price: null, recorded_at: '2026-09-02T10:00:00Z', validation_status: 'invalid', availability: null },
      { offer_id: 'o3', price: 10, original_price: null, recorded_at: '2026-09-02T10:00:00Z', validation_status: null, availability: null },
    ];
    db.tables.price_references = [];
    return memorySupabase(db) as unknown as SupabaseClient;
  }

  it('usa sólo el historial válido del mismo producto', async () => {
    const r = await getPriceReference(seed(), { url: AMAZON, price: 330, originalPrice: 900 }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.history).toMatchObject({ observations: 2, distinctDays: 2, minPrice: 350, maxPrice: 400, maxListPrice: 500 });
    expect(r.data.verdict).toEqual({ price: 'lowest_seen', listPrice: 'raised_vs_history', market: 'no_reference' });
    expect(r.data.summary).toContain('inflado');
    expect(JSON.stringify(r.data)).not.toMatch(/o1|o2|pending|approved|rejected/);
  });

  it('entrada inválida => INVALID_INPUT', async () => {
    const sb = seed();
    expect(await getPriceReference(sb, { url: 'https://evil.example/x', price: 1 }, NOW)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await getPriceReference(sb, { url: AMAZON, price: 0 }, NOW)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await getPriceReference(sb, { url: AMAZON, price: 100, originalPrice: 90 }, NOW)).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });
});

describe('multiBuy en candidatos', () => {
  const raw = (over: Record<string, unknown> = {}) => ({
    url: AMAZON,
    title: 'Pañales Huggies etapa 3, 40 piezas',
    price: 300,
    currency: 'MXN',
    observedAt: '2026-10-13T17:00:00Z',
    ...over,
  });

  it('opcional y válido', () => {
    expect(validateCandidates([raw()], NOW).valid[0]).not.toHaveProperty('multiBuy');
    expect(validateCandidates([raw({ multiBuy: { buy: 3, pay: 2 } })], NOW).valid[0].multiBuy).toEqual({ buy: 3, pay: 2 });
  });

  it.each([
    { buy: 2, pay: 2 },
    { buy: 1, pay: 0 },
    { buy: 11, pay: 1 },
    { buy: 2.5, pay: 1 },
    { buy: 3, pay: 2, extra: 1 },
    [3, 2],
    '3x2',
  ])('mal formado => INVALID_MULTI_BUY: %j', (multiBuy) => {
    expect(CANDIDATE_REJECTION_CODES).toContain('INVALID_MULTI_BUY');
    expect(validateCandidates([raw({ multiBuy })], NOW).rejected).toEqual([{ index: 0, code: 'INVALID_MULTI_BUY' }]);
  });
});

function prepared(over: Partial<PreparedMachineCandidate> = {}): PreparedMachineCandidate {
  return {
    pageKind: 'PRODUCT',
    product: true,
    title: 'Pañales Huggies etapa 3, 40 piezas',
    imageUrl: 'https://m.media-amazon.com/images/I/panal.jpg',
    imageUrls: [],
    store: 'Amazon',
    price: 300,
    originalPrice: null,
    priceSource: 'amazon_html',
    originalPriceSource: null,
    category: 'Bebés',
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
    identityKey: 'amz:B0PRICEREF',
    title: 'Pañales Huggies etapa 3',
    price: 290,
    originalPrice: null,
    note: null,
    hunterComment: null,
    observedAt: NOW.toISOString(),
    ...over,
  };
}

type IngestCall = [unknown, { body: Record<string, unknown>; offerExtras: { bot_meta: Record<string, unknown>; moderator_comment?: string } }];

async function enqueue(c: ValidCandidate) {
  const chain = { eq: () => chain };
  const supabase = { from: () => ({ update: () => chain }) } as unknown as SupabaseClient;
  const ingest = vi.fn(async () => ({ ok: true as const, offerId: 'o1' }));
  await enqueueHunterOffer(
    supabase,
    { batchId: 'b1', createdBy: 'bot', machineClientId: 'mc1', candidate: c },
    {
      negativeMemory: async () => ({ suppressed: false, reason: null, fingerprint: null }),
      prepare: async () => prepared(),
      ingest: ingest as never,
      lowQualityTitle: () => false,
    },
  );
  return (ingest.mock.calls[0] as unknown as IngestCall)[1];
}

describe('multiBuy en la oferta pendiente', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sin promoción: nada cambia', async () => {
    const call = await enqueue(candidate());
    expect(call.offerExtras.bot_meta).not.toHaveProperty('multi_buy');
    expect(call.offerExtras).not.toHaveProperty('moderator_comment');
  });

  it('precio efectivo sobre el precio de la ficha, pendiente de confirmar y nunca público', async () => {
    const call = await enqueue(candidate({ multiBuy: { buy: 3, pay: 2 }, note: 'Promo en la ficha' }));
    expect(call.offerExtras.bot_meta.multi_buy).toEqual({
      label: '3x2',
      buy: 3,
      pay: 2,
      unit_price: 300,
      effective_unit_price: 200,
      status: 'pending_confirmation',
    });
    expect(call.offerExtras.moderator_comment).toMatch(/^Promoción 3x2 declarada por el bot: precio efectivo \$200 por pieza\./);
    expect(call.offerExtras.moderator_comment).toContain('Nota interna del bot: Promo en la ficha');
    expect(call.body.price).toBe(300);
    expect(call.body).not.toHaveProperty('conditions');
  });

  it('nota larga: la línea de la promoción no se corta y el total cabe en 500', async () => {
    const call = await enqueue(candidate({ multiBuy: { buy: 2, pay: 1 }, note: 'x'.repeat(280) }));
    expect(call.offerExtras.moderator_comment?.length).toBeLessThanOrEqual(500);
    expect(call.offerExtras.moderator_comment).toContain('precio efectivo $150 por pieza');
  });
});

describe('confirmación del moderador', () => {
  const botMeta = { internal_note: 'n', multi_buy: buildPendingMultiBuy(300, 3, 2) };
  const base = { botMeta, conditions: null, price: 300, actorId: 'mod-1', now: NOW };

  it('confirmar publica el texto en conditions y conserva el resto de bot_meta', () => {
    const r = decideMultiBuy({ ...base, decision: 'confirm' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.conditions).toBe('Promoción 3x2: llevas 3 y pagas 2. Precio efectivo $200 por pieza.');
    expect(r.botMeta.internal_note).toBe('n');
    expect(r.multiBuy).toMatchObject({ status: 'confirmed', decided_by: 'mod-1', effective_unit_price: 200 });
  });

  it('el moderador puede fijar el precio efectivo, pero no por encima del precio por pieza', () => {
    const r = decideMultiBuy({ ...base, decision: 'confirm', effectiveUnitPrice: '210.5' });
    expect(r.ok && r.conditions).toContain('$210.50');
    expect(decideMultiBuy({ ...base, decision: 'confirm', effectiveUnitPrice: 301 })).toMatchObject({ ok: false });
    expect(decideMultiBuy({ ...base, decision: 'confirm', effectiveUnitPrice: 'abc' })).toMatchObject({ ok: false });
  });

  it('respeta condiciones previas y descartar retira sólo el texto de la promoción', () => {
    const confirmed = decideMultiBuy({ ...base, conditions: 'Sólo en línea', decision: 'confirm' });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.conditions).toBe(`${multiBuyConditionsText(confirmed.multiBuy)}\nSólo en línea`);
    const rejected = decideMultiBuy({ ...base, botMeta: confirmed.botMeta, conditions: confirmed.conditions, decision: 'reject' });
    expect(rejected).toMatchObject({ ok: true, conditions: 'Sólo en línea' });
    expect(rejected.ok && rejected.multiBuy.status).toBe('rejected');
  });

  it('sin promoción declarada no hay nada que decidir', () => {
    expect(decideMultiBuy({ ...base, botMeta: {}, decision: 'confirm' })).toMatchObject({ ok: false });
    expect(parseMultiBuyMeta({ multi_buy: { buy: 2, pay: 2, unit_price: 1, effective_unit_price: 1, status: 'confirmed' } })).toBeNull();
  });

  it('la ruta exige moderador, oferta pendiente y claim; no toca economía', () => {
    const src = read('app/api/admin/moderation/multi-buy/route.ts');
    expect(src).toContain('requireModerationActor(request)');
    expect(src).toContain('assertModeratorOwnsLock');
    expect(src).toContain(".eq('status', 'pending')");
    expect(src).not.toMatch(/reward|commission|ledger|payout|settlement|\.rpc\(/i);
    const updates = [...src.matchAll(/\.update\(([^)]*)\)/g)].map((m) => m[1]);
    expect(updates).toEqual(['{ bot_meta: decided.botMeta, conditions: decided.conditions }']);
  });

  it('las vistas de moderación muestran la promoción', () => {
    const html = renderToStaticMarkup(createElement(MultiBuyReview, { mode: 'admin', offerId: 'o1', botMeta } as never));
    expect(html).toContain('Promoción 3x2');
    expect(html).toContain('Sin confirmar');
    expect(renderToStaticMarkup(createElement(MultiBuyReview, { mode: 'admin', offerId: 'o1', botMeta: {} } as never))).toBe('');
    for (const f of [
      'app/components/moderation/FocusDesktopContext.tsx',
      'app/components/moderation/FocusDetailsDrawer.tsx',
      'app/admin/components/ModerationOfferDetail.tsx',
      'app/admin/components/ModerationMobileReview.tsx',
    ]) {
      expect(read(f)).toContain('<MultiBuyReview');
    }
  });
});
