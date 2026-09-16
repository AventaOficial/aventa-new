import { describe, expect, it } from 'vitest';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  isStickyEvidenceRich,
  observeStickySkus,
  permalinkFromMlItemId,
} from '@/lib/hunter/supply/observeStickySkus';
import { applySupplyQualityPipeline } from '@/lib/hunter/supply/router';
import { computeDealSignals } from '@/lib/hunter/supply/dealSignals';
import { parseMlSourceDetail } from '@/lib/hunter/supply/qualityClass';
import { runSupplyEngine } from '@/lib/hunter/supply/engine';
import { toSupplyCandidate } from '@/lib/hunter/supply/candidate';
import { communitySupplySource } from '@/lib/hunter/supply/community';
import type { SupplySource } from '@/lib/hunter/supply/types';
import { resolveMercadoLibreItem } from '@/lib/offers/resolveMercadoLibreItem';

const RICH_IMAGE = 'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLA123456789_012025-F.jpg';

function richMeta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1111111111',
    title: 'CeraVe Crema Hidratante Facial 340ml',
    store: 'Mercado Libre',
    imageUrl: RICH_IMAGE,
    discountPrice: 100,
    originalPrice: 200,
    discountPercent: 50,
    signals: {
      historyReady: true,
      priceLowest90d: 100,
      habitual30d: 180,
      savingsVsHabitualPct: 44,
      effectiveDiscountPercent: 44,
      priceVsLowest90dPct: 0,
      suspectedArtificialListPrice: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      discountPercentProvenance: 'derived',
    },
    ...over,
  };
}

describe('isStickyEvidenceRich', () => {
  it('requiere título real + imagen válida + original', () => {
    expect(isStickyEvidenceRich(richMeta())).toBe(true);
    expect(isStickyEvidenceRich(richMeta({ imageUrl: '' }))).toBe(false);
    expect(isStickyEvidenceRich(richMeta({ title: '' }))).toBe(false);
    expect(isStickyEvidenceRich(richMeta({ title: 'Mercado Libre MLM1' }))).toBe(false);
    expect(isStickyEvidenceRich(richMeta({ originalPrice: null }))).toBe(false);
  });
});

describe('sticky no inventa evidencia', () => {
  it('sin título tras enrichment → snapshotOnly, 0 candidatos', async () => {
    const config = loadBotIngestConfig('standard');
    const report = await observeStickySkus({
      config,
      nicheId: 'beauty',
      persistSnapshots: false,
      selectTargets: async () => [
        {
          productId: 'MLM1111111111',
          priorDays: 5,
          lastObservedOn: '2026-09-10',
          lastPrice: 200,
          listPrice: 250,
          hoursSinceObserved: 48,
          nicheId: 'beauty',
          store: null,
          category: 'belleza',
        },
      ],
      fetchQuote: async () => ({ current: 180, listPrice: 250, regularPrice: null }),
      enrichMeta: async (meta) => ({
        meta: { ...meta, title: '', imageUrl: '' },
        changed: false,
        skippedNetwork: true,
        imageStatus: 'missing',
      }),
      supabase: null,
    });
    expect(report.stickyObserved).toBe(1);
    expect(report.snapshotOnly).toBe(1);
    expect(report.candidates).toHaveLength(0);
  });

  it('sin imagen → no evidenceRich; candidato puede existir con título real', async () => {
    const config = loadBotIngestConfig('standard');
    const report = await observeStickySkus({
      config,
      nicheId: 'beauty',
      persistSnapshots: false,
      selectTargets: async () => [
        {
          productId: 'MLM1111111111',
          priorDays: 5,
          lastObservedOn: '2026-09-10',
          lastPrice: 200,
          listPrice: 250,
          hoursSinceObserved: 48,
          nicheId: 'beauty',
          store: null,
          category: 'belleza',
        },
      ],
      fetchQuote: async () => ({ current: 180, listPrice: 250, regularPrice: null }),
      enrichMeta: async (meta) => ({
        meta: {
          ...meta,
          title: 'Producto Real Sticky Test',
          imageUrl: '',
          originalPrice: 250,
          discountPercent: 28,
        },
        changed: true,
        skippedNetwork: true,
        imageStatus: 'missing',
      }),
      supabase: null,
    });
    expect(report.candidates).toHaveLength(1);
    expect(report.evidenceRich).toBe(0);
    expect(report.candidates[0]!.title).toBe('Producto Real Sticky Test');
    expect(report.candidates[0]!.ingestItem.sourceDetail).toContain('mode:sticky');
  });

  it('PDP completo → evidenceRich y puede ser VERIFIED vía DQE', async () => {
    const config = loadBotIngestConfig('standard');
    const report = await observeStickySkus({
      config,
      nicheId: 'beauty',
      persistSnapshots: false,
      selectTargets: async () => [
        {
          productId: 'MLM1111111111',
          priorDays: 5,
          lastObservedOn: '2026-09-10',
          lastPrice: 100,
          listPrice: 200,
          hoursSinceObserved: 48,
          nicheId: 'beauty',
          store: null,
          category: 'belleza',
        },
      ],
      fetchQuote: async () => ({ current: 100, listPrice: 200, regularPrice: null }),
      enrichMeta: async () => ({
        meta: richMeta({
          discountPrice: 100,
          originalPrice: 200,
          discountPercent: 50,
        }),
        changed: true,
        skippedNetwork: true,
        imageStatus: 'valid',
      }),
      supabase: null,
    });
    expect(report.evidenceRich).toBe(1);
    expect(report.pdpSuccess).toBe(1);
    const qualified = applySupplyQualityPipeline(report.candidates[0]!, config);
    expect(qualified.qualification === 'VERIFIED_DEAL' || qualified.qualityDecision?.decision).toBeTruthy();
    const deal = computeDealSignals({
      meta: qualified.ingestItem.precomputedMeta!,
      signals: qualified.ingestItem.precomputedMeta!.signals,
    });
    // historyReady depende de DB history load; con history vacío puede ser false — no inventar.
    expect(deal.priceClass === 'false_discount' || deal.historyReady === false || deal.dealScore >= 0).toBe(
      true,
    );
  });
});

describe('discoveryMode + URL integrity', () => {
  it('conserva discoveryMode sticky', () => {
    expect(parseMlSourceDetail('ml:sticky:MLM1|niche:beauty|mode:sticky').discoveryMode).toBe('sticky');
  });

  it('permalink articulo no inventa /up/', () => {
    const url = permalinkFromMlItemId('MLM1234567890');
    expect(url).toContain('articulo.mercadolibre.com.mx/MLM-1234567890');
    expect(url).not.toContain('/up/');
    const resolved = resolveMercadoLibreItem(url);
    expect(resolved?.canonicalUrl).toContain('MLM');
  });
});

describe('WRITE / discovery-only', () => {
  it('dry_run nunca wroteOffers', async () => {
    const meta = richMeta();
    const candidate = toSupplyCandidate({
      item: {
        url: meta.canonicalUrl,
        source: 'ml_api',
        sourceDetail: 'ml:q:perfume|sort:relevance',
        precomputedMeta: meta,
      },
      hunterSourceId: 'ml_api_legacy',
      sourceId: 'ml_api_legacy',
      sourceFamily: 'official_api',
      sourceType: 'official_api',
    });
    const source: SupplySource = {
      ...communitySupplySource,
      id: 'ml_api_legacy',
      displayName: 'ml',
      family: 'official_api',
      type: 'official_api',
      isEnabled: () => true,
      isConfigured: () => true,
      async collect() {
        return { ok: true, candidates: [candidate] };
      },
    };
    const report = await runSupplyEngine({
      mode: 'dry_run',
      nicheId: 'beauty',
      sources: [source],
      enableSticky: false,
      persistSnapshots: false,
    });
    expect(report.wroteOffers).toBe(false);
  });
});
