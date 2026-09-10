import { describe, expect, it } from 'vitest';
import { classifyOfferMonetization } from '@/lib/hunter/dayToDay/monetization';
import { DAY_TO_DAY_SOURCES } from '@/lib/hunter/dayToDay/registry';
import { offerUrlsAreSameProduct } from '@/lib/offers/offerUrlFingerprint';

describe('Day-to-Day non-affiliate policy (FASE 7)', () => {
  it('Chedraui/Walmart/Bodega not_configured → cero requests/candidatos', async () => {
    for (const src of DAY_TO_DAY_SOURCES) {
      expect(src.isConfigured?.({ config: {} as never, now: new Date(), rotationWave: 0 })).toBe(false);
      const result = await src.collect({ config: {} as never, now: new Date(), rotationWave: 0 });
      expect(result.errorCode).toBe('not_configured');
      expect(result.candidates).toEqual([]);
      expect(result.collectedCount).toBe(0);
    }
  });

  it('non_affiliate no implica rechazo de oferta', () => {
    expect(classifyOfferMonetization('https://www.chedraui.com.mx/producto/1')).toBe('non_affiliate');
    expect(classifyOfferMonetization('https://www.walmart.com.mx/ip/123')).toBe('non_affiliate');
    expect(classifyOfferMonetization('https://www.bodegaaurrera.com.mx/ip/1')).toBe('non_affiliate');
  });

  it('ML con env affiliate → affiliate', () => {
    const prev = process.env.ML_AFFILIATE_TAG;
    process.env.ML_AFFILIATE_TAG = 'aventa-test';
    expect(classifyOfferMonetization('https://www.mercadolibre.com.mx/p/MLM1')).toBe('affiliate');
    if (prev === undefined) delete process.env.ML_AFFILIATE_TAG;
    else process.env.ML_AFFILIATE_TAG = prev;
  });

  it('duplicate engine fingerprint: mismo producto ML distinto tracking', () => {
    const a =
      'https://www.mercadolibre.com.mx/p/MLM18625838?pdp_filters=item_id:MLM1413356802&matt_tool=1';
    const b = 'https://www.mercadolibre.com.mx/p/MLM18625838?wid=MLM1413356802&tag=aventa';
    expect(offerUrlsAreSameProduct(a, b)).toBe(true);
  });
});
