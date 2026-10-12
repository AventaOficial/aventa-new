import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ValidCandidate } from '@/lib/mcp/candidates';
import type { PreparedMachineCandidate } from '@/lib/offers/ingestion/prepareMachineCandidateOffer';
import { evaluateMachineCandidateAdmission } from '@/lib/offers/ingestion/machineCandidatePolicy';

const events: Array<Record<string, unknown>> = [];
vi.mock('@/lib/offers/batch/service', () => ({
  appendBatchEvent: vi.fn(async (_s: unknown, e: Record<string, unknown>) => {
    events.push(e);
  }),
  recountBatch: vi.fn(async () => undefined),
}));

const { enqueueHunterOffer } = await import('@/lib/offers/ingestion/enqueueHunterOffer');

const AMAZON = 'https://www.amazon.com.mx/dp/B0TESTASI1';
const SORIANA = 'https://www.soriana.com/cereal-kelloggs-zucaritas-600-g/11669769.html';

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
    ...over,
  } as ValidCandidate;
}

const ok = () => false;
const admit = (p: Partial<PreparedMachineCandidate>, botOriginal: number | null = null, url = AMAZON) =>
  evaluateMachineCandidateAdmission({
    url,
    prepared: prepared(p),
    botDeclared: { price: 40, originalPrice: botOriginal },
    isLowQualityTitle: ok,
  });

describe('precio anterior de candidatos MCP', () => {
  it('sin precio de lista en la página: oportunidad por precio, sin descuento', () => {
    const a = admit({ originalPrice: null });
    expect(a).toMatchObject({ outcome: 'admit', kind: 'price_opportunity', originalPrice: null, referenceDropped: 'absent' });
  });

  it('el precio de lista que declara el bot nunca se usa', () => {
    const a = admit({ originalPrice: null }, 99);
    expect(a).toMatchObject({ outcome: 'admit', originalPrice: null, botDeclared: { originalPrice: 99 } });
  });

  it('precio de lista extraído de la página con fuente: comparación vs. lista', () => {
    const a = admit({ originalPrice: 55, originalPriceSource: 'amazon_html' });
    expect(a).toMatchObject({
      outcome: 'admit',
      kind: 'list_price_comparison',
      originalPrice: 55,
      originalPriceProvenance: 'source_explicit',
    });
  });

  it('precio de lista sin fuente de página o no mayor que el actual se descarta', () => {
    expect(admit({ originalPrice: 55, originalPriceSource: null })).toMatchObject({ originalPrice: null, referenceDropped: 'no_page_source' });
    expect(admit({ originalPrice: 42, originalPriceSource: 'amazon_html' })).toMatchObject({ originalPrice: null, referenceDropped: 'not_above_price' });
    expect(admit({ originalPrice: 30, originalPriceSource: 'amazon_html' })).toMatchObject({ originalPrice: null, referenceDropped: 'not_above_price' });
    expect(admit({ originalPrice: Number.NaN, originalPriceSource: 'amazon_html' })).toMatchObject({ originalPrice: null });
  });

  it('precio actual sin fuente de página o inválido queda en revisión', () => {
    expect(admit({ priceSource: null })).toEqual({ outcome: 'hold', code: 'PRICE_SOURCE_UNKNOWN' });
    expect(admit({ price: 0 })).toEqual({ outcome: 'hold', code: 'PRICE_SOURCE_UNKNOWN' });
  });

  it('sin identidad fuerte no hay memoria negativa posible: queda en revisión', () => {
    expect(admit({}, null, SORIANA)).toEqual({ outcome: 'hold', code: 'NO_STRONG_IDENTITY' });
  });

  it('título de baja calidad se rechaza con la regla de bots', () => {
    const a = evaluateMachineCandidateAdmission({
      url: AMAZON,
      prepared: prepared(),
      botDeclared: { price: null, originalPrice: null },
      isLowQualityTitle: () => true,
    });
    expect(a).toEqual({ outcome: 'reject', code: 'LOW_QUALITY_TITLE' });
  });
});

type Update = { table: string; values: Record<string, unknown> };
function fakeSupabase() {
  const updates: Update[] = [];
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

const params = (c: ValidCandidate = candidate()) => ({ batchId: 'b1', createdBy: 'bot', machineClientId: 'mc1', candidate: c });

describe('enqueueHunterOffer', () => {
  beforeEach(() => {
    events.length = 0;
  });

  it('memoria negativa: rechazo terminal sin extraer ni crear oferta', async () => {
    const { supabase, updates } = fakeSupabase();
    const prepare = vi.fn();
    const ingest = vi.fn();
    const negativeMemory = vi.fn(async () => ({ suppressed: true, reason: 'REPEATED_REJECTION', fingerprint: 'amz:B0TESTASI1' }));
    const r = await enqueueHunterOffer(supabase, params(), { negativeMemory, prepare, ingest, lowQualityTitle: ok });
    expect(r.offerId).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
    expect(updates.filter((u) => u.table === 'offers')).toHaveLength(0);
    expect(updates[0].values).toMatchObject({ status: 'REJECTED', error_code: 'NEGATIVE_MEMORY' });
    expect(events[0]).toMatchObject({ action: 'negative_memory_suppressed', toStatus: 'REJECTED' });
  });

  it('sin supresión: crea la oferta pending con el precio de la página y sin lista del bot', async () => {
    const { supabase, updates } = fakeSupabase();
    const ingest = vi.fn(async () => ({ ok: true as const, offerId: 'o1' }));
    const r = await enqueueHunterOffer(supabase, params(candidate({ originalPrice: 99 } as Partial<ValidCandidate>)), {
      negativeMemory: async () => ({ suppressed: false, reason: null, fingerprint: 'amz:B0TESTASI1' }),
      prepare: async () => prepared(),
      ingest: ingest as never,
      lowQualityTitle: ok,
    });
    expect(r.offerId).toBe('o1');
    const call = (ingest.mock.calls[0] as unknown as [unknown, { body: Record<string, unknown>; offerExtras: { bot_meta: Record<string, unknown> } }])[1];
    expect(call.body).toMatchObject({ price: 42, original_price: null, hasDiscount: false });
    expect(call.offerExtras.bot_meta.price_policy).toMatchObject({
      kind: 'price_opportunity',
      bot_declared: { price: 40, originalPrice: 99 },
    });
    expect(updates.at(-1)?.values).toMatchObject({ status: 'APPROVED', offer_id: 'o1', original_price: null });
  });

  it('sin identidad fuerte: queda en revisión humana y no crea oferta', async () => {
    const { supabase, updates } = fakeSupabase();
    const ingest = vi.fn();
    await enqueueHunterOffer(supabase, params(candidate({ url: SORIANA, identityKey: 'soriana' })), {
      negativeMemory: async () => ({ suppressed: false, reason: null, fingerprint: null }),
      prepare: async () => prepared({ priceSource: 'retail_html' }),
      ingest,
      lowQualityTitle: ok,
    });
    expect(ingest).not.toHaveBeenCalled();
    expect(updates[0].values).toMatchObject({ status: 'NEEDS_REVIEW', error_code: 'NO_STRONG_IDENTITY' });
  });
});
