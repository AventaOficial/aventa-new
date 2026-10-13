import { describe, expect, it } from 'vitest';
import { mergeOfferImageUrls, normalizeOfferImageUrl } from '../../lib/offerPath';
import { selectOfferImages } from '../../lib/offers/selectOfferImages';

const SORIANA_STORED =
  'https://www.soriana.com/dw/image/v2/BGBD_PRD/on/demandware.static/-/Sites-soriana-grocery-master-catalog/default/dwd061b902/images/product/7501058624635_A.jpg?sw=445&amp;sh=445&amp;sm=fit';
const SORIANA_DECODED = SORIANA_STORED.replace(/&amp;/g, '&');

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
    const amazon = 'https://m.media-amazon.com/images/I/6133voIi1IL._AC_SY300_SX300_QL70_ML2_.jpg';
    expect(normalizeOfferImageUrl(amazon)).toBe(amazon);
    expect(normalizeOfferImageUrl(SORIANA_DECODED)).toBe(SORIANA_DECODED);
  });
});
