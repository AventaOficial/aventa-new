import { describe, it, expect } from 'vitest';
import { classifyBotCategory } from '@/lib/bots/ingest/classifyBotCategory';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

function meta(partial: Partial<ParsedOfferMetadata>): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1',
    title: 'Producto',
    store: 'Mercado Libre',
    imageUrl: 'https://http2.mlstatic.com/x.webp',
    discountPrice: 100,
    originalPrice: 200,
    discountPercent: 50,
    ...partial,
  };
}

describe('classifyBotCategory', () => {
  it('supermercado por palabras clave', () => {
    expect(
      classifyBotCategory(meta({ title: 'Cereal Kelloggs 1kg despensa' }))
    ).toBe('supermercado');
  });

  it('hogar por limpieza', () => {
    expect(classifyBotCategory(meta({ title: 'Detergente Ariel limpieza 4kg' }))).toBe('hogar');
  });

  it('servicios por uber eats', () => {
    expect(classifyBotCategory(meta({ title: 'Promo Uber Eats 50% off', store: 'Uber Eats' }))).toBe(
      'servicios'
    );
  });

  it('tecnologia por keywords', () => {
    expect(classifyBotCategory(meta({ title: 'Audífonos bluetooth Sony WH-1000' }))).toBe('tecnologia');
  });

  it('tecnologia por Smart TV', () => {
    expect(
      classifyBotCategory(
        meta({ title: 'Smart TV Motorola MOT32HLE11 32" HD DLED color negro' })
      )
    ).toBe('tecnologia');
  });

  it('MLM1747 en URL → supermercado', () => {
    expect(
      classifyBotCategory(
        meta({
          canonicalUrl: 'https://www.mercadolibre.com.mx/ofertas?category=MLM1747',
          title: 'Oferta genérica',
        })
      )
    ).toBe('supermercado');
  });
});
