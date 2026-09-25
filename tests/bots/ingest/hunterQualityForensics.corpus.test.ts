/**
 * Hunter quality closure — forensic regression corpus from staging forensics.
 * BEFORE: 15 pending / 0 GOOD / 13 BAD / 2 UNCERTAIN
 * Ensures the FP patterns cannot mint via S6.1.
 */

import { describe, expect, it } from 'vitest';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import {
  evaluateMachineCandidateGate,
  mintTrustedOriginalPrice,
} from '@/lib/bots/ingest/candidateInsertGate';
import {
  buildHunterDecisionTrace,
  labelFromGateAndDqe,
} from '@/lib/bots/ingest/hunterDecisionTrace';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { classifyDiscountClass } from '@/lib/hunter/candidateIntelligence/discountClass';

function cfg(): BotIngestConfig {
  return {
    minDiscountPercent: 20,
    rejectBelowScore: 40,
    titleMinLength: 12,
    titleBlocklistGenericRe: null,
  } as BotIngestConfig;
}

function meta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  const { signals: overSignals, ...rest } = over;
  return {
    canonicalUrl: 'https://www.mercadolibre.com.mx/x/p/MLM12345678?wid=MLM12345678',
    title: 'Producto de prueba oferta hunter quality',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/x.jpg',
    discountPrice: 580,
    originalPrice: 1399,
    discountPercent: 59,
    signals: {
      listingTypeId: 'worker_card',
      originalPriceProvenance: 'listing_card',
      cardDiscountSource: 'card_strikethrough',
      historyReady: false,
      ...(overSignals ?? {}),
    },
    ...rest,
  };
}

/** Staging forensic fixtures (anonymized titles; real signal shapes). */
const FORENSIC_CORPUS = [
  {
    id: 'cdb95720',
    label: 'BAD' as const,
    fail: 'FAKE_DISCOUNT',
    meta: meta({
      title: 'Compresor Bupmova forensic',
      discountPrice: 280.17,
      originalPrice: 597,
      discountPercent: 53,
      signals: {
        suspectedArtificialListPrice: true,
        effectiveDiscountPercent: 0,
        historyReady: false,
        originalPriceProvenance: 'listing_card',
        cardDiscountSource: 'card_strikethrough',
        cardBadgePercent: 53,
      },
    }),
    dqe: {
      decision: 'NO_VERIFIED_DEAL' as const,
      recommendedAction: 'DISCARD' as const,
      reasons: ['artificial'],
    },
  },
  {
    id: '776b4432',
    label: 'BAD' as const,
    fail: 'FAKE_DISCOUNT',
    meta: meta({
      title: 'Proyector Kinwodon 4K forensic',
      discountPrice: 580.05,
      originalPrice: 1399,
      discountPercent: 59,
      signals: {
        suspectedArtificialListPrice: true,
        effectiveDiscountPercent: 0,
        historyReady: false,
        originalPriceProvenance: 'listing_card',
        cardDiscountSource: 'card_strikethrough',
      },
    }),
    dqe: {
      decision: 'NO_VERIFIED_DEAL' as const,
      recommendedAction: 'DISCARD' as const,
      reasons: ['artificial'],
    },
  },
  {
    id: 'b8f2cadd',
    label: 'UNCERTAIN' as const,
    fail: 'MARKET_PRICE_NOT_VERIFIED',
    meta: meta({
      title: 'Audifonos MVPSMART forensic',
      discountPrice: 124.64,
      originalPrice: 218,
      discountPercent: 43,
      signals: {
        suspectedArtificialListPrice: false,
        historyReady: false,
        originalPriceProvenance: 'listing_card',
        cardDiscountSource: 'card_strikethrough',
        cardBadgePercent: 42,
      },
    }),
    dqe: {
      decision: 'POTENTIAL_DEAL' as const,
      recommendedAction: 'HUMAN_REVIEW' as const,
      reasons: ['listing_card'],
    },
  },
  {
    id: '4c2e82af',
    label: 'UNCERTAIN' as const,
    fail: 'LOW_ABSOLUTE_VALUE',
    meta: meta({
      title: 'Calcetines 12 pares forensic',
      discountPrice: 54,
      originalPrice: 135,
      discountPercent: 60,
      signals: {
        historyReady: false,
        originalPriceProvenance: 'listing_card',
        cardDiscountSource: 'card_strikethrough',
        cardBadgePercent: 60,
      },
    }),
    dqe: {
      decision: 'POTENTIAL_DEAL' as const,
      recommendedAction: 'HUMAN_REVIEW' as const,
      reasons: ['listing_card'],
    },
  },
] as const;

describe('Hunter quality forensic corpus (staging BEFORE regression)', () => {
  it('DQE DISCARD cannot mint', () => {
    const r = evaluateMachineCandidateGate({
      url: meta().canonicalUrl,
      meta: meta({
        signals: {
          originalPriceProvenance: 'source_explicit',
          cardDiscountSource: 'pdp',
        },
      }),
      config: cfg(),
      verifierDecision: 'pending',
      dealQuality: {
        decision: 'NO_VERIFIED_DEAL',
        recommendedAction: 'DISCARD',
        reasons: ['x'],
      },
    });
    expect(r.wouldInsert).toBe(false);
    expect(r.reasonCodes).toContain('DQE_DISCARD');
  });

  it('artificial list price cannot be trusted / rescued by listing_card', () => {
    expect(
      mintTrustedOriginalPrice({
        originalPriceProvenance: 'listing_card',
        historyReady: true,
        suspectedArtificialListPrice: true,
      }),
    ).toBe(false);
    const r = evaluateMachineCandidateGate({
      url: meta().canonicalUrl,
      meta: meta({
        signals: {
          originalPriceProvenance: 'source_explicit',
          cardDiscountSource: 'pdp',
          suspectedArtificialListPrice: true,
          historyReady: true,
        },
      }),
      config: cfg(),
      verifierDecision: 'pending',
      dealQuality: {
        decision: 'VERIFIED_DEAL',
        recommendedAction: 'PUBLISH_CANDIDATE',
        reasons: ['ok'],
      },
    });
    expect(r.wouldInsert).toBe(false);
    expect(r.reasonCodes).toContain('ARTIFICIAL_LIST_PRICE');
  });

  it('effectiveDiscount=0 cannot become REAL_GOOD / cannot mint', () => {
    const cls = classifyDiscountClass({
      salePrice: 580,
      originalPrice: 1399,
      discountPct: 59,
      originalPriceProvenance: 'listing_card',
      suspectedArtificialListPrice: false,
      effectiveDiscountPercent: 0,
    });
    expect(cls).not.toBe('DISCOUNT_REAL_GOOD');
    expect(cls).toBe('DISCOUNT_UNKNOWN');

    const r = evaluateMachineCandidateGate({
      url: meta().canonicalUrl,
      meta: meta({
        signals: {
          originalPriceProvenance: 'source_explicit',
          cardDiscountSource: 'pdp',
          effectiveDiscountPercent: 0,
          suspectedArtificialListPrice: false,
        },
      }),
      config: cfg(),
      verifierDecision: 'pending',
      dealQuality: {
        decision: 'VERIFIED_DEAL',
        recommendedAction: 'PUBLISH_CANDIDATE',
        reasons: ['ok'],
      },
    });
    expect(r.wouldInsert).toBe(false);
    expect(r.reasonCodes).toContain('EFFECTIVE_DISCOUNT_UNVERIFIED');
  });

  it('NO_VERIFIED_DEAL suppresses mint', () => {
    const r = evaluateMachineCandidateGate({
      url: meta().canonicalUrl,
      meta: meta({
        signals: {
          originalPriceProvenance: 'source_explicit',
          cardDiscountSource: 'pdp',
        },
      }),
      config: cfg(),
      verifierDecision: 'pending',
      dealQuality: {
        decision: 'NO_VERIFIED_DEAL',
        recommendedAction: 'HUMAN_REVIEW',
        reasons: ['weak'],
      },
    });
    expect(r.wouldInsert).toBe(false);
    expect(r.reasonCodes.some((c) => c === 'NO_VERIFIED_DEAL' || c === 'DQE_DISCARD')).toBe(
      true,
    );
  });

  it('insufficient history on listing_card suppresses mint', () => {
    const r = evaluateMachineCandidateGate({
      url: meta().canonicalUrl,
      meta: meta({ signals: { historyReady: false } }),
      config: cfg(),
      verifierDecision: 'pending',
    });
    expect(r.wouldInsert).toBe(false);
    expect(r.reasonCodes).toContain('INSUFFICIENT_HISTORY');
  });

  it('POTENTIAL_DEAL / HUMAN_REVIEW is UNCERTAIN — not auto-mint', () => {
    const r = evaluateMachineCandidateGate({
      url: meta().canonicalUrl,
      meta: meta({
        signals: {
          originalPriceProvenance: 'source_explicit',
          cardDiscountSource: 'pdp',
          historyReady: true,
        },
      }),
      config: cfg(),
      verifierDecision: 'pending',
      dealQuality: {
        decision: 'POTENTIAL_DEAL',
        recommendedAction: 'HUMAN_REVIEW',
        reasons: ['partial'],
      },
    });
    expect(r.wouldInsert).toBe(false);
    expect(r.reasonCodes).toContain('DQE_POTENTIAL_ONLY');
    expect(labelFromGateAndDqe({ gate: r, dealQuality: { decision: 'POTENTIAL_DEAL', recommendedAction: 'HUMAN_REVIEW' } })).toBe(
      'UNCERTAIN',
    );
  });

  it('corpus fixtures: every BAD/UNCERTAIN forensic case must not mint', () => {
    for (const row of FORENSIC_CORPUS) {
      const gate = evaluateMachineCandidateGate({
        url: row.meta.canonicalUrl,
        meta: row.meta,
        config: cfg(),
        verifierDecision: 'pending',
        dealQuality: row.dqe,
      });
      expect(gate.wouldInsert, row.id).toBe(false);
      const trace = buildHunterDecisionTrace({
        meta: row.meta,
        gate,
        dealQuality: {
          decision: row.dqe.decision,
          recommendedAction: row.dqe.recommendedAction,
          reasons: [...row.dqe.reasons],
          confidence: 'low',
          positiveSignals: [],
          negativeSignals: [],
          missingEvidence: [],
          qualification: null,
          policyVersion: 'deal_quality_v1',
          generatedAt: new Date().toISOString(),
        },
      });
      expect(trace.finalLabel, row.id).not.toBe('GOOD');
      expect(['BAD', 'UNCERTAIN', 'INVALID']).toContain(trace.finalLabel);
    }
  });

  it('decision trace exposes reported vs verified vs DQE', () => {
    const m = FORENSIC_CORPUS[0].meta;
    const gate = evaluateMachineCandidateGate({
      url: m.canonicalUrl,
      meta: m,
      config: cfg(),
      verifierDecision: 'pending',
      dealQuality: FORENSIC_CORPUS[0].dqe,
    });
    const trace = buildHunterDecisionTrace({
      meta: m,
      gate,
      dealQuality: {
        decision: 'NO_VERIFIED_DEAL',
        recommendedAction: 'DISCARD',
        reasons: ['artificial'],
        confidence: 'low',
        positiveSignals: [],
        negativeSignals: ['artificial_list_price'],
        missingEvidence: ['price_history'],
        qualification: null,
        policyVersion: 'deal_quality_v1',
        generatedAt: new Date().toISOString(),
      },
    });
    expect(trace.reportedDiscountPercent).toBe(53);
    expect(trace.verifiedDiscountPercent).toBeNull();
    expect(trace.artificialListPrice).toBe(true);
    expect(trace.historicalBaseline).toBe('INSUFFICIENT_HISTORY');
    expect(trace.finalLabel).toBe('BAD');
    expect(trace.dqeRecommendedAction).toBe('DISCARD');
  });
});
