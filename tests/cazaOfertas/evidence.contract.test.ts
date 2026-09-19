/**
 * CazaOfertasss — FASE 0. Contratos de evidencia, frescura y autoridad de
 * precio de referencia.
 */

import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_MAX_AGE_MS,
  historyIsSufficient,
  isEvidenceStale,
  resolveDiscountClaim,
  resolveReferencePrice,
  validateEvidence,
} from '@/lib/cazaOfertas';

import { CAPTURED_ISO, NOW, pageClaimEvidence, strongEvidence } from './fixtures';

describe('validateEvidence', () => {
  it('acepta evidencia fuerte y fresca', () => {
    const v = validateEvidence(strongEvidence(), NOW);
    expect(v.usable).toBe(true);
    expect(v.stale).toBe(false);
    expect(v.reasons).toEqual(['evidence.usable']);
  });

  it('rechaza calidad unusable', () => {
    const v = validateEvidence(strongEvidence({ evidenceQuality: 'unusable' }), NOW);
    expect(v.usable).toBe(false);
    expect(v.reasons).toContain('evidence.quality_unusable');
  });

  it('rechaza precio verificado desde una fuente no verificable', () => {
    const v = validateEvidence(
      strongEvidence({ source: 'page_claim', priceConfidence: 'verified' }),
      NOW
    );
    expect(v.usable).toBe(false);
    expect(v.reasons).toContain('evidence.price_confidence_unsupported_by_source:page_claim');
  });

  it('rechaza historial observado sin densidad suficiente', () => {
    const v = validateEvidence(
      strongEvidence({ observationWindowDays: 3, observationCount: 2 }),
      NOW
    );
    expect(v.usable).toBe(false);
    expect(v.reasons).toContain('evidence.observed_history_insufficient_density');
  });

  it('rechaza precios inválidos dentro de la evidencia', () => {
    expect(validateEvidence(strongEvidence({ currentPrice: 0 }), NOW).usable).toBe(false);
    expect(validateEvidence(strongEvidence({ currentPrice: -5 }), NOW).usable).toBe(false);
    expect(validateEvidence(strongEvidence({ referencePrice: -1 }), NOW).usable).toBe(false);
  });

  it('rechaza ventanas u observaciones negativas', () => {
    const v = validateEvidence(
      strongEvidence({ historicalConfidence: 'store_reference_price', observationWindowDays: -1 }),
      NOW
    );
    expect(v.reasons).toContain('evidence.observation_window_negative');
  });
});

describe('frescura (stale offer)', () => {
  it('evidencia dentro de la ventana no es stale', () => {
    expect(isEvidenceStale(strongEvidence(), NOW)).toBe(false);
  });

  it('evidencia más vieja que la ventana máxima es stale', () => {
    const old = new Date(Date.parse(CAPTURED_ISO) + EVIDENCE_MAX_AGE_MS + 60_000);
    expect(isEvidenceStale(strongEvidence(), old)).toBe(true);
    const v = validateEvidence(strongEvidence(), old);
    expect(v.stale).toBe(true);
    expect(v.usable).toBe(false);
    expect(v.reasons).toContain('evidence.stale');
  });

  it('timestamp en el futuro se trata como no confiable', () => {
    const future = strongEvidence({ capturedAt: '2026-09-19T13:00:00.000Z' });
    expect(isEvidenceStale(future, NOW)).toBe(true);
  });

  it('timestamp ilegible es stale, no una excepción', () => {
    expect(isEvidenceStale(strongEvidence({ capturedAt: 'ayer' }), NOW)).toBe(true);
  });
});

describe('historyIsSufficient', () => {
  it('exige ventana y conteo declarados', () => {
    expect(historyIsSufficient(strongEvidence())).toBe(true);
    expect(historyIsSufficient(strongEvidence({ observationCount: null }))).toBe(false);
    expect(historyIsSufficient(strongEvidence({ observationWindowDays: null }))).toBe(false);
    expect(historyIsSufficient(strongEvidence({ observationWindowDays: 5 }))).toBe(false);
    expect(historyIsSufficient(strongEvidence({ observationCount: 1 }))).toBe(false);
  });
});

describe('resolveReferencePrice', () => {
  it('historial observado denso es autoritativo', () => {
    const r = resolveReferencePrice(strongEvidence());
    expect(r.authoritative).toBe(true);
    expect(r.basis).toBe('observed_history');
    expect(r.referencePrice).toBe(3499);
  });

  it('precio de lista de la tienda es autoritativo pero más débil', () => {
    const r = resolveReferencePrice(
      strongEvidence({
        historicalConfidence: 'store_reference_price',
        observationWindowDays: null,
        observationCount: null,
      })
    );
    expect(r.authoritative).toBe(true);
    expect(r.basis).toBe('store_reference_price');
  });

  it('un "X% OFF" de la página NUNCA es autoritativo', () => {
    const r = resolveReferencePrice(pageClaimEvidence());
    expect(r.authoritative).toBe(false);
    expect(r.basis).toBe('page_claimed');
    // La referencia se conserva para auditoría, pero no sostiene el descuento.
    expect(r.referencePrice).toBe(3499);
    expect(r.reasons).toContain('reference.non_authoritative_basis:page_claimed');
  });

  it('sin referencia devuelve base none', () => {
    const r = resolveReferencePrice(strongEvidence({ referencePrice: null }));
    expect(r.authoritative).toBe(false);
    expect(r.basis).toBe('none');
    expect(r.reasons).toContain('reference.absent');
  });

  it('calidad débil anula la autoridad de la referencia', () => {
    const r = resolveReferencePrice(strongEvidence({ evidenceQuality: 'weak' }));
    expect(r.authoritative).toBe(false);
    expect(r.reasons).toContain('reference.quality_too_low:weak');
  });
});

describe('resolveDiscountClaim', () => {
  it('descuento reclamable con evidencia fuerte', () => {
    const r = resolveDiscountClaim(strongEvidence());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.claimable).toBe(true);
    expect(r.value.discountPercent).toBe(42);
  });

  it('un descuento auto-declarado se reduce a 0 y no es reclamable', () => {
    const r = resolveDiscountClaim(pageClaimEvidence());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.discountPercent).toBe(0);
    expect(r.value.claimable).toBe(false);
    expect(r.value.reasons).toContain('discount.not_claimable');
  });

  it('descuento implausible exige historial observado', () => {
    const storeListing = resolveDiscountClaim(
      strongEvidence({
        currentPrice: 200,
        referencePrice: 3499,
        historicalConfidence: 'store_reference_price',
        observationWindowDays: null,
        observationCount: null,
      })
    );
    expect(storeListing.ok).toBe(true);
    if (!storeListing.ok) return;
    expect(storeListing.value.claimable).toBe(false);
    expect(storeListing.value.reasons).toContain(
      'discount.implausible_without_observed_history'
    );

    const observed = resolveDiscountClaim(
      strongEvidence({ currentPrice: 200, referencePrice: 3499 })
    );
    expect(observed.ok).toBe(true);
    if (!observed.ok) return;
    expect(observed.value.claimable).toBe(true);
    expect(observed.value.discountPercent).toBe(94);
  });
});
