/**
 * CazaOfertasss — BRIDGE-01. ML worker discovery → DealDiscoverySource.
 */

import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  CAZAOFERTAS_FORBIDDEN_IMPORT_PATTERNS,
  buildAffiliateMapping,
  createAffiliateMappingResolver,
  createCazaPipelineRunner,
  createInMemoryAffiliateMappingRepository,
  createInMemoryDealCandidateRepository,
  createInMemoryDealPublicationRepository,
  createMercadoLibreWorkerDiscoverySource,
  extractMercadoLibreExternalIdFromWorkerUrl,
  mapMercadoLibreWorkerCandidateToDealDraft,
  type MercadoLibreWorkerDiscoveryCandidate,
  type TelegramCanaryGate,
} from '@/lib/cazaOfertas';

import { NOW, NOW_ISO } from './fixtures';

const ML_ITEM = 'MLM9876543210';
const ML_URL = `https://www.mercadolibre.com.mx/${ML_ITEM}-slug?wid=${ML_ITEM}`;

function validWorkerCandidate(
  overrides: Partial<MercadoLibreWorkerDiscoveryCandidate> = {}
): MercadoLibreWorkerDiscoveryCandidate {
  return {
    url: ML_URL,
    title: 'Audífonos inalámbricos bridge test',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_bridge.jpg',
    discountPrice: 999,
    originalPrice: 1999,
    discountPercent: 50,
    canonicalUrl: ML_URL,
    sourceDetail: 'seed:ofertas',
    cardDiscountSource: 'card_strikethrough',
    signals: {
      currentPriceProvenance: 'listing_card',
      originalPriceProvenance: 'listing_card',
      discountPercentProvenance: 'derived',
      cardDiscountSource: 'card_strikethrough',
    },
    ...overrides,
  };
}

/**
 * PDP + source_explicit: evidencia fuerte del worker real.
 * card_strikethrough (moderate) puntúa ~64 → REJECT bajo umbrales actuales;
 * el publish path requiere PDP verificado (≥70 GOOD_DEAL).
 */
function publishableWorkerCandidate(
  overrides: Partial<MercadoLibreWorkerDiscoveryCandidate> = {}
): MercadoLibreWorkerDiscoveryCandidate {
  return validWorkerCandidate({
    cardDiscountSource: 'pdp',
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      discountPercentProvenance: 'derived',
      cardDiscountSource: 'pdp',
    },
    ...overrides,
  });
}

const GATE: TelegramCanaryGate = {
  mode: 'canary',
  allowedChannels: ['@cazaofertasss'],
  credentialEnvVar: 'CAZAOFERTAS_TELEGRAM_BOT_TOKEN',
};

describe('BRIDGE-01 mapMercadoLibreWorkerCandidateToDealDraft', () => {
  it('1: candidato ML válido → DealCandidateDraft con provenance preservada', () => {
    const r = mapMercadoLibreWorkerCandidateToDealDraft(validWorkerCandidate(), { now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.store).toBe('mercadolibre_mx');
    expect(r.draft.currentPrice).toBe(999);
    expect(r.draft.referencePrice).toBe(1999);
    expect(r.draft.currency).toBe('MXN');
    expect(r.draft.externalProductId).toBe(ML_ITEM);
    expect(r.identityKey).toBe(`mercadolibre_mx:pid:${ML_ITEM}`);
    expect(r.draft.evidence.source).toBe('store_product_page');
    expect(r.draft.evidence.historicalConfidence).toBe('store_reference_price');
    expect(r.draft.evidence.notes).toContain('card_strikethrough');
    expect(r.draft.evidence.notes).toContain('listing_card');
    expect(r.cardDiscountSource).toBe('card_strikethrough');
  });

  it('2: sin product id en path pero URL canónica válida → identity URL determinista', () => {
    const url = 'https://www.mercadolibre.com.mx/oferta-sin-id-en-path';
    const r = mapMercadoLibreWorkerCandidateToDealDraft(
      validWorkerCandidate({
        url,
        canonicalUrl: url,
        cardDiscountSource: 'pdp',
        signals: {
          currentPriceProvenance: 'source_explicit',
          originalPriceProvenance: 'source_explicit',
          cardDiscountSource: 'pdp',
        },
      }),
      { now: NOW }
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.externalProductId).toBeNull();
    expect(r.identityKey).toMatch(/^mercadolibre_mx:url:/);
    const again = mapMercadoLibreWorkerCandidateToDealDraft(
      validWorkerCandidate({
        url,
        canonicalUrl: url,
        cardDiscountSource: 'pdp',
        signals: {
          currentPriceProvenance: 'source_explicit',
          originalPriceProvenance: 'source_explicit',
          cardDiscountSource: 'pdp',
        },
      }),
      { now: NOW }
    );
    expect(again.ok && again.identityKey).toBe(r.identityKey);
  });

  it('3: precio actual inválido → reject', () => {
    const r = mapMercadoLibreWorkerCandidateToDealDraft(
      validWorkerCandidate({ discountPrice: -1 }),
      { now: NOW }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasonCode).toBe('bridge.current_price_invalid');
  });

  it('4: originalPrice inválido / ausente → reject', () => {
    const missing = mapMercadoLibreWorkerCandidateToDealDraft(
      validWorkerCandidate({ originalPrice: null }),
      { now: NOW }
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reasonCode).toBe('bridge.evidence_insufficient');

    const bad = mapMercadoLibreWorkerCandidateToDealDraft(
      validWorkerCandidate({ originalPrice: 0 }),
      { now: NOW }
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reasonCode).toBe('bridge.reference_price_invalid');
  });

  it('5: badge_reconstructed → no inventar evidence (reject)', () => {
    const r = mapMercadoLibreWorkerCandidateToDealDraft(
      validWorkerCandidate({
        cardDiscountSource: 'badge_reconstructed',
        signals: {
          cardDiscountSource: 'badge_reconstructed',
          originalPriceProvenance: 'unknown',
        },
      }),
      { now: NOW }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasonCode).toBe('bridge.evidence_badge_only');
  });

  it('6: URL no https → reject', () => {
    const r = mapMercadoLibreWorkerCandidateToDealDraft(
      validWorkerCandidate({
        url: 'http://www.mercadolibre.com.mx/x',
        canonicalUrl: 'javascript:alert(1)',
      }),
      { now: NOW }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasonCode).toBe('bridge.url_invalid');
  });

  it('7–9: source/provenance, currency, product id preservados', () => {
    const r = mapMercadoLibreWorkerCandidateToDealDraft(
      validWorkerCandidate({
        cardDiscountSource: 'pdp',
        signals: {
          currentPriceProvenance: 'source_explicit',
          originalPriceProvenance: 'source_explicit',
          cardDiscountSource: 'pdp',
        },
      }),
      { now: NOW, observedAt: NOW_ISO }
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.currency).toBe('MXN');
    expect(r.draft.evidence.currency).toBe('MXN');
    expect(r.draft.evidence.capturedAt).toBe(NOW_ISO);
    expect(r.externalProductId).toBe(ML_ITEM);
    expect(r.originalPriceProvenance).toBe('source_explicit');
    expect(r.draft.evidence.priceConfidence).toBe('verified');
  });

  it('10: discountPercent del worker NO se copia como autoridad (evidence decide claim)', () => {
    const r = mapMercadoLibreWorkerCandidateToDealDraft(
      validWorkerCandidate({ discountPercent: 99 }),
      { now: NOW }
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Draft no tiene discountPercent — lo calcula candidate/evidence.
    expect(r.draft).not.toHaveProperty('discountPercent');
    expect(r.draft.currentPrice).toBe(999);
    expect(r.draft.referencePrice).toBe(1999);
  });

  it('11: replay → mismo identity key', () => {
    const a = mapMercadoLibreWorkerCandidateToDealDraft(validWorkerCandidate(), { now: NOW });
    const b = mapMercadoLibreWorkerCandidateToDealDraft(validWorkerCandidate(), {
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.identityKey).toBe(b.identityKey);
  });

  it('extract wid /up/MLMU desde URL worker', () => {
    expect(extractMercadoLibreExternalIdFromWorkerUrl(ML_URL)).toBe(ML_ITEM);
    expect(
      extractMercadoLibreExternalIdFromWorkerUrl(
        'https://www.mercadolibre.com.mx/producto/up/MLMU1234567890'
      )
    ).toBe('MLMU1234567890');
  });
});

describe('BRIDGE-01 DealDiscoverySource + pipeline', () => {
  it('12: bounded batch — página respeta limit; oversized batch reject completo', async () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      validWorkerCandidate({
        url: `https://www.mercadolibre.com.mx/MLM${1000000000 + i}-x?wid=MLM${1000000000 + i}`,
        canonicalUrl: `https://www.mercadolibre.com.mx/MLM${1000000000 + i}-x?wid=MLM${1000000000 + i}`,
        title: `Item ${i}`,
      })
    );
    const source = createMercadoLibreWorkerDiscoverySource({
      candidates: many,
      clock: () => NOW,
    });
    expect(source.bridgeReport.accepted).toBe(5);
    const page = await source.discover({ limit: 2 });
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.value.items).toHaveLength(2);
    expect(page.value.nextCursor).toBe('2');
    expect(page.value.source).toBe('ml_worker:bridge');

    const over = createMercadoLibreWorkerDiscoverySource({
      candidates: Array.from({ length: 3 }, (_, i) =>
        validWorkerCandidate({
          url: `https://www.mercadolibre.com.mx/MLM${2000000000 + i}-x?wid=MLM${2000000000 + i}`,
          canonicalUrl: `https://www.mercadolibre.com.mx/MLM${2000000000 + i}-x?wid=MLM${2000000000 + i}`,
        })
      ),
      maxItems: 2,
      clock: () => NOW,
    });
    expect(over.bridgeReport.accepted).toBe(0);
    expect(over.bridgeReport.rejected).toBe(3);
    expect(over.bridgeReport.rejectReasonCounts['bridge.batch_limit_exceeded']).toBe(3);
  });

  it('13: candidatos basura no rompen el ciclo — se rechazan y el source sigue', async () => {
    const source = createMercadoLibreWorkerDiscoverySource({
      candidates: [
        validWorkerCandidate({ discountPrice: -5, title: 'bad' }),
        validWorkerCandidate(),
      ],
      clock: () => NOW,
    });
    expect(source.bridgeReport).toMatchObject({ received: 2, accepted: 1, rejected: 1 });
    const page = await source.discover({ limit: 10 });
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.value.items).toHaveLength(1);
  });

  it('14: sin affiliate mapping → discover/validate OK, no publica monetizable', async () => {
    const source = createMercadoLibreWorkerDiscoverySource({
      candidates: [publishableWorkerCandidate()],
      clock: () => NOW,
    });
    const resolver = createAffiliateMappingResolver(createInMemoryAffiliateMappingRepository(), {
      clock: () => NOW,
    });
    const bot = {
      calls: 0,
      async sendMessage() {
        this.calls += 1;
        return { ok: true, messageId: '1', chatId: '@cazaofertasss' };
      },
    };
    const runner = createCazaPipelineRunner({
      sources: [source],
      candidateRepository: createInMemoryDealCandidateRepository(),
      publicationRepository: createInMemoryDealPublicationRepository(),
      bot,
      gate: GATE,
      telegramChannel: '@cazaofertasss',
      affiliateResolver: resolver,
      clock: () => NOW,
    });
    const result = await runner.runCycle({ mode: 'full' });
    expect(result.discovered).toBe(1);
    expect(result.validated).toBeGreaterThanOrEqual(1);
    expect(result.stages.find((s) => s.stage === 'SCORE')?.successCount).toBe(1);
    expect(result.stages.find((s) => s.stage === 'AFFILIATE')?.reasonCodes['affiliate_mapping.not_found']).toBe(
      1
    );
    expect(result.affiliateEligible).toBe(0);
    expect(result.published).toBe(0);
    expect(bot.calls).toBe(0);
  });

  it('15: mapping válido → puede PREPARE/PUBLISH', async () => {
    const candidate = publishableWorkerCandidate();
    const mapped = mapMercadoLibreWorkerCandidateToDealDraft(candidate, { now: NOW });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;

    const mappings = createInMemoryAffiliateMappingRepository();
    const built = buildAffiliateMapping(
      {
        store: 'mercadolibre_mx',
        externalProductId: mapped.externalProductId,
        canonicalUrl: mapped.draft.url,
        affiliateUrl: `${mapped.draft.url}${mapped.draft.url.includes('?') ? '&' : '?'}matt_word=cazaofertasss`,
      },
      { now: NOW }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    await mappings.upsert(built.value);

    const source = createMercadoLibreWorkerDiscoverySource({
      candidates: [candidate],
      clock: () => NOW,
    });
    const bot = {
      calls: 0,
      async sendMessage(input: { chatId: string }) {
        this.calls += 1;
        return { ok: true, messageId: String(7000 + this.calls), chatId: input.chatId };
      },
    };
    const runner = createCazaPipelineRunner({
      sources: [source],
      candidateRepository: createInMemoryDealCandidateRepository(),
      publicationRepository: createInMemoryDealPublicationRepository(),
      bot,
      gate: GATE,
      telegramChannel: '@cazaofertasss',
      affiliateResolver: createAffiliateMappingResolver(mappings, { clock: () => NOW }),
      clock: () => NOW,
    });
    const result = await runner.runCycle({ mode: 'full' });
    expect(result.stages.find((s) => s.stage === 'SCORE')?.reasonCodes['score.grade:GOOD_DEAL']).toBe(1);
    expect(result.affiliateEligible).toBe(1);
    expect(result.prepared).toBe(1);
    expect(result.published).toBe(1);
    expect(bot.calls).toBe(1);
  });
});

describe('BRIDGE-01 isolation + structural', () => {
  const FILE = path.resolve(
    __dirname,
    '../../lib/cazaOfertas/integrations/mercadoLibreWorkerBridge.ts'
  );

  it('16: no importa rewards/economy/payout/settlement', () => {
    const src = fs.readFileSync(FILE, 'utf8');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const target = m[1];
      expect(CAZAOFERTAS_FORBIDDEN_IMPORT_PATTERNS.some((p) => target.includes(p))).toBe(false);
      expect(target).not.toMatch(/bots\/ingest|hunter\/|playwright|puppeteer/);
    }
    expect(src).not.toMatch(/creator_rewards|payout_intents|affiliate_ledger/i);
  });

  it('17: no Playwright / fetch / HTTP client en el bridge', () => {
    const src = fs.readFileSync(FILE, 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/playwright|puppeteer|chromium|http\.request|axios|got\(/i);
    expect(src).not.toMatch(/from\s+['"]node:https?['"]/);
  });
});
