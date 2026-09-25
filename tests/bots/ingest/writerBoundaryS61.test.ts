/**
 * P0 — Writer-boundary S6.1 fail-closed.
 * Proves insertIngestedOffer does not trust callers (direct / S7 / forged gate opts).
 * Persistence is via ingestOfferObservation (mocked); S6.1 runs before that call.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { withMachinePendingWritesEnabled } from '@/lib/bots/ingest/machineInsertCanary';

const BOT_USER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const persistState = {
  calls: 0,
  forceDupOnSecond: false,
  forceConflictOnSecond: false,
};

vi.mock('@/lib/offers/ingestion/ingestOfferObservation', () => ({
  ingestOfferObservation: async () => {
    persistState.calls += 1;
    if (persistState.forceConflictOnSecond && persistState.calls > 1) {
      return {
        ok: false,
        httpStatus: 409 as const,
        error: 'duplicate',
        duplicate_offer_id: 'existing-race',
        duplicate_status: 'pending',
      };
    }
    if (persistState.forceDupOnSecond && persistState.calls > 1) {
      return {
        ok: true,
        created: false,
        offerId: 'existing-1',
        status: 'pending' as const,
      };
    }
    return {
      ok: true,
      created: true,
      offerId: `offer-writer-ok-${persistState.calls}`,
      status: 'pending' as const,
    };
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => {
    const chain = (): Record<string, unknown> => {
      const q: Record<string, unknown> = {};
      const self = () => q;
      for (const m of [
        'select',
        'eq',
        'in',
        'is',
        'limit',
        'order',
        'gte',
        'lte',
        'neq',
        'not',
        'or',
      ]) {
        q[m] = self;
      }
      q.maybeSingle = async () => ({ data: null, error: null });
      q.single = async () => ({ data: null, error: null });
      return q;
    };
    return {
      from: () => ({
        select: () => chain(),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
  },
}));

vi.mock('@/lib/affiliate', () => ({
  resolveAndNormalizeAffiliateOfferUrl: async (url: string) => url,
}));

vi.mock('@/lib/discovery/negativeMemory', () => ({
  isSuppressedByNegativeMemory: async () => ({ suppressed: false }),
}));

const duplicateState: {
  sequence: Array<null | { kind: string; price: number; id: string; status: string }>;
  index: number;
} = {
  sequence: [],
  index: 0,
};

vi.mock('@/lib/offers/findDuplicateOffer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/offers/findDuplicateOffer')>();
  return {
    ...actual,
    findDuplicateOfferByUrl: async () => {
      if (duplicateState.sequence.length === 0) return null;
      const next = duplicateState.sequence[duplicateState.index] ?? null;
      duplicateState.index += 1;
      return next;
    },
    strongProductFingerprintForUrl: () => 'fp-writer-test',
    classifyDuplicateOfferRow: () => 'exact_url',
  };
});

const eligibilityCrash = { enabled: false };

vi.mock('@/lib/bots/ingest/machineLiveInsertEligibility', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/bots/ingest/machineLiveInsertEligibility')>();
  return {
    ...actual,
    evaluateMachineLiveInsertEligibility: (
      input: Parameters<typeof actual.evaluateMachineLiveInsertEligibility>[0],
    ) => {
      if (eligibilityCrash.enabled) {
        throw new Error('simulated_gate_crash');
      }
      return actual.evaluateMachineLiveInsertEligibility(input);
    },
  };
});

function baseConfig(): BotIngestConfig {
  return {
    profile: 'standard',
    enabled: true,
    botUserId: BOT_USER,
    botUserIdTech: null,
    botUserIdStaples: null,
    botAuthorDualMode: false,
    botUserIdsForQuota: [BOT_USER],
    minDiscountPercent: 20,
    rejectBelowScore: 40,
    titleMinLength: 12,
    titleBlocklistGenericRe: null,
    techCategoryIdSet: new Set(['MLM1648']),
  } as unknown as BotIngestConfig;
}

function validMeta(): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-3333333333-writer-valid',
    title: 'Audífonos Bluetooth Noise Cancelling Oferta Verificada MX',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_x.jpg',
    discountPrice: 700,
    originalPrice: 1000,
    discountPercent: 30,
    signals: {
      originalPriceProvenance: 'source_explicit',
      cardDiscountSource: 'pdp',
      historyReady: true,
      samples90d: 5,
      habitual30d: 1000,
      savingsVsHabitualPct: 30,
      effectiveDiscountPercent: 30,
      suspectedArtificialListPrice: false,
      priceLowest90d: 700,
      priceVsLowest90dPct: 0,
      soldQuantity: 200,
      ratingAverage: 4.6,
      ratingCount: 80,
      priceIntelSource: 'aventa_ml',
    },
  };
}

function artificialMeta(): ParsedOfferMetadata {
  return {
    ...validMeta(),
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1111111111-artificial',
    discountPrice: 3300,
    originalPrice: 10000,
    discountPercent: 67,
    signals: {
      ...validMeta().signals,
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
      historyReady: false,
      suspectedArtificialListPrice: true,
      effectiveDiscountPercent: 0,
      samples90d: 1,
    },
  };
}

function insufficientHistoryMeta(): ParsedOfferMetadata {
  return {
    ...validMeta(),
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-2222222222-nohist',
    signals: {
      ...validMeta().signals,
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
      historyReady: false,
      samples90d: 1,
      suspectedArtificialListPrice: false,
      effectiveDiscountPercent: undefined,
    },
  };
}

describe('P0 writer boundary — insertIngestedOffer S6.1 fail-closed', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    persistState.calls = 0;
    persistState.forceDupOnSecond = false; persistState.forceConflictOnSecond = false;
    duplicateState.sequence = [];
    duplicateState.index = 0;
    eligibilityCrash.enabled = false;
    process.env = {
      ...prevEnv,
      NODE_ENV: 'test',
      VERCEL_ENV: 'preview',
    };
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
  });

  afterEach(() => {
    process.env = { ...prevEnv };
    eligibilityCrash.enabled = false;
  });

  it('A — eligible → ALLOW (insert reaches DB mock)', async () => {
    const { insertIngestedOffer } = await import('@/lib/bots/ingest/insertIngestedOffer');
    const r = await withMachinePendingWritesEnabled(() =>
      insertIngestedOffer(validMeta(), baseConfig(), { status: 'pending' }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.offerId).toMatch(/^offer-writer-ok-/);
    expect(persistState.calls).toBe(1);
  });

  it('B — S6.1 false (artificial) → NO INSERT / S61_BLOCKED', async () => {
    const { insertIngestedOffer } = await import('@/lib/bots/ingest/insertIngestedOffer');
    const r = await withMachinePendingWritesEnabled(() =>
      insertIngestedOffer(artificialMeta(), baseConfig(), {
        status: 'pending',
        gateAction: 'insert_pending',
        gateReason: 'forged_would_insert',
        decision: 'auto_approve',
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && 'code' in r) expect(r.code).toBe('S61_BLOCKED');
    expect(persistState.calls).toBe(0);
  });

  it('C — DQE / effective-discount unverified → NO INSERT', async () => {
    const { insertIngestedOffer } = await import('@/lib/bots/ingest/insertIngestedOffer');
    const meta: ParsedOfferMetadata = {
      ...validMeta(),
      canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-4444444444-dqe',
      discountPercent: 40,
      signals: {
        ...validMeta().signals,
        effectiveDiscountPercent: 0,
        suspectedArtificialListPrice: false,
        historyReady: true,
        originalPriceProvenance: 'source_explicit',
      },
    };
    const r = await withMachinePendingWritesEnabled(() =>
      insertIngestedOffer(meta, baseConfig(), { status: 'pending' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && 'code' in r) expect(r.code).toBe('S61_BLOCKED');
    if (!r.ok && 'gate' in r && r.gate) {
      expect(r.gate.wouldInsert).toBe(false);
      expect(
        r.gate.reasonCodes.some((c) =>
          [
            'EFFECTIVE_DISCOUNT_UNVERIFIED',
            'DQE_DISCARD',
            'NO_VERIFIED_DEAL',
            'DQE_POTENTIAL_ONLY',
          ].includes(c),
        ),
      ).toBe(true);
    }
    expect(persistState.calls).toBe(0);
  });

  it('D — artificial list price → NO INSERT', async () => {
    const { insertIngestedOffer } = await import('@/lib/bots/ingest/insertIngestedOffer');
    const r = await withMachinePendingWritesEnabled(() =>
      insertIngestedOffer(artificialMeta(), baseConfig(), { status: 'pending' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && 'code' in r) expect(r.code).toBe('S61_BLOCKED');
    if (!r.ok && 'gate' in r && r.gate) {
      expect(r.gate.reasonCodes).toContain('ARTIFICIAL_LIST_PRICE');
    }
    expect(persistState.calls).toBe(0);
  });

  it('E — insufficient history (listing_card) → NO INSERT', async () => {
    const { insertIngestedOffer } = await import('@/lib/bots/ingest/insertIngestedOffer');
    const r = await withMachinePendingWritesEnabled(() =>
      insertIngestedOffer(insufficientHistoryMeta(), baseConfig(), { status: 'pending' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && 'code' in r) expect(r.code).toBe('S61_BLOCKED');
    if (!r.ok && 'gate' in r && r.gate) {
      expect(
        r.gate.reasonCodes.some(
          (c) => c === 'INSUFFICIENT_HISTORY' || c === 'ORIGINAL_PRICE_UNTRUSTED',
        ),
      ).toBe(true);
    }
    expect(persistState.calls).toBe(0);
  });

  it('F — missing eligibility evidence → NO INSERT', async () => {
    const { insertIngestedOffer } = await import('@/lib/bots/ingest/insertIngestedOffer');
    const meta: ParsedOfferMetadata = {
      canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-5555555555-bare',
      title: 'Producto Sin Señales De Precio Suficientes Para Mint MX',
      store: 'Mercado Libre',
      imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_x.jpg',
      discountPrice: 100,
      originalPrice: 200,
      discountPercent: 50,
      signals: {},
    };
    const r = await withMachinePendingWritesEnabled(() =>
      insertIngestedOffer(meta, baseConfig(), { status: 'pending' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && 'code' in r) expect(r.code).toBe('S61_BLOCKED');
    expect(persistState.calls).toBe(0);
  });

  it('G — evaluator throws → FAIL CLOSED / NO INSERT', async () => {
    eligibilityCrash.enabled = true;
    const { insertIngestedOffer } = await import('@/lib/bots/ingest/insertIngestedOffer');
    const r = await withMachinePendingWritesEnabled(() =>
      insertIngestedOffer(validMeta(), baseConfig(), { status: 'pending' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && 'code' in r) expect(r.code).toBe('S61_BLOCKED');
    if (!r.ok && 'error' in r) {
      expect(r.error).toMatch(/fail_closed_evaluator_error|simulated_gate_crash/);
    }
    expect(persistState.calls).toBe(0);
  });

  it('H — S7 direct path with artificial → S61_BLOCKED', async () => {
    const { writePendingViaS7Bridge } = await import('@/lib/supply/s7Bridge');
    const r = await withMachinePendingWritesEnabled(() =>
      writePendingViaS7Bridge({
        config: baseConfig(),
        meta: artificialMeta(),
        requireDedicatedAuthor: false,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && 'code' in r) expect(r.code).toBe('S61_BLOCKED');
    expect(persistState.calls).toBe(0);
  });

  it('I — replay: second insert hits duplicate → NO DOUBLE INSERT', async () => {
    persistState.forceDupOnSecond = true;
    duplicateState.sequence = [];
    duplicateState.index = 0;
    const { insertIngestedOffer } = await import('@/lib/bots/ingest/insertIngestedOffer');
    const first = await withMachinePendingWritesEnabled(() =>
      insertIngestedOffer(validMeta(), baseConfig(), { status: 'pending' }),
    );
    const second = await withMachinePendingWritesEnabled(() =>
      insertIngestedOffer(validMeta(), baseConfig(), { status: 'pending' }),
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok && 'duplicate' in second) expect(second.duplicate).toBe(true);
    // Both reached sole writer; second reused existing identity (no second mint).
    expect(persistState.calls).toBe(2);
  });

  it('J — concurrency: parallel same identity → UNIQUE second fails closed', async () => {
    // Both reach sole writer; second hits conflict (409).
    persistState.forceConflictOnSecond = true;
    duplicateState.sequence = [];
    const { insertIngestedOffer } = await import('@/lib/bots/ingest/insertIngestedOffer');
    const [a, b] = await withMachinePendingWritesEnabled(() =>
      Promise.all([
        insertIngestedOffer(validMeta(), baseConfig(), { status: 'pending' }),
        insertIngestedOffer(validMeta(), baseConfig(), { status: 'pending' }),
      ]),
    );
    const oks = [a, b].filter((r) => r.ok).length;
    const dupsOrErr = [a, b].filter((r) => !r.ok).length;
    expect(oks).toBe(1);
    expect(dupsOrErr).toBe(1);
    const loser = [a, b].find((r) => !r.ok);
    expect(loser && 'duplicate' in loser && loser.duplicate).toBe(true);
  });

  it('production mint remains blocked even with writes env ON', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.BOT_INGEST_MACHINE_PENDING_WRITES = 'true';
    const { insertIngestedOffer } = await import('@/lib/bots/ingest/insertIngestedOffer');
    const r = await insertIngestedOffer(validMeta(), baseConfig(), { status: 'pending' });
    expect(r.ok).toBe(false);
    if (!r.ok && 'error' in r) expect(r.error).toMatch(/PRODUCTION|machine_writes|MACHINE/i);
    expect(persistState.calls).toBe(0);
  });
});
