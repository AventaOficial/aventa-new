import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeOfferImageUrls, normalizeOfferImageUrl } from '../../lib/offerPath';
import { resolveOfferImageSource } from '../../lib/offers/media/offerImageSource';
import { selectOfferImages } from '../../lib/offers/selectOfferImages';

const SORIANA_STORED =
  'https://www.soriana.com/dw/image/v2/BGBD_PRD/on/demandware.static/-/Sites-soriana-grocery-master-catalog/default/dwd061b902/images/product/7501058624635_A.jpg?sw=445&amp;sh=445&amp;sm=fit';
const SORIANA_DECODED = SORIANA_STORED.replace(/&amp;/g, '&');
const AMAZON = 'https://m.media-amazon.com/images/I/6133voIi1IL._AC_SY300_SX300_QL70_ML2_.jpg';

describe('imágenes con &amp; literal (og:image sin decodificar)', () => {
  it('moderación recibe la URL decodificada para ofertas ya guardadas', () => {
    expect(normalizeOfferImageUrl(SORIANA_STORED)).toBe(SORIANA_DECODED);
    expect(mergeOfferImageUrls(SORIANA_STORED, [SORIANA_STORED])).toEqual([SORIANA_DECODED]);
  });

  it('la extracción guarda la URL decodificada', () => {
    expect(selectOfferImages([SORIANA_STORED], { preferredCover: SORIANA_STORED })).toEqual([
      SORIANA_DECODED,
    ]);
  });

  it('no altera URLs sin entidades', () => {
    expect(normalizeOfferImageUrl(AMAZON)).toBe(AMAZON);
    expect(normalizeOfferImageUrl(SORIANA_DECODED)).toBe(SORIANA_DECODED);
  });

  it('decodifica &AMP; sin importar mayúsculas', () => {
    expect(normalizeOfferImageUrl('https://x.com/a.jpg?a=1&AMP;b=2')).toBe('https://x.com/a.jpg?a=1&b=2');
  });

  it('moderación y feed producen la misma URL', () => {
    expect(normalizeOfferImageUrl(SORIANA_STORED)).toBe(resolveOfferImageSource(SORIANA_STORED)?.url);
  });
});

describe('esquemas y URLs inválidas', () => {
  it('acepta http y https, y completa protocol-relative', () => {
    expect(normalizeOfferImageUrl('http://images.costco.com.mx/p.jpg')).toBe('http://images.costco.com.mx/p.jpg');
    expect(normalizeOfferImageUrl('//http2.mlstatic.com/D_1.jpg')).toBe('https://http2.mlstatic.com/D_1.jpg');
  });

  it('descarta esquemas no permitidos, rutas locales, placeholders y vacíos', () => {
    expect(normalizeOfferImageUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeOfferImageUrl('ftp://x.com/a.jpg')).toBeNull();
    expect(normalizeOfferImageUrl('/placeholder.png')).toBeNull();
    expect(normalizeOfferImageUrl('https://aventaofertas.com/placeholder.png')).toBeNull();
    expect(normalizeOfferImageUrl('   ')).toBeNull();
    expect(normalizeOfferImageUrl(null)).toBeNull();
  });

  it('la extracción ignora esquemas no http(s)', () => {
    expect(selectOfferImages(['javascript:alert(1)', 'data:image/png;base64,AAA', AMAZON])).toEqual([AMAZON]);
  });

  it('la portada preferida decodificada se mantiene primera', () => {
    const extra = 'https://www.soriana.com/img/otra.jpg';
    expect(selectOfferImages([extra, SORIANA_STORED], { preferredCover: SORIANA_STORED })[0]).toBe(
      SORIANA_DECODED,
    );
  });
});

describe('moderación: portada normalizada y Referer sin cambios', () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

  it('ModerationOfferCard no pinta offer.image_url sin normalizar', () => {
    expect(read('app/admin/components/ModerationOfferCard.tsx')).not.toMatch(/src=\{offer\.image_url\}/);
  });

  it('las vistas que envían Referer lo siguen enviando (Soriana falla más sin él)', () => {
    for (const file of [
      'app/components/moderation/FocusOfferStage.tsx',
      'app/components/moderation/FocusDesktopContext.tsx',
      'app/admin/components/ModerationOfferCard.tsx',
    ]) {
      expect(read(file)).not.toContain('no-referrer');
    }
  });
});

