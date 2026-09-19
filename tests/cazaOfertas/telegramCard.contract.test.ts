/**
 * CazaOfertasss — FASE 0. Contratos de generación de tarjeta de Telegram.
 * FASE 0 genera, NO publica.
 */

import { describe, expect, it } from 'vitest';

import {
  AFFILIATE_DISCLOSURE_ES,
  CAZAOFERTAS_PUBLICATION_BOUNDARY,
  PRICE_DISCLAIMER_ES,
  assertTelegramPublishDisabled,
  buildDealCandidate,
  escapeTelegramText,
  generateTelegramCard,
  type DealCandidate,
} from '@/lib/cazaOfertas';

import {
  NOW,
  amazonAffiliate,
  amazonDraft,
  mercadoLibreDraft,
  pageClaimEvidence,
  strongEvidence,
} from './fixtures';

function monetizableCandidate(draft: unknown = amazonDraft()): DealCandidate {
  const r = buildDealCandidate(draft, { now: NOW, affiliate: amazonAffiliate() });
  if (!r.ok) throw new Error(`fixture inválido: ${r.reasons.join(', ')}`);
  return r.value;
}

describe('frontera de publicación', () => {
  it('FASE 0/2 permite generar la tarjeta pero no publica en producción', () => {
    expect(CAZAOFERTAS_PUBLICATION_BOUNDARY.telegramCardGenerationEnabled).toBe(true);
    expect(CAZAOFERTAS_PUBLICATION_BOUNDARY.telegramPublishEnabled).toBe(false);
    expect(CAZAOFERTAS_PUBLICATION_BOUNDARY.autoPublishEnabled).toBe(false);
    expect(CAZAOFERTAS_PUBLICATION_BOUNDARY.canaryPathExists).toBe(true);
    expect(() => assertTelegramPublishDisabled()).not.toThrow();
  });
});

describe('generateTelegramCard', () => {
  it('produce todos los campos requeridos', () => {
    const r = generateTelegramCard(monetizableCandidate());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const card = r.value;

    expect(card.title).toContain('Audífonos');
    expect(card.currentPriceLabel).toBe('$1,999.00 MXN');
    expect(card.referencePriceLabel).toBe('$3,499.00 MXN');
    expect(card.discountLabel).toBe('-42%');
    expect(card.storeLabel).toBe('Amazon México');
    expect(card.scoreLabel).toBe('93/100');
    expect(card.gradeLabel).toBe('Oferta excelente');
    expect(card.ctaLabel).toBe('Ver oferta');
    expect(card.ctaUrl).toContain('tag=cazaofertasss-20');
    expect(card.affiliateDisclosure).toBe(AFFILIATE_DISCLOSURE_ES);
    expect(card.priceDisclaimer).toBe(PRICE_DISCLAIMER_ES);
  });

  it('el texto incluye disclosure de afiliado y disclaimer de precio', () => {
    const r = generateTelegramCard(monetizableCandidate());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).toContain(AFFILIATE_DISCLOSURE_ES);
    expect(r.value.text).toContain(PRICE_DISCLAIMER_ES);
  });

  it('el CTA apunta al affiliate URL, nunca al canónico', () => {
    const candidate = monetizableCandidate();
    const r = generateTelegramCard(candidate);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.ctaUrl).toBe(candidate.affiliateUrl);
    expect(r.value.ctaUrl).not.toBe(candidate.canonicalUrl);
  });

  it('nunca filtra secretos de afiliación', () => {
    const r = generateTelegramCard(monetizableCandidate());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.text).not.toContain('CAZAOFERTAS_AMAZON_ASSOCIATE_TAG');
  });

  it('rechaza un candidato sin afiliación elegible', () => {
    const noAffiliate = buildDealCandidate(mercadoLibreDraft(), { now: NOW, affiliate: null });
    expect(noAffiliate.ok).toBe(true);
    if (!noAffiliate.ok) return;
    const r = generateTelegramCard(noAffiliate.value);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('card.not_monetizable');
  });

  it('rechaza un candidato REJECT', () => {
    const rejected = buildDealCandidate(
      amazonDraft({ evidence: pageClaimEvidence() }),
      { now: NOW, affiliate: amazonAffiliate() }
    );
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    const r = generateTelegramCard(rejected.value);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('card.grade_reject');
  });

  it('rechaza un candidato sin descuento', () => {
    const noDiscount = buildDealCandidate(
      amazonDraft({
        referencePrice: null,
        evidence: strongEvidence({ referencePrice: null, historicalConfidence: 'none' }),
      }),
      { now: NOW, affiliate: amazonAffiliate() }
    );
    expect(noDiscount.ok).toBe(true);
    if (!noDiscount.ok) return;
    const r = generateTelegramCard(noDiscount.value);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('card.no_discount');
  });

  it('es determinista', () => {
    const candidate = monetizableCandidate();
    expect(generateTelegramCard(candidate)).toEqual(generateTelegramCard(candidate));
  });
});

describe('escapeTelegramText', () => {
  it('neutraliza markup inyectado en el título', () => {
    expect(escapeTelegramText('<b>oferta</b> & más')).toBe('&lt;b&gt;oferta&lt;/b&gt; &amp; más');
  });

  it('un título con HTML no llega crudo a la tarjeta', () => {
    const candidate = monetizableCandidate(
      amazonDraft({ title: '<a href="https://evil.example">Audífonos</a>' })
    );
    const r = generateTelegramCard(candidate);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.title).not.toContain('<a href');
    expect(r.value.text).not.toContain('<a href');
  });
});
