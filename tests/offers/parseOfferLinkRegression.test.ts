import { describe, expect, it } from 'vitest';
import {
  amazonHtmlScrapeUrl,
  isAmazonBotWallHtml,
} from '@/lib/offers/amazonProductScrapeUrl';
import { isRejectedMercadoLibreImage } from '@/lib/offers/mlImageProvenance';
import { mergeMercadoLibreImageCandidates } from '@/lib/offers/mergeMercadoLibreImageCandidates';
import { extractMercadoLibreDomPrices } from '@/lib/offers/parseOfferPageHtml';

describe('amazonHtmlScrapeUrl', () => {
  it('rewrites /dp/ to /gp/aw/d/ for HTML scrape', () => {
    expect(amazonHtmlScrapeUrl('https://www.amazon.com.mx/dp/B0BHTTDBC2?psc=1')).toBe(
      'https://www.amazon.com.mx/gp/aw/d/B0BHTTDBC2',
    );
  });

  it('leaves short hops untouched', () => {
    expect(amazonHtmlScrapeUrl('https://link.amazon/B0BHTTDBC2')).toBe(
      'https://link.amazon/B0BHTTDBC2',
    );
  });

  it('detects bot wall HTML', () => {
    expect(
      isAmazonBotWallHtml(
        '<html><title>Amazon.com.mx</title><body>api-services-support@amazon.com</body></html>',
      ),
    ).toBe(true);
    expect(
      isAmazonBotWallHtml(
        `<html><title>Producto : Amazon.com.mx</title><body>${'x'.repeat(20_000)}id="productTitle" colorImages</body></html>`,
      ),
    ).toBe(false);
  });
});

describe('ML social CDN gallery (D_NQ_…-OO) + Dom prices', () => {
  it('accepts modern D_NQ_#####-…-OO.webp stems (not only D_NQ_NP_)', () => {
    const modern = 'https://http2.mlstatic.com/D_NQ_950189-MLA117032275195_092026-OO.webp';
    const classic = 'https://http2.mlstatic.com/D_NQ_NP_632943-MLA108307328738_032026-O.webp';
    expect(isRejectedMercadoLibreImage(modern, 'MLM3138313012')).toBe(false);
    expect(isRejectedMercadoLibreImage(classic, 'MLM3138313012')).toBe(false);

    const merged = mergeMercadoLibreImageCandidates({
      apiPictures: [],
      htmlImages: [
        modern,
        classic,
        'https://http2.mlstatic.com/D_Q_NP_2X_632943-MLA108307328738_032026-V.webp',
      ],
      trustedHtmlImages: [classic],
      allowHtmlCdnFallback: true,
      sourceItemId: 'MLM3138313012',
    });
    expect(merged.length).toBeGreaterThanOrEqual(2);
    expect(merged.some((u) => u.includes('950189'))).toBe(true);
  });

  it('extractMercadoLibreDomPrices reads andes fractions', () => {
    const html = `
      <span class="andes-money-amount--previous">
        <span class="andes-money-amount__fraction">199</span>
      </span>
      <span class="andes-money-amount__fraction">141</span>
    `;
    const p = extractMercadoLibreDomPrices(html);
    expect(p.discount).toBe(141);
    expect(p.original).toBe(199);
  });
});
