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
  it('plantilla supermercado', () => {
    const d = buildBotOfferDescription(base, 'supermercado');
    expect(d).toContain('despensa');
    expect(d).toContain('$49');
    expect(d).not.toContain('Ingesta automática');
  });

  it('plantilla servicios', () => {
    const d = buildBotOfferDescription(
      { ...base, title: 'Uber Eats envío gratis', store: 'Uber Eats' },
      'servicios'
    );
    expect(d).toContain('promoción');
    expect(d).toContain('términos');
  });
});
