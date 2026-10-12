import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => createElement('a', { href }, children as never),
}));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/app/providers/UIProvider', () => ({ useUI: () => ({ showToast: vi.fn() }) }));
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => ({ session: null }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/hooks/useVoterVoteWeights', () => ({ useVoterVoteWeights: () => ({ up: 2, down: 1, level: 1 }) }));
vi.mock('@/app/components/offers/OfferMedia', () => ({ default: () => null }));
vi.mock('@/app/components/moderation/FeedModerationAction', () => ({ default: () => null }));
vi.mock('@/app/components/OfferAdvancedMetricsModal', () => ({ default: () => null }));

import {
  compareWithListPrice,
  DECLARED_PRICES_NOTE,
  listPriceBadgePercent,
  listPriceDifferenceText,
} from '@/lib/offers/listPriceComparison';
import { buildOfferPriceInsight } from '@/lib/offers/priceHistory';
import { offerDiscountPercent } from '@/lib/me/offerPresentation';
import { generateDealShareText } from '@/lib/shareText';
import { renderTelegramOfferMessage } from '@/lib/distribution/render/telegramMessage';
import { buildDailyHtml } from '@/lib/email/templates';
import { buildMarketingCopyText } from '@/lib/staff/marketingPipeline';
import type { StaffFilmCandidate } from '@/lib/staff/workBoard';
import OfferCard from '@/app/components/OfferCard';
import FeaturedOfferCard from '@/app/components/FeaturedOfferCard';
import RewardsOfferSelection, { type WelcomeChoiceCard } from '@/app/me/RewardsOfferSelection';

const INVALID_LIST_PRICES: unknown[] = [null, undefined, 0, -10, Number.NaN, Number.POSITIVE_INFINITY, '', 'abc'];

describe('comparación contra el precio de lista', () => {
  it('precio de lista válido y mayor: diferencia y porcentaje', () => {
    expect(compareWithListPrice(80, 100)).toEqual({ price: 80, listPrice: 100, difference: 20, percent: 20 });
    expect(compareWithListPrice('224.10', '300')).toMatchObject({ difference: 75.9, percent: 25 });
  });

  it('precio de lista ausente o inválido: sin comparación', () => {
    for (const list of INVALID_LIST_PRICES) expect(compareWithListPrice(80, list)).toBeNull();
  });

  it('precio actual ausente, cero o inválido: sin comparación (no 100 %)', () => {
    for (const price of INVALID_LIST_PRICES) expect(compareWithListPrice(price, 100)).toBeNull();
  });

  it('precio de lista igual o menor: sin diferencia positiva ni porcentaje', () => {
    expect(compareWithListPrice(100, 100)).toBeNull();
    expect(compareWithListPrice(120, 100)).toBeNull();
  });

  it('diferencia menor a 1 %: se muestra la diferencia, no el porcentaje', () => {
    expect(compareWithListPrice(99.6, 100)).toEqual({ price: 99.6, listPrice: 100, difference: 0.4, percent: null });
  });

  it('el texto habla de precio de lista, nunca de ahorro', () => {
    const text = listPriceDifferenceText(compareWithListPrice(80, 100)!, 'MXN');
    expect(text).toMatch(/menos que el precio de lista$/);
    expect(text).not.toMatch(/ahorr/i);
  });
});

describe('«−N%» frente al historial de Aventa', () => {
  const cmp = compareWithListPrice(60, 100);

  it('se oculta cuando el historial dice «solo etiqueta»', () => {
    expect(listPriceBadgePercent(cmp, 'label_only')).toBeNull();
  });

  it('se mantiene con historial insuficiente, en línea o fuerte', () => {
    for (const verdict of [null, undefined, 'insufficient', 'fair', 'strong'] as const) {
      expect(listPriceBadgePercent(cmp, verdict)).toBe(40);
    }
  });

  it('sin comparación válida no hay porcentaje con ningún veredicto', () => {
    expect(listPriceBadgePercent(null, 'strong')).toBeNull();
  });

  /** Cliente simulado en memoria para `offer_price_snapshots` (sin base real). */
  function snapshots(prices: number[]) {
    const rows = prices.map((price, i) => ({ price, recorded_at: new Date(Date.now() - i * 86_400_000).toISOString() }));
    const builder = {
      select: () => builder,
      eq: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: async () => ({ data: rows, error: null }),
    };
    return { from: () => builder } as never;
  }

  it('historial que contradice la etiqueta → label_only → sin «−N%»', async () => {
    const insight = await buildOfferPriceInsight(snapshots([60, 40, 41]), {
      offerId: 'o',
      currentPrice: 60,
      originalPrice: 100,
    });
    expect(insight.verdict).toBe('label_only');
    expect(listPriceBadgePercent(compareWithListPrice(60, 100), insight.verdict)).toBeNull();
  });

  it('historial que respalda el precio → strong → «−N%» se conserva', async () => {
    const insight = await buildOfferPriceInsight(snapshots([60, 70, 75]), {
      offerId: 'o',
      currentPrice: 60,
      originalPrice: 100,
    });
    expect(insight.verdict).toBe('strong');
    expect(listPriceBadgePercent(compareWithListPrice(60, 100), insight.verdict)).toBe(40);
  });
});

const cardProps = (originalPrice: number, discountPrice: number, discount = 0) => ({
  offerId: 'o1',
  title: 'Arroz 1 kg',
  brand: 'Walmart',
  originalPrice,
  discountPrice,
  sourceCurrency: 'MXN',
  discount,
  upvotes: 0,
  downvotes: 0,
  votes: { up: 0, down: 0, score: 0 },
});

describe('superficies públicas usan la misma regla', () => {
  const surfaces = {
    feed: (o: number, p: number, d = 0) => renderToStaticMarkup(createElement(OfferCard, cardProps(o, p, d))),
    destacada: (o: number, p: number, d = 0) => renderToStaticMarkup(createElement(FeaturedOfferCard, cardProps(o, p, d))),
  };

  for (const [name, render] of Object.entries(surfaces)) {
    describe(name, () => {
      it('precio de lista válido: tachado, diferencia y «−N%», sin «Ahorras»', () => {
        const html = render(100, 80);
        expect(html).toContain('menos que el precio de lista');
        expect(html).toContain('line-through');
        expect(html).toMatch(/-<!-- -->20<!-- -->%|-20%/);
        expect(html).not.toMatch(/Ahorras/);
      });

      it('precio de lista igual, menor o ausente: nada promocional aunque llegue un descuento', () => {
        for (const [o, p] of [[100, 100], [80, 100], [0, 100]]) {
          const html = render(o, p, 35);
          expect(html).not.toContain('menos que el precio de lista');
          expect(html).not.toContain('line-through');
          expect(html).not.toMatch(/-<!-- -->35|-35%/);
        }
      });

      it('precio actual en cero no se presenta como 100 %', () => {
        const html = render(100, 0);
        expect(html).not.toMatch(/100<!-- -->%|100%/);
        expect(html).not.toContain('menos que el precio de lista');
      });
    });
  }

  it('el modal, el detalle y la vista previa usan la regla compartida y no dicen «Ahorras»', () => {
    for (const file of [
      'app/components/OfferModal.tsx',
      'app/oferta/[id]/OfferPageContent.tsx',
      'app/components/ActionBar.tsx',
      'app/components/OfferCard.tsx',
      'app/components/FeaturedOfferCard.tsx',
    ]) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src, file).toContain('@/lib/offers/listPriceComparison');
      expect(src, file).not.toMatch(/Ahorras/);
    }
    for (const file of ['app/components/OfferModal.tsx', 'app/oferta/[id]/OfferPageContent.tsx']) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src, file).toMatch(/useOfferPriceEvidence\(/);
      expect(src, file).toMatch(/presentListPrice\([^)]*priceEvidence\)/);
      expect(src, file).toMatch(/<OfferPriceInsightBlock evidence=\{priceEvidence\} \/>/);
    }
    expect(readFileSync(join(process.cwd(), 'app/components/ActionBar.tsx'), 'utf8')).toContain('DECLARED_PRICES_NOTE');
    expect(DECLARED_PRICES_NOTE).toMatch(/declarados por ti/);
  });
});

describe('textos para compartir y distribución', () => {
  it('compartir: «Precio de lista» solo con comparación válida; nunca «Antes»', () => {
    const valid = generateDealShareText({ title: 'Arroz', discountPrice: 80, originalPrice: 100, sourceCurrency: 'MXN' }, 'https://a.test');
    expect(valid).toContain('Precio de lista:');
    expect(valid).not.toContain('Antes');
    for (const originalPrice of [0, 80, 60]) {
      const text = generateDealShareText({ title: 'Arroz', discountPrice: 80, originalPrice, sourceCurrency: 'MXN' }, 'https://a.test');
      expect(text).not.toContain('Precio de lista');
    }
  });

  const telegram = (price: number | null, original: number | null) =>
    renderTelegramOfferMessage({
      offer: { id: 'o', title: 'Arroz', store: 'Walmart', price, original_price: original, image_url: null },
      ctaUrl: 'https://aventaofertas.com/r/d/11111111-1111-4111-8111-111111111111',
    }).text;

  it('Telegram: tachado y porcentaje solo con precio de lista válido', () => {
    expect(telegram(80, 100)).toMatch(/<s>.*<\/s> \(-20% vs\. lista\)/);
    for (const [p, o] of [[80, 80], [100, 80], [80, null], [0, 100]] as const) {
      const text = telegram(p, o);
      expect(text).not.toContain('<s>');
      expect(text).not.toMatch(/%/);
    }
  });

  it('correo: precio tachado solo si el de lista supera al actual', () => {
    const html = (original: number | null) =>
      buildDailyHtml([{ id: 'o', title: 'Arroz', price: 80, original_price: original }], 'https://a.test');
    expect(html(100)).toContain('line-through; font-weight:400;">$100');
    for (const original of [null, 0, 80, 60]) expect(html(original)).not.toContain('line-through; font-weight:400;');
  });

  it('copy de marketing: «Precio de lista» y descuento solo con comparación válida', () => {
    const card = (price: number, originalPrice: number | null, discountPercent: number | null) =>
      ({ title: 'Arroz', store: 'Walmart', price, originalPrice, discountPercent, offerUrl: null }) as unknown as StaffFilmCandidate;
    const valid = buildMarketingCopyText(card(80, 100, 20));
    expect(valid).toContain('Precio de lista: $100');
    expect(valid).toContain('Descuento: -20%');
    expect(valid).not.toContain('Antes');
    const invalid = buildMarketingCopyText(card(100, 80, 25));
    expect(invalid).not.toContain('Precio de lista');
    expect(invalid).not.toContain('Descuento');
  });
});

describe('selección de recompensas sin regresiones', () => {
  const legacyPct = (price: number | null, original: number | null) =>
    price == null || original == null || original <= 0 || price >= original
      ? null
      : Math.round(((original - price) / original) * 100);

  it('el porcentaje coincide con la fórmula anterior en todos los casos con precio positivo', () => {
    const cases: [number | null, number | null][] = [
      [80, 100], [224.1, 300], [1, 3], [99, 100], [99.6, 100], [100, 100], [120, 100], [null, 100], [80, null], [80, 0],
    ];
    for (const [price, original] of cases) {
      const expected = legacyPct(price, original);
      expect(offerDiscountPercent(price, original), `${price}/${original}`).toBe(expected === 0 ? null : expected);
    }
  });

  it('un precio en cero ya no aparece como −100 %', () => {
    expect(legacyPct(0, 100)).toBe(100);
    expect(offerDiscountPercent(0, 100)).toBeNull();
  });

  it('la tarjeta muestra el porcentaje solo con comparación válida y conserva el flujo de selección', () => {
    const choice = (id: string, price: number | null, original: number | null): WelcomeChoiceCard => ({
      id,
      title: `Oferta ${id}`,
      created_at: '2026-10-01T00:00:00Z',
      image_url: null,
      store: 'Walmart',
      price,
      original_price: original,
      upvotes_count: 3,
      views: 10,
      eligible: true,
      dealStatus: 'approved',
    });
    const html = renderToStaticMarkup(
      createElement(RewardsOfferSelection, {
        choices: [choice('a', 80, 100), choice('b', 100, 80), choice('c', 0, 100)],
        confirming: false,
        error: null,
        onConfirm: () => undefined,
      }),
    );
    expect(html.match(/-<!-- -->\d+<!-- -->%|-\d+%/g)).toEqual([expect.stringMatching(/20/)]);
    expect(html.match(/Elegir esta oferta/g)).toHaveLength(3);
  });
});
