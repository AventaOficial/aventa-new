import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyOfferMatch } from '@/lib/offers/duplicateIntelligence/classify';
import { compareOfferPrices } from '@/lib/offers/duplicateIntelligence/price';
import { priceHistoryFromCurrent } from '@/lib/offers/duplicateIntelligence/priceHistory';
import type { OfferSnapshot } from '@/lib/offers/duplicateIntelligence/classify';

const NEW = 'https://www.amazon.com.mx/dp/B0TESTASI1';
const EXISTING = 'https://www.amazon.com.mx/gp/product/B0TESTASI1';

function offer(patch: Partial<OfferSnapshot> & Pick<OfferSnapshot, 'id'>): OfferSnapshot {
  return {
    title: 'Audífonos',
    offerUrl: NEW,
    price: 899,
    currency: 'MXN',
    ...patch,
  };
}

describe('inteligencia de duplicados', () => {
  it('mismo producto, mejor precio', () => {
    const result = classifyOfferMatch({
      incoming: offer({ id: 'new', price: 899 }),
      candidate: offer({ id: 'old', offerUrl: EXISTING, price: 999 }),
    });
    expect(result.relation).toBe('SAME_PRODUCT_BETTER_PRICE');
    expect(result.confidence).toBe(0.96);
    expect(result.price?.status).toBe('compared');
  });

  it('mismo producto, peor precio', () => {
    const result = classifyOfferMatch({
      incoming: offer({ id: 'new', price: 999 }),
      candidate: offer({ id: 'old', offerUrl: EXISTING, price: 899 }),
    });
    expect(result.relation).toBe('SAME_PRODUCT_WORSE_PRICE');
    if (result.price?.status !== 'compared') throw new Error('precio');
    expect(result.price.percentage).toBe(11.12);
  });

  it('mismo precio', () => {
    const result = classifyOfferMatch({
      incoming: offer({ id: 'new', price: 999 }),
      candidate: offer({ id: 'old', offerUrl: EXISTING, price: 999 }),
    });
    expect(result.relation).toBe('SAME_PRODUCT_SIMILAR_PRICE');
  });

  it('variante distinta no es el mismo producto', () => {
    const result = classifyOfferMatch({
      incoming: offer({ id: 'new', title: 'iPhone 15 128GB' }),
      candidate: offer({ id: 'old', offerUrl: EXISTING, title: 'iPhone 15 256GB' }),
    });
    expect(result.relation).toBe('NO_MATCH');
    expect(result.signals[0]?.code).toBe('variant_conflict');
  });

  it('sin variante en un lado queda incierto', () => {
    const result = classifyOfferMatch({
      incoming: offer({ id: 'new', title: 'iPhone 15 128GB' }),
      candidate: offer({ id: 'old', offerUrl: EXISTING, title: 'iPhone 15' }),
    });
    expect(result.relation).toBe('UNCERTAIN_MATCH');
    expect(result.confidence).toBe(0.72);
  });

  it('moneda distinta no se convierte', () => {
    const price = compareOfferPrices({
      newAmount: 10,
      newCurrency: 'USD',
      existingAmount: 180,
      existingCurrency: 'MXN',
    });
    expect(price).toEqual({ status: 'unknown', reason: 'currency_mismatch' });
  });

  it('sin moneda no afirma un ahorro', () => {
    const result = classifyOfferMatch({
      incoming: offer({ id: 'new', currency: null }),
      candidate: offer({ id: 'old', offerUrl: EXISTING, currency: null }),
    });
    expect(result.relation).toBe('UNCERTAIN_MATCH');
    expect(result.price).toEqual({ status: 'unknown', reason: 'missing_currency' });
  });

  it('precio ausente o inválido', () => {
    expect(compareOfferPrices({ newAmount: null, newCurrency: 'MXN', existingAmount: 10, existingCurrency: 'MXN' }).status).toBe('unknown');
    expect(compareOfferPrices({ newAmount: -1, newCurrency: 'MXN', existingAmount: 10, existingCurrency: 'MXN' })).toMatchObject({
      reason: 'invalid_price',
    });
    expect(compareOfferPrices({ newAmount: 0, newCurrency: 'MXN', existingAmount: 0, existingCurrency: 'MXN' })).toMatchObject({
      reason: 'invalid_price',
    });
  });

  it('sin identificador no inventa coincidencia', () => {
    const result = classifyOfferMatch({
      incoming: offer({ id: 'new', offerUrl: null }),
      candidate: offer({ id: 'old', offerUrl: null }),
    });
    expect(result.relation).toBe('NO_MATCH');
    expect(result.confidence).toBeNull();
  });

  it('una oferta de máquina y una humana se comparan con la misma regla', () => {
    const machine = classifyOfferMatch({
      incoming: offer({ id: 'machine', price: 899 }),
      candidate: offer({ id: 'shelf', price: 999 }),
    });
    const human = classifyOfferMatch({
      incoming: offer({ id: 'human', price: 899 }),
      candidate: offer({ id: 'shelf', offerUrl: EXISTING, price: 999 }),
    });
    expect(machine.relation).toBe('SAME_PRODUCT_BETTER_PRICE');
    expect(human.relation).toBe('SAME_PRODUCT_BETTER_PRICE');
    const source = readFileSync('lib/offers/duplicateIntelligence/classify.ts', 'utf8');
    expect(source).not.toMatch(/dealScore|DQE|MACHINE_HUNTER/);
  });

  it('el historial de precio no inventa mínimo ni tendencia', () => {
    const summary = priceHistoryFromCurrent({
      amountMinor: BigInt(1299900),
      currency: 'MXN',
      observedAt: '2026-10-06T00:00:00.000Z',
    });
    expect(summary.current?.currency).toBe('MXN');
    expect(summary.lowest).toBeNull();
    expect(summary.average).toBeNull();
    expect(summary.trend).toBeNull();
  });

  it('la búsqueda de candidatos usa la huella indexada', () => {
    const source = readFileSync('lib/offers/duplicateIntelligence/assess.ts', 'utf8');
    expect(source).toContain("eq('product_fingerprint', key)");
    expect(source).toContain('.limit(');
    expect(source).not.toContain("select('*')");
  });

  it('la ruta de moderación exige actor autorizado y no toca dinero', () => {
    const source = readFileSync('app/api/admin/moderation/offer-intelligence/route.ts', 'utf8');
    expect(source).toContain('requireModerationActor');
    for (const word of ['creator_rewards', 'payout_intents', 'affiliate_ledger_entries', 'REWARDS_PAYOUT_ENABLED']) {
      expect(source).not.toContain(word);
    }
  });
});
