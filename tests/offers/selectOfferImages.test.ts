import { describe, expect, it } from 'vitest';
import { OFFER_MAX_IMAGES } from '../../lib/contracts/offers';
import {
  isHighConfidenceJunkImage,
  selectOfferImages,
  splitCoverAndExtras,
} from '../../lib/offers/selectOfferImages';

describe('selectOfferImages', () => {
  it('no recorta a las primeras 8: prioriza hiRes sobre thumbs del mismo recurso', () => {
    const urls = [
      'https://m.media-amazon.com/images/I/71AAA._AC_US40_.jpg',
      'https://m.media-amazon.com/images/I/71BBB._AC_US40_.jpg',
      'https://m.media-amazon.com/images/I/71CCC._AC_US40_.jpg',
      'https://m.media-amazon.com/images/I/71DDD._AC_US40_.jpg',
      'https://m.media-amazon.com/images/I/71EEE._AC_US40_.jpg',
      'https://m.media-amazon.com/images/I/71FFF._AC_US40_.jpg',
      'https://m.media-amazon.com/images/I/71GGG._AC_US40_.jpg',
      'https://m.media-amazon.com/images/I/71HHH._AC_US40_.jpg',
      'https://m.media-amazon.com/images/I/71III._AC_US40_.jpg',
      'https://m.media-amazon.com/images/I/71JJJ._AC_US40_.jpg',
      'https://m.media-amazon.com/images/I/71KKK._AC_SL1500_.jpg',
      'https://m.media-amazon.com/images/I/71LLL._AC_SL1500_.jpg',
    ];
    const picked = selectOfferImages(urls, {
      preferredCover: 'https://m.media-amazon.com/images/I/71KKK._AC_SL1500_.jpg',
    });
    expect(picked).toHaveLength(OFFER_MAX_IMAGES);
    expect(picked[0]).toContain('71KKK');
    expect(picked.some((u) => u.includes('71LLL'))).toBe(true);
    expect(picked.filter((u) => u.includes('71KKK'))).toHaveLength(1);
  });

  it('dedupe querystring y variantes Amazon del mismo I/id', () => {
    const picked = selectOfferImages([
      'https://m.media-amazon.com/images/I/71AAA._AC_SL1500_.jpg',
      'https://m.media-amazon.com/images/I/71AAA._AC_SL1500_.jpg?width=500',
      'https://m.media-amazon.com/images/I/71AAA._AC_US40_.jpg',
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0]).toContain('SL1500');
  });

  it('prefiere ML -O / 2X sobre thumbnail -I del mismo recurso', () => {
    const picked = selectOfferImages([
      'https://http2.mlstatic.com/D_NQ_NP_2X_ABC123-MLA-I.jpg',
      'https://http2.mlstatic.com/D_NQ_NP_2X_ABC123-MLA-O.jpg',
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0]).toContain('-O.');
  });

  it('conserva fotos ML distintas aunque compartan prefijo numérico', () => {
    const picked = selectOfferImages([
      'https://http2.mlstatic.com/D_NQ_NP_2X_987654-MLA2023123456789-I.webp',
      'https://http2.mlstatic.com/D_NQ_NP_2X_987654-MLB2023987654321-I.webp',
      'https://http2.mlstatic.com/D_NQ_NP_2X_987654-MLC2023111111111-I.webp',
    ]);
    expect(picked).toHaveLength(3);
  });

  it('conserva fotos con formato nuevo D_NQ_ y sufijo -OO', () => {
    const picked = selectOfferImages([
      'https://http2.mlstatic.com/D_NQ_915700-MLA116764501833_082026-OO.webp',
      'https://http2.mlstatic.com/D_NQ_NP_857412-MLA109806180229_032026-G.webp',
      'https://http2.mlstatic.com/D_NQ_915700-MLA116764501833_082026-OO.webp',
    ]);
    expect(picked).toHaveLength(2);
  });

  it('unifica -O y -OO de la misma foto ML', () => {
    const picked = selectOfferImages([
      'https://http2.mlstatic.com/D_NQ_NP_791619-MLA99904952681_112025-O.webp',
      'https://http2.mlstatic.com/D_NQ_NP_791619-MLA99904952681_112025-OO.webp',
    ]);
    expect(picked).toHaveLength(1);
  });

  it('dedupe por id de picture cuando la API genera URLs con -F.webp', () => {
    const picked = selectOfferImages([
      'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLA-F.webp',
      'https://http2.mlstatic.com/D_NQ_NP_2X_123457-MLA-F.webp',
    ]);
    expect(picked).toHaveLength(2);
  });

  it('elimina basura de alta confianza y conserva una URL con "logo" en el nombre', () => {
    expect(isHighConfidenceJunkImage('https://cdn.example/favicon.ico')).toBe(true);
    expect(isHighConfidenceJunkImage('https://cdn.example/grey-pixel.gif')).toBe(true);
    expect(isHighConfidenceJunkImage('https://cdn.example/product-logo-front.jpg')).toBe(false);

    const picked = selectOfferImages([
      'https://cdn.example/favicon.ico',
      'https://cdn.example/1x1.gif',
      'https://cdn.example/product-logo-front.jpg',
      'https://cdn.example/main.jpg',
    ]);
    expect(picked).toContain('https://cdn.example/product-logo-front.jpg');
    expect(picked).toContain('https://cdn.example/main.jpg');
    expect(picked.some((u) => u.includes('favicon') || u.includes('1x1'))).toBe(false);
  });

  it('no fuerza 8 si hay pocas candidatas', () => {
    const picked = selectOfferImages([
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.jpg',
    ]);
    expect(picked).toEqual(['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg']);
  });

  it('splitCoverAndExtras mantiene portada + extras', () => {
    const { cover, extras } = splitCoverAndExtras([
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.jpg',
      'https://cdn.example/a.jpg?w=100',
    ]);
    expect(cover).toBe('https://cdn.example/a.jpg');
    expect(extras).toEqual(['https://cdn.example/b.jpg']);
  });
});
