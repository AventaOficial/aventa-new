import { describe, expect, it, vi } from 'vitest';
import { classifyOfferPageKind } from '@/lib/offers/retailerProductUrl';
import {
  machineOfferReadyForModeration,
  prepareMachineCandidateOffer,
} from '@/lib/offers/ingestion/prepareMachineCandidateOffer';
import type { OfferExtractionOutcome } from '@/lib/offers/offerExtraction/extractOfferFromUrl';

const SORIANA = 'https://www.soriana.com/cereal-kelloggs-zucaritas-600-g/11669769.html';
const COSTCO = 'https://www.costco.com.mx/Mascotas/Alimentos-y-Premios/Canine-Club-Alimento-para-Perro-227-kg/p/20691';
const CHEDRAUI = 'https://www.chedraui.com.mx/leche/p';
const AMAZON = 'https://www.amazon.com.mx/dp/B0TESTASI1';
const ML = 'https://articulo.mercadolibre.com.mx/MLM-1234567890-audifonos';

function outcome(images: string[], over: Partial<OfferExtractionOutcome['body']> = {}): OfferExtractionOutcome {
  return {
    httpStatus: 200,
    body: {
      title: 'Producto',
      image: images[0] ?? null,
      images,
      store: 'Amazon',
      suggested_discount_price: 199,
      suggested_original_price: 299,
      suggested_category: 'Audio',
      reason: null,
      extraction_status: images.length ? 'success' : 'partial',
      missing: images.length ? [] : ['image'],
      diagnostics: { accessFailure: null, extractionErrorCode: images.length ? null : 'IMAGE_EXTRACTION_FAILED' },
      ...over,
    },
    adapter: {
      provider: 'amazon',
      normalizedUrl: AMAZON,
      canonicalUrl: AMAZON,
      productIdentity: 'amazon_mx:asin:B0TESTASI1',
      productFingerprint: 'amz:B0TESTASI1',
      imageNote: null,
      priceSource: 'amazon_html',
      originalPriceSource: 'amazon_html',
      blockedByHostPolicy: false,
    },
    core: {
      provider: 'amazon',
    } as OfferExtractionOutcome['core'],
  };
}

describe('tipo de URL de retailer', () => {
  it('distingue producto, home, categoría y búsqueda', () => {
    expect(classifyOfferPageKind(SORIANA)).toBe('PRODUCT');
    expect(classifyOfferPageKind('https://www.soriana.com/')).toBe('HOME');
    expect(classifyOfferPageKind('https://www.soriana.com/despensa')).toBe('CATEGORY');
    expect(classifyOfferPageKind('https://www.soriana.com/search')).toBe('SEARCH');

    expect(classifyOfferPageKind(CHEDRAUI)).toBe('PRODUCT');
    expect(classifyOfferPageKind('https://www.chedraui.com.mx/')).toBe('HOME');
    expect(classifyOfferPageKind('https://www.chedraui.com.mx/promociones/jabones')).toBe('CATEGORY');
    expect(classifyOfferPageKind('https://www.chedraui.com.mx/search')).toBe('SEARCH');

    expect(classifyOfferPageKind(COSTCO)).toBe('PRODUCT');
    expect(classifyOfferPageKind('https://www.costco.com.mx/')).toBe('HOME');
    expect(classifyOfferPageKind('https://www.costco.com.mx/Mascotas/Alimentos-y-Premios')).toBe('CATEGORY');

    expect(classifyOfferPageKind(AMAZON)).toBe('PRODUCT');
    expect(classifyOfferPageKind('https://www.amazon.com.mx/s')).toBe('SEARCH');
    expect(classifyOfferPageKind('https://www.amazon.com.mx/b')).toBe('CATEGORY');

    expect(classifyOfferPageKind(ML)).toBe('PRODUCT');
    expect(classifyOfferPageKind('https://listado.mercadolibre.com.mx/search')).toBe('SEARCH');
    expect(classifyOfferPageKind('https://www.mercadolibre.com.mx/ofertas')).toBe('CATEGORY');
    expect(classifyOfferPageKind('https://example.com/producto')).toBe('UNKNOWN');
  });
});

describe('enriquecimiento antes de moderación', () => {
  it('una URL que no es producto no llama al extractor', async () => {
    const extract = vi.fn();
    const prepared = await prepareMachineCandidateOffer('https://www.soriana.com/', extract);
    expect(extract).not.toHaveBeenCalled();
    expect(prepared.product).toBe(false);
    expect(prepared.imageFailure).toBe('NO_PRODUCT_IMAGE_SOURCE');
    expect(prepared.imageUrl).toBeNull();
  });

  it('un producto guarda la imagen extraída y no inventa otra', async () => {
    const image = 'https://m.media-amazon.com/images/I/test.jpg';
    const extract = vi.fn(async () => outcome([image]));
    const prepared = await prepareMachineCandidateOffer(AMAZON, extract);
    expect(extract).toHaveBeenCalledOnce();
    expect(prepared.imageUrl).toBe(image);
    expect(prepared.price).toBe(199);
    expect(prepared.currency).toBe('MXN');
    expect(prepared.imageFailure).toBeNull();
  });

  it('sin imagen deja la falla explícita y no entra a moderación', async () => {
    const extract = vi.fn(async () => outcome([]));
    const prepared = await prepareMachineCandidateOffer(ML, extract);
    expect(prepared.imageUrl).toBeNull();
    expect(prepared.imageFailure).toBe('IMAGE_NOT_FOUND');
    expect(machineOfferReadyForModeration(prepared)).toBe(false);
  });

  it('con título, precio e imagen sí queda lista para moderación', async () => {
    const image = 'https://m.media-amazon.com/images/I/test.jpg';
    const prepared = await prepareMachineCandidateOffer(AMAZON, async () => outcome([image]));
    expect(machineOfferReadyForModeration(prepared)).toBe(true);
  });

  it('un bloqueo de la tienda no se esconde', async () => {
    const blocked = outcome([]);
    blocked.body.diagnostics = { accessFailure: 'ACCESS_BLOCKED', extractionErrorCode: null };
    const prepared = await prepareMachineCandidateOffer(COSTCO, async () => blocked);
    expect(prepared.imageFailure).toBe('IMAGE_BLOCKED');
  });

  it('el mismo candidato no duplica la imagen', async () => {
    const image = 'https://http2.mlstatic.com/D_NQ_NP_test.jpg';
    const extract = vi.fn(async () => outcome([image]));
    const first = await prepareMachineCandidateOffer(ML, extract);
    const second = await prepareMachineCandidateOffer(ML, extract);
    expect(first.imageUrl).toBe(second.imageUrl);
    expect(first.imageUrls).toEqual(second.imageUrls);
  });
});
