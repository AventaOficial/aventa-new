import { describe, expect, it } from 'vitest';
import { applyMlPriceIntelToMeta } from '@/lib/bots/ingest/priceIntel';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { MlPriceIntel } from '@/lib/bots/ingest/mlPriceEngine';
import type { MlPriceQuote } from '@/lib/bots/ingest/mlPricesApi';

const MAX_WORKER_DISCOUNT_PERCENT = 85;
const MIN_DISCOUNT = 20;

function cardMeta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://www.mercadolibre.com.mx/xelvra/p/MLM1234567890?wid=MLM1234567890',
    title: 'Producto de prueba worker',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/x.jpg',
    discountPrice: 1000,
    originalPrice: 3000,
    discountPercent: 67,
    signals: { listingTypeId: 'worker_card', condition: 'new' },
    ...over,
  };
}

function intel(over: Partial<MlPriceIntel> = {}): MlPriceIntel {
  return {
    lowest30d: null,
    lowest90d: null,
    habitual30d: null,
    current: 1000,
    listPrice: 1050,
    regularPrice: 1000,
    priceVsLowest90dPct: null,
    savingsVsHabitualPct: null,
    effectiveDiscountPercent: 0,
    suspectedArtificialListPrice: true,
    samples90d: 1,
    historyReady: false,
    ...over,
  };
}

function quote(over: Partial<MlPriceQuote> = {}): MlPriceQuote {
  return {
    current: 1000,
    listPrice: 1050,
    regularPrice: 1000,
    ...over,
  };
}

function passesHardDiscountFilter(meta: ParsedOfferMetadata, minDiscount = MIN_DISCOUNT): boolean {
  if (meta.originalPrice == null || meta.originalPrice <= meta.discountPrice) return false;
  if (meta.discountPercent < minDiscount || meta.discountPercent > MAX_WORKER_DISCOUNT_PERCENT) {
    return false;
  }
  return true;
}

describe('applyMlPriceIntelToMeta — preserveLabelDiscount (ml_worker)', () => {
  it('Caso 1: card 67% + effective 0 → hard filter ve 67, no 0', () => {
    const meta = cardMeta({ discountPercent: 67 });
    const out = applyMlPriceIntelToMeta(
      meta,
      { quote: quote(), intel: intel({ effectiveDiscountPercent: 0, suspectedArtificialListPrice: true }) },
      { preserveLabelDiscount: true }
    );
    expect(out.discountPercent).toBe(67);
    expect(out.discountPrice).toBe(1000);
    expect(out.originalPrice).toBe(3000);
    expect(out.signals?.effectiveDiscountPercent).toBe(0);
    expect(out.signals?.suspectedArtificialListPrice).toBe(true);
    expect(out.signals?.priceIntelSource).toBe('aventa_ml');
    expect(passesHardDiscountFilter(out)).toBe(true);
  });

  it('Caso 2: card 54% + effective 5 → conserva 54', () => {
    const meta = cardMeta({
      discountPercent: 54,
      discountPrice: 460,
      originalPrice: 1000,
    });
    const out = applyMlPriceIntelToMeta(
      meta,
      {
        quote: quote({ current: 460, listPrice: 480 }),
        intel: intel({
          current: 460,
          listPrice: 480,
          effectiveDiscountPercent: 5,
          savingsVsHabitualPct: 5,
          suspectedArtificialListPrice: false,
        }),
      },
      { preserveLabelDiscount: true }
    );
    expect(out.discountPercent).toBe(54);
    expect(out.signals?.effectiveDiscountPercent).toBe(5);
    expect(passesHardDiscountFilter(out)).toBe(true);
  });

  it('Caso 3: card 32% + effective 31 → conserva 32 (no max)', () => {
    const meta = cardMeta({
      discountPercent: 32,
      discountPrice: 680,
      originalPrice: 1000,
    });
    const out = applyMlPriceIntelToMeta(
      meta,
      {
        quote: quote({ current: 680, listPrice: 1000 }),
        intel: intel({
          current: 680,
          listPrice: 1000,
          effectiveDiscountPercent: 31,
          suspectedArtificialListPrice: false,
        }),
      },
      { preserveLabelDiscount: true }
    );
    expect(out.discountPercent).toBe(32);
    expect(out.signals?.effectiveDiscountPercent).toBe(31);
  });

  it('Caso 4: card discount 0/ausente → comportamiento actual (pisa con effective)', () => {
    const meta = cardMeta({
      discountPercent: 0,
      discountPrice: 1000,
      originalPrice: 1000,
    });
    const out = applyMlPriceIntelToMeta(
      meta,
      {
        quote: quote({ current: 950, listPrice: 1000 }),
        intel: intel({
          current: 950,
          listPrice: 1000,
          effectiveDiscountPercent: 5,
          suspectedArtificialListPrice: false,
        }),
      },
      { preserveLabelDiscount: true }
    );
    // discountPercent<=0 no se preserva → engine gana
    expect(out.discountPercent).toBe(5);
    expect(out.discountPrice).toBe(950);
    expect(passesHardDiscountFilter(out)).toBe(false);
  });

  it('sin preserveLabelDiscount: effective 0 sigue pisando (regresión ml_api)', () => {
    const meta = cardMeta({ discountPercent: 67 });
    const out = applyMlPriceIntelToMeta(
      meta,
      { quote: quote(), intel: intel({ effectiveDiscountPercent: 0 }) },
      { preserveLabelDiscount: false }
    );
    expect(out.discountPercent).toBe(0);
    expect(passesHardDiscountFilter(out)).toBe(false);
  });

  it('Caso 6: card >= minDiscount puede pasar hard filter hacia insert', () => {
    const meta = cardMeta({
      discountPercent: 48,
      discountPrice: 520,
      originalPrice: 1000,
    });
    const out = applyMlPriceIntelToMeta(
      meta,
      {
        quote: quote({ current: 520, listPrice: 530 }),
        intel: intel({ effectiveDiscountPercent: 2, suspectedArtificialListPrice: true }),
      },
      { preserveLabelDiscount: true }
    );
    expect(out.discountPercent).toBe(48);
    expect(passesHardDiscountFilter(out, MIN_DISCOUNT)).toBe(true);
    // Señales de intel siguen disponibles para score/diagnóstico
    expect(out.signals?.effectiveDiscountPercent).toBe(2);
    expect(out.signals?.priceIntelSource).toBe('aventa_ml');
  });
});

describe('dedupe contract (Caso 5 — sin cambio)', () => {
  it('fingerprint fuerte ml: sigue siendo la clave de duplicate, no el %', async () => {
    const { strongProductFingerprintForUrl } = await import('@/lib/offers/findDuplicateOffer');
    const a = strongProductFingerprintForUrl(
      'https://www.mercadolibre.com.mx/x/p/MLM1234567890?wid=MLM1234567890'
    );
    const b = strongProductFingerprintForUrl(
      'https://articulo.mercadolibre.com.mx/MLM-1234567890-foo_JM'
    );
    expect(a).toBe('ml:MLM1234567890');
    expect(a).toBe(b);
  });
});
