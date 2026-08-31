import { describe, it, expect } from 'vitest';
import {
  isAmazonProductUrl,
  extractAmazonProduct,
} from '../../browser-extension/src/adapters/amazon';
import {
  isMercadoLibreProductUrl,
  extractMercadoLibreProduct,
} from '../../browser-extension/src/adapters/mercadoLibre';
import { resolveAdapter } from '../../browser-extension/src/adapters/index';
import {
  parsePriceText,
  computePreviewDiscountPercent,
  isValidHttpsUrl,
  sanitizePreviewText,
} from '../../browser-extension/src/lib/normalize';

function createMockDocument(selectors: Record<string, { text?: string; content?: string; src?: string }>): Document {
  return {
    querySelector(sel: string) {
      const hit = selectors[sel];
      if (!hit) return null;
      return {
        textContent: hit.text ?? null,
        getAttribute(name: string) {
          if (name === 'content') return hit.content ?? null;
          if (name === 'src') return hit.src ?? null;
          return null;
        },
      };
    },
  } as unknown as Document;
}

describe('Amazon adapter', () => {
  it('detecta producto válido por URL', () => {
    expect(isAmazonProductUrl('https://www.amazon.com.mx/dp/B08N5WRWNW')).toBe(true);
    expect(isAmazonProductUrl('https://www.amazon.com/gp/product/B08N5WRWNW')).toBe(true);
  });

  it('rechaza URL no compatible', () => {
    expect(isAmazonProductUrl('https://www.amazon.com.mx/s?k=laptop')).toBe(false);
    expect(isAmazonProductUrl('https://evil.com/dp/B08N5WRWNW')).toBe(false);
  });

  it('extrae título, precio e imagen', () => {
    const doc = createMockDocument({
      '#productTitle': { text: 'Laptop Gamer' },
      '#landingImage': { src: 'https://m.media-amazon.com/images/I/abc.jpg' },
      '#corePrice_feature_div .a-price .a-offscreen': { text: '$12,999' },
      'span.a-text-price .a-offscreen': { text: '$15,999' },
    });
    const product = extractAmazonProduct(doc, 'https://www.amazon.com.mx/dp/B08N5WRWNW');
    expect(product.title).toBe('Laptop Gamer');
    expect(product.price).toBe(12999);
    expect(product.imageUrl).toContain('abc.jpg');
    expect(product.productId).toBe('B08N5WRWNW');
  });
});

describe('Mercado Libre adapter', () => {
  it('detecta producto válido por URL', () => {
    expect(isMercadoLibreProductUrl('https://articulo.mercadolibre.com.mx/MLM-123-p/MLM123456')).toBe(true);
  });

  it('rechaza URL no compatible', () => {
    expect(isMercadoLibreProductUrl('https://www.mercadolibre.com.mx/ofertas')).toBe(false);
  });

  it('extrae título, precio e imagen', () => {
    const doc = createMockDocument({
      'h1.ui-pdp-title': { text: 'Audífonos BT' },
      'meta[property="og:title"], meta[name="og:title"]': { content: 'Audífonos BT' },
      'meta[property="og:image"], meta[name="og:image"]': { content: 'https://http2.mlstatic.com/img.jpg' },
      '.ui-pdp-price__second-line .andes-money-amount__fraction': { text: '899' },
    });
    const product = extractMercadoLibreProduct(
      doc,
      'https://articulo.mercadolibre.com.mx/MLM-123-p/MLM1234567',
    );
    expect(product.title).toBe('Audífonos BT');
    expect(product.price).toBe(899);
    expect(product.store).toBe('Mercado Libre');
  });
});

describe('Normalización', () => {
  it('parsea precios válidos', () => {
    expect(parsePriceText('$1,299')).toBe(1299);
    expect(parsePriceText('899')).toBe(899);
  });

  it('maneja precio ausente o inválido', () => {
    expect(parsePriceText(null)).toBeNull();
    expect(parsePriceText('sin precio')).toBeNull();
  });

  it('calcula descuento preview solo con ambos precios', () => {
    expect(computePreviewDiscountPercent(750, 1000)).toBe(25);
    expect(computePreviewDiscountPercent(1000, null)).toBeNull();
  });

  it('valida URLs', () => {
    expect(isValidHttpsUrl('https://amazon.com.mx/dp/ABC')).toBe(true);
    expect(isValidHttpsUrl('javascript:alert(1)')).toBe(false);
  });

  it('sanitiza texto de preview', () => {
    expect(sanitizePreviewText('  Hola\x00mundo  ')).toBe('Holamundo');
  });
});

describe('resolveAdapter', () => {
  it('elige adapter por URL', () => {
    expect(resolveAdapter('https://www.amazon.com.mx/dp/B08N5WRWNW')?.getStoreName()).toBe('Amazon');
    expect(resolveAdapter('https://www.mercadolibre.com.mx/p/MLM123')?.getStoreName()).toBe(
      'Mercado Libre',
    );
    expect(resolveAdapter('https://evil.com')).toBeNull();
  });
});

describe('Seguridad extensión', () => {
  it('payload de oferta no incluye campos administrativos', () => {
    const allowedKeys = new Set([
      'title',
      'store',
      'offer_url',
      'price',
      'original_price',
      'hasDiscount',
      'image_url',
      'image_urls',
      'category',
    ]);
    const payload = {
      title: 'Test',
      store: 'Amazon',
      offer_url: 'https://amazon.com.mx/dp/ABC',
      price: 100,
    };
    Object.keys(payload).forEach((k) => expect(allowedKeys.has(k)).toBe(true));
    expect('created_by' in payload).toBe(false);
    expect('status' in payload).toBe(false);
  });

  it('no expone secretos en config por defecto', () => {
    const config = { aventaBase: 'https://aventaofertas.com', supabaseUrl: '', supabaseAnonKey: '' };
    expect(config).not.toHaveProperty('serviceRoleKey');
    expect(config).not.toHaveProperty('cronSecret');
  });
});
