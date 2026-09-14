/**
 * Evidence Contract — tests de contrato end-to-end (ML Worker → QE → Gate).
 * Valida semántica, no detalles internos frágiles.
 */
import { describe, expect, it } from 'vitest';
import { qualifyCandidate } from '@/lib/hunter/dealQualification';
import { evaluateDealQuality } from '@/lib/hunter/dealQuality';
import { mlWorkerMayInsertPending } from '@/lib/bots/ingest/mlWorkerPendingGate';
import {
  candidateFromCard,
  workerCandidateEligibleForIngest,
} from '../../workers/mercadolibre-worker/src/ml.mjs';
import {
  hasStrongIndependentEvidence,
  isWeakListingCardSource,
  reconcileVerifiedWithEvidenceContract,
} from '@/lib/hunter/dealEvidence';

function pipelineFromCardSignals(opts: {
  cardDiscountSource: 'badge_reconstructed' | 'card_strikethrough' | 'pdp';
  current: number;
  original: number | null;
  originalProv: 'source_explicit' | 'listing_card' | 'unknown';
  priceMemory?: Parameters<typeof evaluateDealQuality>[0]['priceMemory'];
}) {
  const q = qualifyCandidate({
    currentPrice: opts.current,
    originalPrice: opts.original,
    explicitDiscountPercent: null,
    explicitSavings: null,
    promotionKind: null,
    promotionBoundToProduct: false,
    currentPriceProvenance: 'source_explicit',
    originalPriceProvenance: opts.originalProv,
    discountPercentProvenance: opts.original != null ? 'derived' : 'unknown',
  });
  const quality = evaluateDealQuality({
    title: 'Producto Evidence Contract Test',
    currentPrice: opts.current,
    originalPrice: opts.original,
    qualification: q,
    cardDiscountSource: opts.cardDiscountSource,
    priceMemory: opts.priceMemory ?? null,
  });
  const gate = mlWorkerMayInsertPending({
    qualityDecision: quality.decision,
    recommendedAction: quality.recommendedAction,
    cardDiscountSource: opts.cardDiscountSource,
  });
  return { q, quality, gate };
}

describe('Evidence Contract end-to-end', () => {
  it('1. badge_reconstructed → NEVER VERIFIED', () => {
    const { q, quality, gate } = pipelineFromCardSignals({
      cardDiscountSource: 'badge_reconstructed',
      current: 500,
      original: 833,
      originalProv: 'unknown',
    });
    expect(q.qualification).not.toBe('VERIFIED_DEAL');
    expect(quality.decision).not.toBe('VERIFIED_DEAL');
    expect(gate.allow).toBe(false);
  });

  it('2. card_strikethrough → NEVER VERIFIED sin STRONG evidence', () => {
    const { q, quality } = pipelineFromCardSignals({
      cardDiscountSource: 'card_strikethrough',
      current: 562,
      original: 1704,
      originalProv: 'listing_card',
    });
    expect(q.qualification).toBe('POTENTIAL_DEAL');
    expect(quality.decision).not.toBe('VERIFIED_DEAL');
    expect(isWeakListingCardSource('card_strikethrough')).toBe(true);
  });

  it('3. card_strikethrough + PDP blocked (no pdp source) → NEVER VERIFIED', () => {
    const { quality, gate } = pipelineFromCardSignals({
      cardDiscountSource: 'card_strikethrough',
      current: 200,
      original: 800,
      originalProv: 'listing_card',
      priceMemory: { historyReady: false, suspectedArtificialListPrice: false },
    });
    expect(quality.decision).not.toBe('VERIFIED_DEAL');
    // Puede ser POTENTIAL (revisión) si no artificial.
    expect(['POTENTIAL_DEAL', 'NO_VERIFIED_DEAL']).toContain(quality.decision);
    if (quality.decision === 'POTENTIAL_DEAL') {
      expect(gate.allow).toBe(true);
    }
  });

  it('4. card_strikethrough + artificial=true → NEVER VERIFIED', () => {
    const { quality, gate } = pipelineFromCardSignals({
      cardDiscountSource: 'card_strikethrough',
      current: 562,
      original: 1704,
      originalProv: 'listing_card',
      priceMemory: {
        historyReady: false,
        suspectedArtificialListPrice: true,
        effectiveDiscountPercent: 0,
      },
    });
    expect(quality.decision).not.toBe('VERIFIED_DEAL');
    expect(quality.decision).toBe('NO_VERIFIED_DEAL');
    expect(gate.allow).toBe(false);
  });

  it('5. card_strikethrough + effectiveDiscount=0 → NEVER VERIFIED', () => {
    const { quality } = pipelineFromCardSignals({
      cardDiscountSource: 'card_strikethrough',
      current: 900,
      original: 1500,
      originalProv: 'listing_card',
      priceMemory: {
        historyReady: true,
        suspectedArtificialListPrice: false,
        effectiveDiscountPercent: 0,
        savingsVsHabitualPct: 0,
      },
    });
    expect(quality.decision).not.toBe('VERIFIED_DEAL');
  });

  it('6. card_strikethrough + no history → NEVER VERIFIED', () => {
    const { quality } = pipelineFromCardSignals({
      cardDiscountSource: 'card_strikethrough',
      current: 188,
      original: 248,
      originalProv: 'listing_card',
      priceMemory: { historyReady: false },
    });
    expect(quality.decision).not.toBe('VERIFIED_DEAL');
  });

  it('7. PDP current+original confirmed → VERIFIED permitido', () => {
    const { q, quality, gate } = pipelineFromCardSignals({
      cardDiscountSource: 'pdp',
      current: 800,
      original: 1200,
      originalProv: 'source_explicit',
    });
    expect(q.qualification).toBe('VERIFIED_DEAL');
    expect(quality.decision).toBe('VERIFIED_DEAL');
    expect(gate.allow).toBe(true);
  });

  it('8. Price Memory sufficient + effective > 0 + non-artificial → VERIFIED permitido', () => {
    const { quality, gate } = pipelineFromCardSignals({
      cardDiscountSource: 'card_strikethrough',
      current: 800,
      original: null,
      originalProv: 'unknown',
      priceMemory: {
        historyReady: true,
        samples90d: 12,
        savingsVsHabitualPct: 22,
        priceVsLowest90dPct: 1,
        effectiveDiscountPercent: 22,
        suspectedArtificialListPrice: false,
      },
    });
    expect(quality.decision).toBe('VERIFIED_DEAL');
    expect(gate.allow).toBe(true);
    expect(
      hasStrongIndependentEvidence({
        cardDiscountSource: 'card_strikethrough',
        priceMemory: {
          historyReady: true,
          strongPositiveHistory: true,
          effectiveDiscountPercent: 22,
          suspectedArtificialListPrice: false,
        },
      }),
    ).toBe(true);
  });

  it('9. artificial list price sin strong rescue → degraded decision', () => {
    const r = reconcileVerifiedWithEvidenceContract({
      decision: 'VERIFIED_DEAL',
      cardDiscountSource: 'card_strikethrough',
      artificial: true,
      effectiveDiscountPercent: 0,
      priceMemoryStrongRescue: false,
    });
    expect(r.demoted).toBe(true);
    expect(r.decision).toBe('NO_VERIFIED_DEAL');
  });

  it('10. existing legitimate VERIFIED (source_explicit, no weak card) remains valid', () => {
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
      title: 'Silla ergonómica',
      currentPrice: 1000,
      originalPrice: 1500,
      qualification: q,
      // sin cardDiscountSource → flujo community/HTML
    });
    expect(quality.decision).toBe('VERIFIED_DEAL');
  });

  it('11. duplicate behavior remains unchanged', () => {
    const quality = evaluateDealQuality({
      title: 'TV 55',
      currentPrice: 5000,
      duplicate: { isDuplicate: true, kind: 'timeout_cooldown' },
      cardDiscountSource: 'card_strikethrough',
    });
    expect(quality.decision).toBe('DUPLICATE');
    const gate = mlWorkerMayInsertPending({
      qualityDecision: quality.decision,
      recommendedAction: quality.recommendedAction,
      cardDiscountSource: 'card_strikethrough',
    });
    expect(gate.allow).toBe(false);
  });

  it('12. community/manual-style flow (no card source) unchanged', () => {
    const q = qualifyCandidate({
      currentPrice: 200,
      originalPrice: 400,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
    });
    const quality = evaluateDealQuality({
      title: 'Oferta comunidad',
      source: 'community',
      currentPrice: 200,
      originalPrice: 400,
      qualification: q,
    });
    expect(quality.decision).toBe('VERIFIED_DEAL');
  });

  it('worker maps card_strikethrough to listing_card provenance (not source_explicit)', () => {
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
    expect(parsed.candidate.signals.originalPriceProvenance).toBe('listing_card');
    expect(workerCandidateEligibleForIngest(parsed.candidate).ok).toBe(true);
    const q = qualifyCandidate({
      currentPrice: parsed.candidate.discountPrice,
      originalPrice: parsed.candidate.originalPrice,
      explicitDiscountPercent: null,
      explicitSavings: null,
      promotionKind: null,
      promotionBoundToProduct: false,
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'listing_card',
      discountPercentProvenance: 'derived',
    });
    expect(q.qualification).toBe('POTENTIAL_DEAL');
    expect(q.qualification).not.toBe('VERIFIED_DEAL');
  });
});
