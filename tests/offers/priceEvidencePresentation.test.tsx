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
  LABEL_CONTRADICTED_NOTE,
  observedDropText,
  presentListPrice,
  type PriceEvidence,
} from '@/lib/offers/listPriceComparison';
import { buildOfferPriceInsight, type PriceInsight } from '@/lib/offers/priceHistory';
import { fetchOfferPriceEvidence, useOfferPriceEvidence } from '@/lib/hooks/useOfferPriceEvidence';
import { OfferListPriceInline, OfferListPriceNotes } from '@/app/components/OfferListPrice';
import OfferPriceInsightBlock from '@/app/components/OfferPriceInsightBlock';
import OfferCard from '@/app/components/OfferCard';
import FeaturedOfferCard from '@/app/components/FeaturedOfferCard';
import RewardsOfferSelection from '@/app/me/RewardsOfferSelection';
import FavoriteOfferTile from '@/app/me/favorites/FavoriteOfferTile';
import { renderTelegramOfferMessage } from '@/lib/distribution/render/telegramMessage';
import { buildDailyHtml } from '@/lib/email/templates';
import { generateDealShareText } from '@/lib/shareText';
import { buildMarketingCopyText } from '@/lib/staff/marketingPipeline';
import type { StaffFilmCandidate } from '@/lib/staff/workBoard';
import { buildDealCandidate, generateTelegramCard } from '@/lib/cazaOfertas';
import { NOW, amazonAffiliate, amazonDraft, strongEvidence } from '../cazaOfertas/fixtures';

/** `offer_price_snapshots` en memoria, más reciente primero. */
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

async function ready(prices: number[], currentPrice = 60, originalPrice: number | null = 100): Promise<PriceEvidence> {
  const insight = await buildOfferPriceInsight(snapshots(prices), { offerId: 'o', currentPrice, originalPrice });
  return { status: 'ready', insight };
}

const plain = (html: string) => html.replace(/<!-- -->/g, '');

function renderDetail(evidence: PriceEvidence, price = 60, listPrice: number | null = 100): string {
  const view = presentListPrice(price, listPrice, evidence);
  return plain(
    renderToStaticMarkup(
      createElement('div', null, [
        createElement(OfferListPriceInline, { key: 'i', view, currency: 'MXN', strikeClassName: 's' }),
        createElement(OfferListPriceNotes, { key: 'n', view, currency: 'MXN', className: 'n' }),
        createElement(OfferPriceInsightBlock, { key: 'b', evidence }),
      ]),
    ),
  );
}

describe('carga del historial (fetchOfferPriceEvidence)', () => {
  const response = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('error HTTP → unavailable, aunque el cuerpo traiga un insight', async () => {
    const body = { error: 'x', insight: { verdict: 'strong' } };
    expect(await fetchOfferPriceEvidence('o1', response(500, body))).toEqual({ status: 'unavailable' });
    expect(await fetchOfferPriceEvidence('o1', response(404, { error: 'x' }))).toEqual({ status: 'unavailable' });
  });

  it('fallo de red → unavailable', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchOfferPriceEvidence('o1', failing)).toEqual({ status: 'unavailable' });
  });

  it('respuesta sin insight → unavailable, no se queda cargando', async () => {
    expect(await fetchOfferPriceEvidence('o1', response(200, {}))).toEqual({ status: 'unavailable' });
  });

  it('respuesta con insight → ready, desde el endpoint existente', async () => {
    const insight = { verdict: 'label_only' } as PriceInsight;
    const f = response(200, { insight });
    expect(await fetchOfferPriceEvidence('o1', f)).toEqual({ status: 'ready', insight });
    expect(f).toHaveBeenCalledWith('/api/offers/o1/price-insight');
  });

  it('el hook arranca en loading y sin oferta queda unavailable', () => {
    const Probe = ({ id }: { id: string | null }) => createElement('i', null, useOfferPriceEvidence(id).status);
    expect(renderToStaticMarkup(createElement(Probe, { id: 'o1' }))).toBe('<i>loading</i>');
    expect(renderToStaticMarkup(createElement(Probe, { id: null }))).toBe('<i>unavailable</i>');
  });
});

describe('modal y detalle según el estado del historial', () => {
  it('cargando: precio de lista y diferencia, pero ningún porcentaje', () => {
    const html = renderDetail({ status: 'loading' });
    expect(html).toContain('line-through');
    expect(html).toContain('menos que el precio de lista');
    expect(html).not.toMatch(/\d+%/);
    expect(html).toContain('Consultando historial de precio');
  });

  it('error al cargar: porcentaje solo como «vs. lista», sin evidencia ni bloque', () => {
    const html = renderDetail({ status: 'unavailable' });
    expect(html).toContain('-40% vs. lista');
    expect(html).not.toContain('Precio en AVENTA');
    expect(html).not.toContain('por debajo del precio más alto');
  });

  it('sin historial: «vs. lista», veredicto insuficiente, sin bajada respaldada', async () => {
    const evidence = await ready([]);
    expect(evidence.status === 'ready' && evidence.insight.verdict).toBe('insufficient');
    const html = renderDetail(evidence);
    expect(html).toContain('-40% vs. lista');
    expect(html).toContain('Aún no hay historial suficiente');
    expect(html).not.toContain('por debajo del precio más alto');
  });

  it('label_only: sin porcentaje y con aviso de que el historial no respalda la etiqueta', async () => {
    const evidence = await ready([60, 40, 41]);
    expect(evidence.status === 'ready' && evidence.insight.verdict).toBe('label_only');
    const html = renderDetail(evidence);
    expect(html).not.toContain('-40%');
    expect(html).toContain(LABEL_CONTRADICTED_NOTE);
    expect(html).toContain('menos que el precio de lista');
  });

  it('evidencia suficiente: la bajada observada se nombra aparte del «vs. lista»', async () => {
    const evidence = await ready([60, 70, 75]);
    expect(evidence.status === 'ready' && evidence.insight.verdict).toBe('strong');
    const view = presentListPrice(60, 100, evidence);
    expect(view).toMatchObject({ listPercent: 40, observedDropPercent: 20, labelContradicted: false });
    const html = renderDetail(evidence);
    expect(html).toContain('-40% vs. lista');
    expect(html).toContain(observedDropText(20));
  });

  it('strong sin un precio observado más alto no es una bajada', async () => {
    const evidence = await ready([60, 60]);
    expect(evidence.status === 'ready' && evidence.insight.verdict).toBe('strong');
    expect(presentListPrice(60, 100, evidence).observedDropPercent).toBeNull();
  });

  it('sin precio de lista válido, la evidencia propia se muestra sin inventar un «vs. lista»', async () => {
    const evidence = await ready([60, 70, 75], 60, null);
    const html = renderDetail(evidence, 60, null);
    expect(html).not.toContain('vs. lista');
    expect(html).not.toContain('line-through');
    expect(html).toContain(observedDropText(20));
    expect(presentListPrice(60, 60, await ready([60, 40, 41], 60, 60)).labelContradicted).toBe(false);
  });

  it('ningún estado dice «ahorras»', async () => {
    for (const evidence of [
      { status: 'loading' } as const,
      { status: 'unavailable' } as const,
      await ready([]),
      await ready([60, 40, 41]),
      await ready([60, 70, 75]),
    ]) {
      expect(renderDetail(evidence)).not.toMatch(/ahorr/i);
    }
  });
});

/** «−N%» sin calificar contra la lista (solo permitido en la insignia de tarjetas); los anchos CSS (`36%`) no cuentan. */
function barePercents(text: string): string[] {
  return [...plain(text).matchAll(/[-−]\d+%(?! vs\.)/g)].map((m) => m[0]);
}

describe('canales sin veredicto: el porcentaje nunca aparece como descuento confirmado', () => {
  const cardProps = { offerId: 'o1', title: 'Arroz', brand: 'Walmart', originalPrice: 100, discountPrice: 60, sourceCurrency: 'MXN', upvotes: 0, downvotes: 0, votes: { up: 0, down: 0, score: 0 } };

  it('tarjetas del feed y destacada: insignia compacta «-N%», sin «vs. lista» ni ahorro', () => {
    for (const Card of [OfferCard, FeaturedOfferCard]) {
      const html = renderToStaticMarkup(createElement(Card as never, cardProps as never));
      expect(barePercents(html)).toEqual(['-40%']);
      expect(plain(html)).not.toContain('vs. lista');
      expect(html).not.toMatch(/ahorr/i);
    }
  });

  it('tarjetas: sin precio de lista válido no hay insignia de porcentaje', () => {
    for (const Card of [OfferCard, FeaturedOfferCard]) {
      for (const [originalPrice, discountPrice] of [[60, 60], [50, 60], [0, 60], [100, 0]]) {
        const html = renderToStaticMarkup(
          createElement(Card as never, { ...cardProps, originalPrice, discountPrice, discount: 40 } as never),
        );
        expect(plain(html)).not.toMatch(/[-−]\d+%/);
      }
    }
  });

  it('favoritos y carrusel de comunidad: misma insignia y misma regla que el feed', () => {
    const tile = (originalPrice: number, discountPrice: number, discount: number) =>
      plain(
        renderToStaticMarkup(
          createElement(FavoriteOfferTile, {
            offer: { id: 'o1', title: 'Arroz', brand: 'Walmart', originalPrice, discountPrice, discount, sourceCurrency: 'MXN', upvotes: 0 } as never,
            isFavorite: false,
            saving: false,
            onToggleFavorite: () => undefined,
          }),
        ),
      );
    const valid = tile(100, 60, 40);
    expect(barePercents(valid)).toEqual(['-40%']);
    expect(valid).not.toContain('vs. lista');
    expect(valid).not.toMatch(/descuento|ahorr/i);
    for (const [originalPrice, discountPrice, discount] of [[100, 0, 100], [60, 60, 0], [50, 60, -20], [0, 60, 40]]) {
      expect(tile(originalPrice, discountPrice, discount)).not.toMatch(/[-−]\d+%/);
    }
  });

  it('Telegram, marketing y selección de recompensas', () => {
    const telegram = renderTelegramOfferMessage({
      offer: { id: 'o', title: 'Arroz', store: 'Walmart', price: 60, original_price: 100, image_url: null },
      ctaUrl: 'https://aventaofertas.com/r/d/11111111-1111-4111-8111-111111111111',
    }).text;
    const marketing = buildMarketingCopyText({
      title: 'Arroz', store: 'Walmart', price: 60, originalPrice: 100, offerUrl: null,
    } as unknown as StaffFilmCandidate);
    const rewards = renderToStaticMarkup(
      createElement(RewardsOfferSelection, {
        choices: [{ id: 'a', title: 'A', created_at: '2026-10-01T00:00:00Z', image_url: null, store: 'W', price: 60, original_price: 100, upvotes_count: 0, views: 0, eligible: true, dealStatus: 'approved' }],
        confirming: false,
        error: null,
        onConfirm: () => undefined,
      }),
    );
    expect(telegram).toContain('(-40% vs. lista)');
    expect(marketing).toContain('vs. precio de lista (declarado, sin verificar)');
    expect(plain(rewards)).toContain('-40% vs. lista');
    for (const text of [telegram, marketing, rewards]) expect(barePercents(text)).toEqual([]);
  });

  it('correo y compartir: precio de lista nombrado, sin porcentaje ni ahorro', () => {
    const email = buildDailyHtml([{ id: 'o', title: 'Arroz', price: 60, original_price: 100 }], 'https://a.test');
    const share = generateDealShareText({ title: 'Arroz', discountPrice: 60, originalPrice: 100, sourceCurrency: 'MXN' }, 'https://a.test');
    expect(email).toContain('precio de lista</span>');
    expect(share).toContain('Precio de lista:');
    for (const text of [email, share]) {
      expect(text).not.toMatch(/[-−]\d+%/);
      expect(text).not.toMatch(/ahorr/i);
    }
  });

  it('imagen OG: porcentaje con el texto compartido y solo con comparación válida', () => {
    const src = readFileSync(join(process.cwd(), 'app/oferta/[id]/opengraph-image.tsx'), 'utf8');
    expect(src).toContain('compareWithListPrice(price, offer?.original_price)');
    expect(src).toContain('{listPercentText(discountPct)}');
    expect(src).not.toMatch(/[−-]\{discountPct\}%/);
  });

  it('la vista previa al publicar usa el mismo texto calificado', () => {
    const src = readFileSync(join(process.cwd(), 'app/components/ActionBar.tsx'), 'utf8');
    expect(src).toContain('{listPercentText(previewBadgePercent)}');
    expect(src).not.toMatch(/-\{previewBadgePercent\}%/);
  });
});

describe('tarjeta de Telegram de CazaOfertas', () => {
  function card(historicalConfidence: 'observed_history' | 'store_reference_price') {
    const r = buildDealCandidate(amazonDraft({ evidence: strongEvidence({ historicalConfidence }) }), {
      now: NOW,
      affiliate: amazonAffiliate(),
    });
    if (!r.ok) throw new Error(r.reasons.join(', '));
    const c = generateTelegramCard(r.value);
    if (!c.ok) throw new Error(c.reasons.join(', '));
    return c.value;
  }

  it('precio de lista de la tienda: lo nombra así y no dice «Antes»', () => {
    const c = card('store_reference_price');
    expect(c.text).toContain('Precio de lista de la tienda: $3,499.00 MXN');
    expect(c.text).toContain('Descuento: -42% vs. precio de lista de la tienda');
    expect(c.text).not.toContain('Antes:');
    expect(c.discountLabel).toBe('-42%');
  });

  it('historial observado: lo nombra como precio habitual observado', () => {
    const c = card('observed_history');
    expect(c.text).toContain('Precio habitual observado: $3,499.00 MXN');
    expect(c.text).toContain('Descuento: -42% vs. precio habitual observado');
    expect(c.text).not.toContain('Antes:');
  });
});

describe('modal y detalle comparten la presentación', () => {
  it('ninguno arma el porcentaje por su cuenta', () => {
    for (const file of ['app/components/OfferModal.tsx', 'app/oferta/[id]/OfferPageContent.tsx']) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src, file).toContain('<OfferListPriceInline');
      expect(src, file).toContain('<OfferListPriceNotes');
      expect(src, file).not.toMatch(/-\{\w+\}%/);
      expect(src, file).not.toContain('listPriceBadgePercent');
    }
  });
});
