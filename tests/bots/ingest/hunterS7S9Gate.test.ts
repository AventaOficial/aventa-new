/**
 * P0 closure: S7/S9 cannot mint pending without S6.1 evaluateMachineCandidateGate.
 * Does NOT change gate thresholds / historyReady / DQE rules.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  evaluateS7BridgeS61Gate,
  writePendingViaS7Bridge,
} from '@/lib/supply/s7Bridge';
import { buildHunterDecisionTrace } from '@/lib/bots/ingest/hunterDecisionTrace';
import { withMachinePendingWritesEnabled } from '@/lib/bots/ingest/machineInsertCanary';
import { evaluateMachineLiveInsertEligibility } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import { evaluateDealQualityFromParsedMeta } from '@/lib/hunter/dealQuality';

const ROOT = process.cwd();

vi.mock('@/lib/bots/ingest/insertIngestedOffer', () => ({
  insertIngestedOffer: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  }),
}));

vi.mock('@/lib/discovery/negativeMemory', () => ({
  isSuppressedByNegativeMemory: async () => ({ suppressed: false }),
}));

import { insertIngestedOffer } from '@/lib/bots/ingest/insertIngestedOffer';

function baseConfig(): BotIngestConfig {
  return {
    profile: 'standard',
    enabled: true,
    botUserId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    botUserIdTech: null,
    botUserIdStaples: null,
    botAuthorDualMode: false,
    botUserIdsForQuota: ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'],
    minDiscountPercent: 20,
    rejectBelowScore: 40,
    titleMinLength: 12,
    titleBlocklistGenericRe: null,
    techCategoryIdSet: new Set(['MLM1648']),
  } as unknown as BotIngestConfig;
}

/** Blocked: artificial list / no verified history — BAD path. */
function blockedMeta(): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1111111111-blocked',
    title: 'Scooter Eléctrico Oferta Inflada Mercado Libre MX Test',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_x.jpg',
    discountPrice: 3300,
    originalPrice: 10000,
    discountPercent: 67,
    signals: {
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
      historyReady: false,
      suspectedArtificialListPrice: true,
      effectiveDiscountPercent: 0,
      samples90d: 1,
    },
  };
}

/** Insufficient evidence — fail closed / UNCERTAIN. */
function missingSignalsMeta(): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-2222222222-partial',
    title: 'Producto Parcial Sin Historial Suficiente Para Mint MX',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_x.jpg',
    discountPrice: 229,
    originalPrice: 399,
    discountPercent: 43,
    signals: {
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
      historyReady: false,
      suspectedArtificialListPrice: false,
      samples90d: 1,
    },
  };
}

/**
 * Mintable when DQE + S6.1 agree: source_explicit + historyReady + verified discount.
 * Uses real gate evaluation (no forged wouldInsert).
 */
function validMeta(): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-3333333333-valid',
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

describe('P0 S7/S9 → S6.1 gate closure', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    vi.mocked(insertIngestedOffer).mockReset();
    process.env = {
      ...prev,
      NODE_ENV: 'test',
      VERCEL_ENV: 'preview',
      BOT_INGEST_MACHINE_PENDING_WRITES: '1',
    };
    delete process.env.MONEY_PATH_FROZEN;
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.restoreAllMocks();
  });

  it('A — blocked candidate → S61_BLOCKED → NO insertIngestedOffer', async () => {
    const meta = blockedMeta();
    const { live, hunterDecisionTrace } = evaluateS7BridgeS61Gate({
      meta,
      config: baseConfig(),
    });
    expect(live.wouldInsert).toBe(false);
    expect(hunterDecisionTrace.finalLabel).not.toBe('GOOD');

    const r = await withMachinePendingWritesEnabled(() =>
      writePendingViaS7Bridge({
        config: baseConfig(),
        meta,
        requireDedicatedAuthor: false,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && 'code' in r) expect(r.code).toBe('S61_BLOCKED');
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
  });

  it('B — valid candidate → wouldInsert → insertIngestedOffer called once', async () => {
    const meta = validMeta();
    const { live, hunterDecisionTrace } = evaluateS7BridgeS61Gate({
      meta,
      config: baseConfig(),
    });
    expect(live.wouldInsert).toBe(true);
    expect(live.eligible).toBe(true);
    expect(hunterDecisionTrace.finalLabel).toBe('GOOD');

    vi.mocked(insertIngestedOffer).mockResolvedValue({
      ok: true,
      offerId: 'offer-s7-gated-1',
    });

    const r = await withMachinePendingWritesEnabled(() =>
      writePendingViaS7Bridge({
        config: baseConfig(),
        meta,
        requireDedicatedAuthor: false,
      }),
    );
    expect(r.ok).toBe(true);
    expect(vi.mocked(insertIngestedOffer)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(insertIngestedOffer)).toHaveBeenCalledWith(
      meta,
      expect.anything(),
      expect.objectContaining({
        status: 'pending',
        gate: expect.objectContaining({ wouldInsert: true }),
      }),
    );
  });

  it('C — replay: second attempt does not create another pending (duplicate)', async () => {
    const meta = validMeta();
    vi.mocked(insertIngestedOffer)
      .mockResolvedValueOnce({ ok: true, offerId: 'offer-s7-gated-1' })
      .mockResolvedValueOnce({
        ok: false,
        duplicate: true,
        duplicateKind: 'exact_url',
      });

    const first = await withMachinePendingWritesEnabled(() =>
      writePendingViaS7Bridge({
        config: baseConfig(),
        meta,
        requireDedicatedAuthor: false,
      }),
    );
    const second = await withMachinePendingWritesEnabled(() =>
      writePendingViaS7Bridge({
        config: baseConfig(),
        meta,
        requireDedicatedAuthor: false,
      }),
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok && 'duplicate' in second) expect(second.duplicate).toBe(true);
    expect(vi.mocked(insertIngestedOffer)).toHaveBeenCalledTimes(2);
  });

  it('D — missing critical evidence → FAIL CLOSED → NO pending', async () => {
    const meta = missingSignalsMeta();
    const { live, hunterDecisionTrace } = evaluateS7BridgeS61Gate({
      meta,
      config: baseConfig(),
    });
    expect(live.wouldInsert).toBe(false);
    expect(hunterDecisionTrace.historicalBaseline).toBe('INSUFFICIENT_HISTORY');

    const r = await withMachinePendingWritesEnabled(() =>
      writePendingViaS7Bridge({
        config: baseConfig(),
        meta,
        requireDedicatedAuthor: false,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && 'code' in r) expect(r.code).toBe('S61_BLOCKED');
    if (!r.ok && 'hunterDecisionTrace' in r && r.hunterDecisionTrace) {
      expect(r.hunterDecisionTrace.s61Decision).toBeTruthy();
      expect(r.hunterDecisionTrace.finalLabel).not.toBe('GOOD');
    }
    expect(vi.mocked(insertIngestedOffer)).not.toHaveBeenCalled();
  });

  it('E — bypass regression: bridge must call S6.1 before insertIngestedOffer', () => {
    const bridge = readFileSync(
      resolve(ROOT, 'lib/supply/s7Bridge/writePendingViaS7Bridge.ts'),
      'utf8',
    );
    expect(bridge).toMatch(/evaluateMachineLiveInsertEligibility|evaluateS7BridgeS61Gate/);
    expect(bridge).toMatch(/evaluateMachineCandidateGate|evaluateMachineLiveInsertEligibility/);
    expect(bridge).toMatch(/insertIngestedOffer/);
    const gateIdx = Math.min(
      bridge.indexOf('evaluateS7BridgeS61Gate'),
      bridge.indexOf('evaluateMachineLiveInsertEligibility') >= 0
        ? bridge.indexOf('evaluateMachineLiveInsertEligibility')
        : Number.MAX_SAFE_INTEGER,
    );
    const insertIdx = bridge.lastIndexOf('insertIngestedOffer');
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThan(gateIdx);

    const writer = readFileSync(
      resolve(ROOT, 'lib/bots/ingest/insertIngestedOffer.ts'),
      'utf8',
    );
    expect(writer).toMatch(/evaluateMachineLiveInsertEligibility/);
    expect(writer).toMatch(/S61_BLOCKED|s61_blocked/);
  });
});

describe('P0 write-path inventory — ungated machine writers = 0', () => {
  it('every insertIngestedOffer caller is gated (bridge or externalWorker or writer itself)', () => {
    function walk(dir: string, out: string[] = []): string[] {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
      }
      return out;
    }

    const callRe = /insertIngestedOffer\s*\(/;
    const files = [...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'app'))];
    const callers: string[] = [];
    for (const abs of files) {
      const rel = relative(ROOT, abs).replace(/\\/g, '/');
      if (rel === 'lib/bots/ingest/insertIngestedOffer.ts') continue;
      const text = readFileSync(abs, 'utf8');
      if (callRe.test(text)) callers.push(rel);
    }

    // Allowed machine mint orchestrators:
    const allowed = new Set([
      'lib/bots/ingest/externalWorker.ts', // S6.1 before call + writer re-check
      'lib/supply/s7Bridge/writePendingViaS7Bridge.ts', // S6.1 before call + writer re-check
    ]);

    const unexpected = callers.filter((c) => !allowed.has(c));
    expect(unexpected, `Ungated or unexpected callers: ${unexpected.join(', ')}`).toEqual([]);

    // Both allowed callers must reference S6.1 eligibility
    for (const rel of allowed) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      expect(text).toMatch(/evaluateMachineLiveInsertEligibility|evaluateS7BridgeS61Gate/);
    }
  });

  it('writer-boundary S6.1 matches bridge authority (same gate function)', () => {
    const meta = blockedMeta();
    const config = baseConfig();
    const bridge = evaluateS7BridgeS61Gate({ meta, config });
    const dqe = evaluateDealQualityFromParsedMeta(meta, { source: 's9_supply_automation' });
    const writerStyle = evaluateMachineLiveInsertEligibility({
      url: meta.canonicalUrl,
      meta,
      config,
      verifierDecision: 'pending',
      verifierReasons: [],
      duplicate: null,
      dealScore: null,
      dealQuality: dqe,
    });
    expect(writerStyle.wouldInsert).toBe(bridge.live.wouldInsert);
    expect(writerStyle.qualityDecision).toBe(bridge.live.qualityDecision);
    const trace = buildHunterDecisionTrace({
      meta,
      gate: writerStyle.gate,
      dealQuality: dqe,
    });
    expect(trace.finalLabel).not.toBe('GOOD');
  });
});
