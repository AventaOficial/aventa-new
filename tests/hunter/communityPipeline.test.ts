import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { createOfferInputSchema } from '@/lib/contracts/offers';
import { isDayToDayFlagOn } from '@/lib/hunter/dayToDay';
import { qualifyCandidate } from '@/lib/hunter/dealQualification';
import { HUNTER_METRIC_UNIVERSES } from '@/lib/hunter/metricUniverses';
import { HUNTER_MODULES } from '@/lib/hunter/modules';
import {
  communityPersistStatus,
  evaluateCommunitySubmission,
  getCommunityQualityMetrics,
  recordCommunityDuplicateOnly,
  recordCommunityInvalidUrl,
  resetCommunityQualityMetrics,
  resolveCommunityUrl,
} from '@/lib/hunter/supply';
import { offerRequiresAffiliateValidation } from '@/lib/moderation/approveReadiness';
import { resolveBotInsertPublication } from '@/lib/bots/ingest/resolveBotInsertPublication';
import { strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import { validatePublicOfferUrl } from '@/lib/server/validatePublicOfferUrl';
import { DEAL_VERIFIER_THRESHOLDS } from '@/lib/verifier/thresholds';
import { AUTONOMOUS_POLICY_V1 } from '@/lib/autonomous/policy';
import * as applyToCandidates from '@/lib/hunter/dealQualification/applyToCandidates';
import * as evaluateDealMod from '@/lib/verifier/evaluateDeal';

afterEach(() => {
  resetCommunityQualityMetrics();
  vi.restoreAllMocks();
});

const ML_URL = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-taladro-_JM';
const CHEDRAUI_URL = 'https://www.chedraui.com.mx/te-doblett/p';
const AMAZON_URL = 'https://www.amazon.com.mx/dp/B0TESTASIN';
const UNKNOWN_URL = 'https://www.tienda-desconocida.mx/producto/abc';

function submit(
  over: Partial<Parameters<typeof evaluateCommunitySubmission>[0]> = {},
  opts: Parameters<typeof evaluateCommunitySubmission>[1] = {},
) {
  return evaluateCommunitySubmission(
    {
      title: 'Taladro inalámbrico 20V',
      store: 'Mercado Libre',
      price: 899,
      originalPrice: 1299,
      imageUrl: 'https://http2.mlstatic.com/foto.jpg',
      offerUrl: ML_URL,
      description: 'Descripción del usuario',
      coupons: 'CUPON10',
      ...over,
    },
    opts,
  );
}

function sourceConfirmed(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: ML_URL,
    title: 'Taladro inalámbrico 20V',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/foto.jpg',
    discountPrice: 899,
    originalPrice: 1299,
    discountPercent: 31,
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      discountPercentProvenance: 'derived',
    },
    ...over,
  };
}

describe('FASE 10.1 community quality pipeline', () => {
  it('1. submission entra al pipeline canónico (IngestItem + qualify + verifier)', () => {
    const ev = submit();
    expect(ev.ingestItem.source).toBe('ml_api');
    expect(ev.ingestItem.sourceDetail).toBe('community:paste');
    expect(ev.ingestItem.precomputedMeta).toBeTruthy();
    expect(ev.qualification).toBeTruthy();
    expect(ev.verifierDecision).toBeTruthy();
    expect(communityPersistStatus(ev)).toBe('pending');
    expect(ev.published).toBe(false);
  });

  it('2. source resolution ML / Amazon / genérico', () => {
    expect(resolveCommunityUrl(ML_URL)).toMatchObject({
      ok: true,
      ingestSourceId: 'ml_api',
      hunterSourceId: 'ml_api_legacy',
    });
    expect(resolveCommunityUrl(AMAZON_URL)).toMatchObject({
      ok: true,
      ingestSourceId: 'amazon_asin',
    });
    expect(submit({ offerUrl: UNKNOWN_URL }).hunterSourceId).toBe('env_urls');
    expect(submit({ offerUrl: CHEDRAUI_URL }).resolvedSource).toBe('env_urls');
  });

  it('3. user provenance nunca se eleva a source_explicit', () => {
    const ev = submit();
    expect(ev.currentPriceProvenance).toBe('user_declared');
    expect(ev.originalPriceProvenance).toBe('user_declared');
    expect(ev.ingestItem.precomputedMeta?.signals?.currentPriceProvenance).toBe('user_declared');
    expect(ev.qualification).not.toBe('VERIFIED_DEAL');
  });

  it('4. source provenance gana cuando hay evidencia de fuente', () => {
    const ev = submit({}, { sourceMeta: sourceConfirmed() });
    expect(ev.currentPriceProvenance).toBe('source_explicit');
    expect(ev.originalPriceProvenance).toBe('source_explicit');
    expect(ev.qualification).toBe('VERIFIED_DEAL');
    expect(communityPersistStatus(ev)).toBe('pending');
  });

  it('5. descuento inventado por el usuario no es evidencia de fuente', () => {
    const ev = submit({
      title: 'Oferta falsa 90%',
      price: 100,
      originalPrice: 1000,
      offerUrl: CHEDRAUI_URL,
      store: 'Chedraui',
    });
    expect(ev.qualification).toBe('POTENTIAL_DEAL');
    expect(ev.qualificationReasons).toContain('user_declared_price');
    expect(ev.qualification).not.toBe('VERIFIED_DEAL');
    expect(communityPersistStatus(ev)).toBe('pending');
  });

  it('6. qualification user_declared vs source_explicit', () => {
    const user = qualifyCandidate({
      currentPrice: 100,
      originalPrice: 1000,
      explicitDiscountPercent: 90,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'user_declared',
      originalPriceProvenance: 'user_declared',
      discountPercentProvenance: 'user_declared',
    });
    expect(user.qualification).toBe('POTENTIAL_DEAL');
    expect(user.reasons).toContain('user_declared_price');

    const source = qualifyCandidate({
      currentPrice: 100,
      originalPrice: 1000,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
    });
    expect(source.qualification).toBe('VERIFIED_DEAL');
  });

  it('7. dedupe reutiliza fingerprint existente (sin algoritmo paralelo)', () => {
    const a = strongProductFingerprintForUrl(ML_URL);
    const b = strongProductFingerprintForUrl(`${ML_URL}?utm_source=x`);
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    recordCommunityDuplicateOnly();
    expect(getCommunityQualityMetrics().duplicates).toBe(1);
  });

  it('8. verifier corre y no publica', () => {
    const ev = submit({}, { sourceMeta: sourceConfirmed() });
    expect(ev.verifierDecision).toMatch(/auto_approve|review|reject/);
    expect(ev.verifierScore).toEqual(expect.any(Number));
    expect(ev.published).toBe(false);
    expect(communityPersistStatus(ev)).toBe('pending');
  });

  it('9. fallo del verifier → pending fail-closed', () => {
    vi.spyOn(evaluateDealMod, 'evaluateDealSafe').mockImplementation(() => {
      throw new Error('verifier_boom');
    });
    const ev = submit();
    expect(ev.persistStatus).toBe('pending');
    expect(ev.published).toBe(false);
    expect(ev.qualityError).toBe('verifier_boom');
    expect(getCommunityQualityMetrics().errors).toBe(1);
  });

  it('10. Autonomous shadow observa y no muda status', () => {
    const ev = submit({}, { sourceMeta: sourceConfirmed() });
    expect(ev.autonomousDecision).toBeTruthy();
    expect(communityPersistStatus(ev)).toBe('pending');
    expect(ev.published).toBe(false);
  });

  it('11. reputación no bypasea verifier ni status', () => {
    const ev = submit(
      {},
      {
        reputation: { approved: true, source: 'reputation' },
        sourceMeta: sourceConfirmed(),
      },
    );
    expect(ev.reputationWouldApprove).toBe(true);
    expect(ev.verifierBypassed).toBe(false);
    expect(ev.verifierDecision).toBeTruthy();
    expect(communityPersistStatus(ev)).toBe('pending');
    expect(ev.published).toBe(false);
  });

  it('12. affiliate-less Chedraui entra a pending', () => {
    const ev = submit({
      title: 'Té Doblett 20 sobres 2x1',
      store: 'Chedraui',
      price: 40,
      originalPrice: null,
      offerUrl: CHEDRAUI_URL,
    });
    expect(ev.monetizationStatus).toBe('non_affiliate');
    expect(offerRequiresAffiliateValidation(CHEDRAUI_URL)).toBe(false);
    expect(communityPersistStatus(ev)).toBe('pending');
    expect(ev.published).toBe(false);
  });

  it('13. URL inválida se rechaza en validación pública', () => {
    expect(validatePublicOfferUrl('javascript:alert(1)').ok).toBe(false);
    expect(validatePublicOfferUrl('http://example.com/x').ok).toBe(false);
    expect(validatePublicOfferUrl('not-a-url').ok).toBe(false);
    expect(resolveCommunityUrl('ftp://x.example').ok).toBe(false);
    recordCommunityInvalidUrl();
    expect(getCommunityQualityMetrics().errors).toBe(1);
    expect(getCommunityQualityMetrics().communitySubmissions).toBe(1);
  });

  it('14. retailer desconocido → env_urls genérico', () => {
    const ev = submit({ offerUrl: UNKNOWN_URL, store: 'Tienda X' });
    expect(ev.resolvedSource).toBe('env_urls');
    expect(ev.hunterSourceId).toBe('env_urls');
    expect(communityPersistStatus(ev)).toBe('pending');
  });

  it('15. fallo de enrichment/qualify → pending fail-closed', () => {
    vi.spyOn(applyToCandidates, 'qualifyParsedOfferMetadata').mockImplementation(() => {
      throw new Error('enrichment_failed');
    });
    const ev = submit();
    expect(ev.persistStatus).toBe('pending');
    expect(ev.qualityError).toBe('enrichment_failed');
    expect(ev.published).toBe(false);
  });

  it('16. idempotency: mismo fingerprint para la misma oferta', () => {
    const first = strongProductFingerprintForUrl(ML_URL);
    const second = strongProductFingerprintForUrl(ML_URL);
    expect(first).toBe(second);
  });

  it('17. UX: campos de usuario se conservan en el IngestItem', () => {
    const ev = submit({
      title: 'Título UX',
      description: 'Comentario largo del usuario',
      coupons: 'BANCO20',
      imageUrl: 'https://example.com/cover.jpg',
    });
    expect(ev.ingestItem.precomputedMeta?.title).toBe('Título UX');
    expect(ev.ingestItem.precomputedMeta?.imageUrl).toBe('https://example.com/cover.jpg');
    expect(ev.ingestItem.precomputedMeta?.signals).toBeTruthy();
    const parsed = createOfferInputSchema.safeParse({
      title: 'Título UX',
      store: 'Mercado Libre',
      price: 899,
      original_price: 1299,
      hasDiscount: true,
      image_url: 'https://example.com/cover.jpg',
      description: 'Comentario largo del usuario',
      coupons: 'BANCO20',
      steps: '["uno"]',
      conditions: 'sujeto a existencias',
    });
    expect(parsed.success).toBe(true);
  });

  it('18–20. moderación pending, sin rewards, sin publish', () => {
    const ev = submit();
    expect(ev.persistStatus).toBe('pending');
    expect(ev.rewardsTouched).toBe(false);
    expect(ev.published).toBe(false);
  });

  it('21–22. sin comisiones ni auto-publish', () => {
    const ev = submit({}, { sourceMeta: sourceConfirmed() });
    expect(ev.published).toBe(false);
    expect(ev.rewardsTouched).toBe(false);
    expect(loadBotIngestConfig().legacyAutoApproveWriteEnabled).toBe(false);
  });

  it('23. publisher gate intacto: Chedraui no exige affiliate; insert community es pending', () => {
    expect(offerRequiresAffiliateValidation(CHEDRAUI_URL)).toBe(false);
    expect(typeof offerRequiresAffiliateValidation(ML_URL)).toBe('boolean');
    const ev = submit({ offerUrl: CHEDRAUI_URL, store: 'Chedraui' });
    expect(communityPersistStatus(ev)).toBe('pending');
    expect(
      resolveBotInsertPublication({
        requestedStatus: 'pending',
        offerUrl: CHEDRAUI_URL,
      }).status,
    ).toBe('pending');
  });

  it('24. fail-closed: quality error no aprueba', () => {
    vi.spyOn(evaluateDealMod, 'evaluateDealSafe').mockImplementation(() => {
      throw new Error('closed');
    });
    const ev = submit({}, { reputation: { approved: true, source: 'owner_whitelist' } });
    expect(ev.persistStatus).toBe('pending');
    expect(ev.verifierBypassed).toBe(false);
    expect(ev.published).toBe(false);
  });

  it('métricas communityQuality separadas + flags de producción intactos', () => {
    submit({ price: 100, originalPrice: 1000, title: 'Fake 90' });
    const m = getCommunityQualityMetrics();
    expect(m.communitySubmissions).toBe(1);
    expect(m.potential).toBeGreaterThanOrEqual(1);
    expect(HUNTER_METRIC_UNIVERSES.communityQuality.note).toMatch(/No mezclar/i);
    expect(HUNTER_METRIC_UNIVERSES.communityQuality.persistence).toBe('process_memory');
    expect(HUNTER_MODULES.some((mod) => mod.id === 'community_quality')).toBe(true);
    expect(isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED')).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_BODEGA_ENABLED')).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED')).toBe(false);
    expect(DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap).toBe(85);
    expect(AUTONOMOUS_POLICY_V1.minAutoApproveConfidence).toBe(0.7);
  });

  it('2x1 declarado por usuario es PROMOTION, no VERIFIED_DEAL', () => {
    const ev = submit({
      title: 'Leche Lala 2x1 1L',
      store: 'Chedraui',
      price: 22,
      originalPrice: null,
      offerUrl: CHEDRAUI_URL,
    });
    expect(ev.qualification).toBe('PROMOTION');
    expect(communityPersistStatus(ev)).toBe('pending');
  });
});
