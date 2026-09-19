/**
 * Pre-Master — Image extraction precision (extends S6.3 matrix).
 * Junk (Aventa logo, price/UI chrome) must not survive pick/select.
 */

import { describe, expect, it } from 'vitest';
import {
  isHighConfidenceJunkImage,
  selectOfferImages,
} from '@/lib/offers/selectOfferImages';
import { isRejectedMercadoLibreImage } from '@/lib/offers/mlImageProvenance';
import { extractOfferImages } from '@/lib/offers/parseOfferPageHtml';
import { mergeMercadoLibreImageCandidates } from '@/lib/offers/mergeMercadoLibreImageCandidates';
import {
  isLikelyUiOrSiteChromeImage,
  normalizeAbsoluteImageUrl,
  pickBestCardImageUrl,
  resolveListingCardRoot,
  scoreCardImageCandidate,
} from '../../workers/mercadolibre-worker/src/cardImage.mjs';

const PRODUCT =
  'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLM1234567890_022026-F.webp';
const PRODUCT_B =
  'https://http2.mlstatic.com/D_NQ_NP_2X_654321-MLM0987654321_022026-O.webp';
const AVENTA_LOGO = 'https://aventaofertas.com/logo.png';
const AVENTA_EMAIL = 'https://aventaofertas.com/logo-email.png';
const SPLINTER_UI =
  'https://http2.mlstatic.com/storage/splinter-admin/o/home-components/carousel@3x.png';
const FAVICON = 'https://http2.mlstatic.com/favicon.ico';
const PLACEHOLDER = 'https://http2.mlstatic.com/placeholder.png';
const TRACKING = 'https://www.google-analytics.com/collect?pixel.gif';
const AVATAR = 'https://http2.mlstatic.com/seller-avatar-123.jpg';

describe('Pre-Master — image precision filters', () => {
  it('1. product image válida scores high / selectable', () => {
    expect(scoreCardImageCandidate(PRODUCT)).toBeGreaterThan(0);
    expect(selectOfferImages([PRODUCT])).toEqual([PRODUCT]);
  });

  it('2. Aventa logo/asset accidental excluded', () => {
    expect(isHighConfidenceJunkImage(AVENTA_LOGO)).toBe(true);
    expect(isHighConfidenceJunkImage(AVENTA_EMAIL)).toBe(true);
    expect(normalizeAbsoluteImageUrl(AVENTA_LOGO)).toBeNull();
    expect(isLikelyUiOrSiteChromeImage(AVENTA_LOGO)).toBe(true);
    expect(pickBestCardImageUrl([AVENTA_LOGO, PRODUCT])).toBe(PRODUCT);
    expect(selectOfferImages([AVENTA_LOGO, PRODUCT])).toEqual([PRODUCT]);
  });

  it('3. price/UI image (splinter / non-product mlstatic) excluded', () => {
    expect(isHighConfidenceJunkImage(SPLINTER_UI)).toBe(true);
    expect(isRejectedMercadoLibreImage(SPLINTER_UI, 'MLM1')).toBe(true);
    expect(scoreCardImageCandidate(SPLINTER_UI)).toBe(0);
    expect(pickBestCardImageUrl([SPLINTER_UI, PRODUCT])).toBe(PRODUCT);
    expect(selectOfferImages([SPLINTER_UI, PRODUCT, AVENTA_LOGO])).toEqual([PRODUCT]);
  });

  it('4. avatar excluded', () => {
    expect(isHighConfidenceJunkImage(AVATAR)).toBe(true);
    expect(scoreCardImageCandidate(AVATAR)).toBe(0);
  });

  it('5. placeholder excluded', () => {
    expect(isHighConfidenceJunkImage(PLACEHOLDER)).toBe(true);
    expect(scoreCardImageCandidate(PLACEHOLDER)).toBe(0);
  });

  it('6. favicon excluded', () => {
    expect(isHighConfidenceJunkImage(FAVICON)).toBe(true);
  });

  it('7. tracking image excluded', () => {
    expect(isHighConfidenceJunkImage(TRACKING)).toBe(true);
  });

  it('8. lazy image attrs still pick product', () => {
    expect(
      pickBestCardImageUrl([
        '',
        '//http2.mlstatic.com/D_NQ_NP_2X_lazy-MLM1_022026-F.webp',
      ]),
    ).toBe('https://http2.mlstatic.com/D_NQ_NP_2X_lazy-MLM1_022026-F.webp');
  });

  it('9. srcset last (hi-res) wins via pickBest', () => {
    const fromSet =
      'https://http2.mlstatic.com/D_NQ_NP_2X_a-MLM1.webp 1x, https://http2.mlstatic.com/D_NQ_NP_2X_b-MLM1.webp 2x';
    // pickBestCardImageUrl receives already-split candidates; simulate 2x last
    expect(
      pickBestCardImageUrl([
        'https://http2.mlstatic.com/D_NQ_NP_2X_a-MLM1.webp',
        'https://http2.mlstatic.com/D_NQ_NP_2X_b-MLM1.webp',
      ]),
    ).toMatch(/D_NQ_NP_2X_/);
    expect(fromSet).toContain('2x');
  });

  it('10. multiple product images — junk filtered, products kept', () => {
    const out = selectOfferImages([
      AVENTA_LOGO,
      PRODUCT,
      SPLINTER_UI,
      PRODUCT_B,
      FAVICON,
    ]);
    expect(out).toEqual(expect.arrayContaining([PRODUCT, PRODUCT_B]));
    expect(out).not.toContain(AVENTA_LOGO);
    expect(out).not.toContain(SPLINTER_UI);
    expect(out).not.toContain(FAVICON);
  });

  it('11. malformed image URL rejected', () => {
    expect(normalizeAbsoluteImageUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeAbsoluteImageUrl('data:image/png;base64,aaa')).toBeNull();
    expect(pickBestCardImageUrl(['not-a-url', PRODUCT])).toBe(PRODUCT);
  });

  it('12. blocked image URL (login/verification path) rejected', () => {
    expect(
      normalizeAbsoluteImageUrl('https://www.mercadolibre.com.mx/login?img=x'),
    ).toBeNull();
    expect(
      normalizeAbsoluteImageUrl(
        'https://www.mercadolibre.com.mx/account-verification/foo.png',
      ),
    ).toBeNull();
  });

  it('13. poly-card__content must not become root', () => {
    const content = {
      nodeType: 1,
      tagName: 'DIV',
      className: 'poly-card__content',
      parentElement: null as unknown,
      closest(sel: string) {
        if (sel.includes('div.poly-card') && !sel.includes('poly-card__')) {
          return this.parentElement;
        }
        return null;
      },
      querySelector() {
        return null;
      },
    };
    const root = {
      nodeType: 1,
      tagName: 'DIV',
      className: 'poly-card',
      parentElement: null,
      closest() {
        return this;
      },
      querySelector() {
        return { tagName: 'IMG' };
      },
    };
    content.parentElement = root;
    const anchor = {
      closest(sel: string) {
        if (sel.includes('div.poly-card')) return root;
        return null;
      },
      parentElement: content,
    };
    const resolved = resolveListingCardRoot(anchor);
    expect(resolved).toBe(root);
    expect((resolved as { className: string }).className).toBe('poly-card');
    expect((resolved as { className: string }).className).not.toContain('__content');
  });

  it('14. root correcto poly-card (exact token)', () => {
    const root = {
      nodeType: 1,
      tagName: 'DIV',
      className: 'poly-card',
      parentElement: null,
      closest() {
        return this;
      },
      querySelector() {
        return { tagName: 'IMG' };
      },
    };
    const anchor = {
      closest(sel: string) {
        return sel.includes('div.poly-card') ? root : null;
      },
      parentElement: root,
    };
    expect(resolveListingCardRoot(anchor)).toBe(root);
  });

  it('15. imageProvenance independent of price provenance (select path)', () => {
    // Gallery filter does not read price provenance fields.
    const gallery = selectOfferImages([PRODUCT, AVENTA_LOGO]);
    expect(gallery).toEqual([PRODUCT]);
    expect(isRejectedMercadoLibreImage(AVENTA_LOGO, null)).toBe(true);
  });

  it('extractOfferImages does not harvest non-product mlstatic / aventa', () => {
    const html = `
      <meta property="og:image" content="${PRODUCT}" />
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        image: PRODUCT_B,
      })}</script>
      "url":"${SPLINTER_UI}"
      "secure_url":"${AVENTA_LOGO}"
      ${SPLINTER_UI}
      ${AVENTA_LOGO}
    `;
    const imgs = extractOfferImages(html, 'https://www.mercadolibre.com.mx/');
    expect(imgs.some((u) => u.includes('D_NQ_NP'))).toBe(true);
    expect(imgs.some((u) => /splinter|aventaofertas/i.test(u))).toBe(false);
  });

  it('mergeMercadoLibreImageCandidates drops junk before persist', () => {
    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [],
      trustedHtmlImages: [PRODUCT, AVENTA_LOGO, SPLINTER_UI],
      sourceItemId: 'MLM123',
    });
    expect(merged).toContain(PRODUCT);
    expect(merged).not.toContain(AVENTA_LOGO);
    expect(merged).not.toContain(SPLINTER_UI);
  });
});
