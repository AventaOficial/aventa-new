import { describe, expect, it } from 'vitest';
import {
  isOfferAmazonHost,
  isOfferMercadoLibreHost,
  offerStoreLabelFromFlags,
  resolveOfferStoreFlags,
} from '../../lib/offers/detectOfferStore';
import { extractMercadoLibreItemId } from '../../lib/offers/parseOfferPageHtml';

describe('detectOfferStore hostname-first', () => {
  it('amazon.com.mx y www → Amazon', () => {
    expect(isOfferAmazonHost('amazon.com.mx')).toBe(true);
    expect(isOfferAmazonHost('www.amazon.com.mx')).toBe(true);
    expect(offerStoreLabelFromFlags(resolveOfferStoreFlags('www.amazon.com.mx', 'www.amazon.com.mx'))).toBe(
      'Amazon',
    );
  });

  it('mercadolibre.com.mx → Mercado Libre', () => {
    expect(isOfferMercadoLibreHost('www.mercadolibre.com.mx')).toBe(true);
    expect(
      offerStoreLabelFromFlags(resolveOfferStoreFlags('www.mercadolibre.com.mx', 'www.mercadolibre.com.mx')),
    ).toBe('Mercado Libre');
  });

  it('amzn.to / a.co / meli.la por host', () => {
    expect(isOfferAmazonHost('amzn.to')).toBe(true);
    expect(isOfferAmazonHost('a.co')).toBe(true);
    expect(isOfferMercadoLibreHost('meli.la')).toBe(true);
  });

  it('Amazon con MLM en el path NO es Mercado Libre (host gana)', () => {
    const amazonWithFakeMl =
      'https://www.amazon.com.mx/dp/B08N5WRWNW/ref/MLM1234567890/?th=1';
    // El extractor de id puede ver MLM en el path, pero la tienda NO se decide por eso.
    expect(extractMercadoLibreItemId(amazonWithFakeMl)).toBe('MLM1234567890');
    const flags = resolveOfferStoreFlags('www.amazon.com.mx', 'www.amazon.com.mx');
    expect(flags.isAmazon).toBe(true);
    expect(flags.isMercadoLibre).toBe(false);
    expect(offerStoreLabelFromFlags(flags)).toBe('Amazon');
  });

  it('redirect a Amazon gana sobre host intermedio', () => {
    const flags = resolveOfferStoreFlags('amzn.to', 'www.amazon.com.mx');
    expect(offerStoreLabelFromFlags(flags)).toBe('Amazon');
  });

  it('redirect a ML gana sobre meli.la', () => {
    const flags = resolveOfferStoreFlags('meli.la', 'www.mercadolibre.com.mx');
    expect(offerStoreLabelFromFlags(flags)).toBe('Mercado Libre');
  });
});
