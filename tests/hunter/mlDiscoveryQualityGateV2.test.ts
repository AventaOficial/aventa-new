import { describe, expect, it } from 'vitest';
import {
  candidateFromCard,
  isBadgeReconstructedOriginal,
  selectShortlist,
  scoreShortlistCandidate,
  workerCandidateEligibleForIngest,
} from '../../workers/mercadolibre-worker/src/ml.mjs';
import {
  isBadgeOnlyCardEvidence,
  mlWorkerMayInsertPending,
} from '@/lib/bots/ingest/mlWorkerPendingGate';
import { evaluateDealQuality } from '@/lib/hunter/dealQuality';
import { qualifyCandidate } from '@/lib/hunter/dealQualification';

describe('ML Discovery Quality Gate V2', () => {
  it('1. card badge alone is shortlisted as badge_reconstructed, not ingest-eligible', () => {
    const parsed = candidateFromCard(
      {
        href: 'https://www.mercadolibre.com.mx/algo/p/MLM123456789?wid=MLM123456789',
        title: 'Audífonos Bluetooth Inalámbricos Marca Ejemplo',
        image: 'https://http2.mlstatic.com/D_NQ_NP_2X_123-MLA.jpg',
        priceText: '500',
        originalText: '',
        discountBadge: '40% OFF',
      },
      15,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.candidate.cardDiscountSource).toBe('badge_reconstructed');
    expect(parsed.candidate.originalFromBadgeOnly).toBe(true);
    expect(isBadgeReconstructedOriginal(parsed.candidate)).toBe(true);
    expect(workerCandidateEligibleForIngest(parsed.candidate).ok).toBe(false);
    expect(workerCandidateEligibleForIngest(parsed.candidate).reason).toBe(
      'badge_nominal_insufficient',
    );
  });

  it('2. valid PDP evidence (original) is ingest-eligible', () => {
    const gate = workerCandidateEligibleForIngest({
      discountPrice: 800,
      originalPrice: 1200,
      discountPercent: 33,
      cardDiscountSource: 'pdp',
      evidenceSource: 'pdp',
      originalFromBadgeOnly: false,
    });
    expect(gate.ok).toBe(true);
    expect(gate.reason).toBe('pdp_original');
  });

  it('3. PDP unavailable does not fabricate badge original into eligibility', () => {
    const gate = workerCandidateEligibleForIngest({
      discountPrice: 500,
      originalPrice: 833.33,
      discountPercent: 40,
      cardDiscountSource: 'badge_reconstructed',
      originalFromBadgeOnly: true,
      // sin evidenceSource pdp
    });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('badge_nominal_insufficient');
  });

  it('4. Price Memory / QE can rescue badge shortlist on server gate', () => {
    const q = qualifyCandidate({
      currentPrice: 800,
      originalPrice: null,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
    });
    const quality = evaluateDealQuality({
      title: 'Producto con historial',
      currentPrice: 800,
      qualification: q,
      priceMemory: {
        historyReady: true,
        savingsVsHabitualPct: 22,
        priceVsLowest90dPct: 1,
        suspectedArtificialListPrice: false,
      },
    });
    expect(quality.decision).toBe('POTENTIAL_DEAL');
    const gate = mlWorkerMayInsertPending({
      qualityDecision: quality.decision,
      recommendedAction: quality.recommendedAction,
      cardDiscountSource: 'badge_reconstructed',
    });
    expect(gate.allow).toBe(true);
    expect(gate.reason).toBe('badge_shortlist_rescued_by_quality');
  });

  it('5. artificial / discard remains blocked on server gate', () => {
    const gate = mlWorkerMayInsertPending({
      qualityDecision: 'NO_VERIFIED_DEAL',
      recommendedAction: 'DISCARD',
      cardDiscountSource: 'card_strikethrough',
    });
    expect(gate.allow).toBe(false);
    expect(gate.reason).toBe('card_strikethrough_insufficient');
  });

  it('6. effective discount stays distinct from nominal in QE signals', () => {
    const quality = evaluateDealQuality({
      title: 'TV ejemplo',
      currentPrice: 5000,
      originalPrice: 10000,
      cardDiscountSource: 'card_strikethrough',
      qualificationInput: {
        currentPrice: 5000,
        originalPrice: 10000,
        explicitDiscountPercent: null,
        explicitSavings: null,
        promotionKind: null,
        promotionBoundToProduct: false,
        currentPriceProvenance: 'source_explicit',
        originalPriceProvenance: 'listing_card',
        discountPercentProvenance: 'derived',
      },
      priceMemory: {
        historyReady: true,
        effectiveDiscountPercent: 0,
        suspectedArtificialListPrice: true,
        savingsVsHabitualPct: 0,
      },
    });
    expect(quality.negativeSignals).toContain('artificial_list_price');
    expect(quality.decision).not.toBe('VERIFIED_DEAL');
  });

  it('7. strong provenance without weak listing remains VERIFIED', () => {
    const q = qualifyCandidate({
      currentPrice: 1000,
      originalPrice: 1500,
      explicitDiscountPercent: 33,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
      discountPercentProvenance: 'source_explicit',
    });
    expect(q.qualification).toBe('VERIFIED_DEAL');
    const quality = evaluateDealQuality({
      title: 'Silla',
      currentPrice: 1000,
      originalPrice: 1500,
      qualification: q,
    });
    expect(quality.decision).toBe('VERIFIED_DEAL');
    expect(quality.qualification).toBe('VERIFIED_DEAL');
  });

  it('8. Quality Engine remains authoritative for pending orchestration', () => {
    const allow = mlWorkerMayInsertPending({
      qualityDecision: 'VERIFIED_DEAL',
      recommendedAction: 'PUBLISH_CANDIDATE',
      cardDiscountSource: 'pdp',
    });
    expect(allow.allow).toBe(true);
    const denyBadge = mlWorkerMayInsertPending({
      qualityDecision: 'NO_VERIFIED_DEAL',
      recommendedAction: 'DISCARD',
      cardDiscountSource: 'badge_reconstructed',
    });
    expect(denyBadge.allow).toBe(false);
    expect(isBadgeOnlyCardEvidence('badge_reconstructed')).toBe(true);
    const denyStrike = mlWorkerMayInsertPending({
      qualityDecision: 'NO_VERIFIED_DEAL',
      recommendedAction: 'DISCARD',
      cardDiscountSource: 'card_strikethrough',
    });
    expect(denyStrike.allow).toBe(false);
  });

  it('9. shortlist limits PDP work (selectShortlist cap)', () => {
    const pool = Array.from({ length: 20 }, (_, i) => ({
      discountPrice: 100 + i,
      discountPercent: 10 + i,
      nominalDiscountPercent: 10 + i,
      cardDiscountSource: i % 2 === 0 ? 'badge_reconstructed' : 'card_strikethrough',
      canonicalUrl: `https://www.mercadolibre.com.mx/p/MLM${i}`,
    }));
    const short = selectShortlist(pool, 5);
    expect(short).toHaveLength(5);
    // Strikethrough + higher nominal should rank first.
    expect(scoreShortlistCandidate(short[0]!)).toBeGreaterThanOrEqual(
      scoreShortlistCandidate(short[short.length - 1]!),
    );
  });

  it('10. card strikethrough keeps image/url and is ingest-eligible without badge', () => {
    const parsed = candidateFromCard(
      {
        href: 'https://www.mercadolibre.com.mx/producto-test/p/MLM987654321?wid=MLM987654321',
        title: 'Licuadora Oster Modelo Ejemplo 600W',
        image: 'https://http2.mlstatic.com/D_NQ_NP_2X_999-MLA.jpg',
        priceText: '799',
        originalText: '1299',
        discountBadge: '',
      },
      15,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.candidate.cardDiscountSource).toBe('card_strikethrough');
    expect(parsed.candidate.imageUrl).toContain('mlstatic');
    expect(parsed.candidate.canonicalUrl).toContain('MLM987654321');
    expect(isBadgeReconstructedOriginal(parsed.candidate)).toBe(false);
    expect(workerCandidateEligibleForIngest(parsed.candidate).ok).toBe(true);
  });

  it('11. fingerprint/url identity preserved on shortlist candidate', () => {
    const parsed = candidateFromCard(
      {
        href: 'https://www.mercadolibre.com.mx/foo/p/MLM111222333?wid=MLM111222333&other=1',
        title: 'Cafetera Espresso Automática 15 Bares',
        image: 'https://http2.mlstatic.com/D_NQ_NP_2X_111-MLA.jpg',
        priceText: '2000',
        originalText: '3000',
        discountBadge: '33%',
      },
      15,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.candidate.canonicalUrl).toMatch(/wid=MLM111222333/i);
  });

  it('12. dedupe key stability: same product url canonicalizes consistently', () => {
    const a = candidateFromCard(
      {
        href: 'https://www.mercadolibre.com.mx/x/p/MLM555?wid=MLM555',
        title: 'Producto Dedupe Test Alpha Beta',
        image: 'https://http2.mlstatic.com/D_NQ_NP_2X_555-MLA.jpg',
        priceText: '100',
        originalText: '200',
        discountBadge: '',
      },
      15,
    );
    const b = candidateFromCard(
      {
        href: 'https://www.mercadolibre.com.mx/x/p/MLM555?wid=MLM555&sid=xyz',
        title: 'Producto Dedupe Test Alpha Beta',
        image: 'https://http2.mlstatic.com/D_NQ_NP_2X_555-MLA.jpg',
        priceText: '100',
        originalText: '200',
        discountBadge: '',
      },
      15,
    );
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.candidate.canonicalUrl).toBe(b.candidate.canonicalUrl);
  });
});
