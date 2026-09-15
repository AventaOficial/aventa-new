import { describe, it, expect } from 'vitest';
import { buildBotOfferDescription } from '@/lib/bots/ingest/buildBotOfferDescription';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

const base: ParsedOfferMetadata = {
  canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1',
  title: 'Papel higiénico Elite 4 rollos',
  store: 'Mercado Libre',
  imageUrl: 'https://http2.mlstatic.com/x.webp',
  discountPrice: 49,
  originalPrice: 79,
  discountPercent: 38,
};

describe('buildBotOfferDescription', () => {
  it('plantilla supermercado con datos verificados', () => {
    const d = buildBotOfferDescription(base, 'supermercado');
    expect(d).toContain('disponible en Mercado Libre');
    expect(d).toContain('$49');
    expect(d).toContain('Precio de referencia $79');
    expect(d).toContain('Categoría: Supermercado');
    expect(d).not.toContain('Ingesta automática');
    expect(d).not.toContain('garantía');
    expect(d).not.toContain('despensa');
  });

  it('sin inventar specs cuando faltan datos', () => {
    const d = buildBotOfferDescription(
      { ...base, title: 'Uber Eats envío gratis', store: 'Uber Eats', originalPrice: null },
      'servicios'
    );
    expect(d).toContain('Uber Eats');
    expect(d).toContain('$49');
    expect(d).not.toContain('términos');
    expect(d).not.toContain('garantía');
    expect(d).not.toContain('Precio de referencia');
  });

  it('fallback sin título ni tienda', () => {
    const d = buildBotOfferDescription(
      { ...base, title: '  ', store: '' },
      null
    );
    expect(d).toContain('Oferta por $49');
    expect(d).toContain('Revisa disponibilidad');
  });
});
