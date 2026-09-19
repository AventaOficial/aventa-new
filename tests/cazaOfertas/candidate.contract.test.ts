/**
 * CazaOfertasss — FASE 0. Contratos de ensamblado del candidato: input
 * malformado, mismatch de precio y de moneda, títulos hostiles.
 */

import { describe, expect, it } from 'vitest';

import { buildDealCandidate, sanitizeTitle } from '@/lib/cazaOfertas';

import {
  AMAZON_CANONICAL_URL,
  NOW,
  amazonAffiliate,
  amazonDraft,
  strongEvidence,
} from './fixtures';

describe('buildDealCandidate — camino feliz', () => {
  it('produce un candidato completo y consistente', () => {
    const r = buildDealCandidate(amazonDraft(), { now: NOW, affiliate: amazonAffiliate() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.value;

    expect(c.id).toMatch(/^caza_amazon_mx_[0-9a-f]{8}$/);
    expect(c.store).toBe('amazon_mx');
    expect(c.externalProductId).toBe('B08N5WRWNW');
    expect(c.canonicalUrl).toBe(AMAZON_CANONICAL_URL);
    expect(c.currentPrice).toBe(1999);
    expect(c.referencePrice).toBe(3499);
    expect(c.currency).toBe('MXN');
    expect(c.discountPercent).toBe(42);
    expect(c.category).toBe('electronics');
    expect(c.availability).toBe('in_stock');
    expect(c.seller.trustClass).toBe('official_store');
    expect(c.revision).toBe(1);
  });

  it('es determinista para el mismo input y el mismo reloj', () => {
    const a = buildDealCandidate(amazonDraft(), { now: NOW, affiliate: amazonAffiliate() });
    const b = buildDealCandidate(amazonDraft(), { now: NOW, affiliate: amazonAffiliate() });
    expect(a).toEqual(b);
  });
});

describe('input malformado', () => {
  it('rechaza valores que no son objeto sin lanzar', () => {
    for (const raw of [null, undefined, 42, 'oferta', [], true]) {
      const r = buildDealCandidate(raw, { now: NOW });
      expect(r.ok, `esperaba rechazar ${String(raw)}`).toBe(false);
    }
  });

  it('rechaza tienda no soportada', () => {
    const r = buildDealCandidate(
      { ...amazonDraft(), store: 'walmart_mx' },
      { now: NOW }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons.some((x) => x.startsWith('input.store'))).toBe(true);
  });

  it('rechaza título vacío y título por encima del máximo', () => {
    expect(buildDealCandidate({ ...amazonDraft(), title: '   ' }, { now: NOW }).ok).toBe(false);
    expect(buildDealCandidate({ ...amazonDraft(), title: 'a'.repeat(400) }, { now: NOW }).ok).toBe(
      false
    );
  });

  it('rechaza URL no https o ilegible', () => {
    for (const url of ['http://amazon.com.mx/dp/B08N5WRWNW', 'javascript:alert(1)', 'nope', '']) {
      expect(buildDealCandidate({ ...amazonDraft(), url }, { now: NOW }).ok).toBe(false);
    }
  });

  it('rechaza evidencia faltante o incompleta', () => {
    const withoutEvidence = { ...amazonDraft() } as Record<string, unknown>;
    delete withoutEvidence.evidence;
    expect(buildDealCandidate(withoutEvidence, { now: NOW }).ok).toBe(false);
    expect(
      buildDealCandidate(
        { ...amazonDraft(), evidence: { ...strongEvidence(), evidenceQuality: 'excelente' } },
        { now: NOW }
      ).ok
    ).toBe(false);
  });

  it('ignora claves desconocidas en lugar de propagarlas', () => {
    const r = buildDealCandidate(
      { ...amazonDraft(), esAdmin: true, __proto__: { pwned: true } },
      { now: NOW, affiliate: amazonAffiliate() }
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect('esAdmin' in r.value).toBe(false);
    expect((r.value as Record<string, unknown>).pwned).toBeUndefined();
  });

  it('degrada a valores conservadores cuando el enum es desconocido', () => {
    const r = buildDealCandidate(
      { ...amazonDraft(), category: 'gadgets-raros', availability: 'quizá', seller: { trustClass: 'excelente' } },
      { now: NOW }
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Nunca se degrada "hacia arriba": desconocido no es in_stock ni high.
    expect(r.value.category).toBe('other');
    expect(r.value.availability).toBe('unknown');
    expect(r.value.seller.trustClass).toBe('unknown');
  });
});

describe('precios inválidos', () => {
  it('rechaza precio cero', () => {
    const r = buildDealCandidate(
      { ...amazonDraft(), currentPrice: 0, evidence: strongEvidence({ currentPrice: 0 }) },
      { now: NOW }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('price.zero');
  });

  it('rechaza precio negativo', () => {
    const r = buildDealCandidate(
      { ...amazonDraft(), currentPrice: -100, evidence: strongEvidence({ currentPrice: -100 }) },
      { now: NOW }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('price.negative');
  });

  it('rechaza precio de referencia negativo', () => {
    const r = buildDealCandidate(
      { ...amazonDraft(), referencePrice: -1, evidence: strongEvidence({ referencePrice: -1 }) },
      { now: NOW }
    );
    expect(r.ok).toBe(false);
  });

  it('rechaza precio no numérico', () => {
    expect(
      buildDealCandidate({ ...amazonDraft(), currentPrice: 'gratis' }, { now: NOW }).ok
    ).toBe(false);
  });
});

describe('price mismatch', () => {
  it('rechaza cuando el precio declarado no coincide con la evidencia', () => {
    const r = buildDealCandidate(
      { ...amazonDraft(), currentPrice: 1899 },
      { now: NOW }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons[0]).toContain('price.mismatch_with_evidence');
  });

  it('acepta el mismo precio escrito con formato distinto', () => {
    const r = buildDealCandidate({ ...amazonDraft(), currentPrice: '$1,999.00' }, { now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.currentPrice).toBe(1999);
  });
});

describe('currency mismatch', () => {
  it('rechaza moneda fuera del alcance de FASE 0', () => {
    expect(buildDealCandidate({ ...amazonDraft(), currency: 'USD' }, { now: NOW }).ok).toBe(false);
  });

  it('rechaza evidencia en otra moneda que el candidato', () => {
    const r = buildDealCandidate(
      { ...amazonDraft(), evidence: { ...strongEvidence(), currency: 'USD' } },
      { now: NOW }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons.some((x) => x.includes('currency'))).toBe(true);
  });
});

describe('sanitizeTitle', () => {
  it('quita caracteres de control y colapsa espacios', () => {
    expect(sanitizeTitle('  Audífonos\u0000\u0007   geniales \n ')).toBe('Audífonos geniales');
  });

  it('trunca al máximo permitido', () => {
    expect(sanitizeTitle('a'.repeat(500))).toHaveLength(300);
  });
});
