import { fetchMercadoLibrePublicOffer } from '../lib/offers/mlPublicOffer.ts';
import { extractOfferImages, extractMercadoLibreItemIdFromHtml } from '../lib/offers/parseOfferPageHtml.ts';
import { selectOfferImages } from '../lib/offers/selectOfferImages.ts';
import { resolveMercadoLibreShortlinks } from '../lib/offerUrl.ts';

async function main() {
  const input = 'https://meli.la/2vWwBNv';
  const resolved = await resolveMercadoLibreShortlinks(input);
  const res = await fetch(resolved, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/124' },
  });
  const html = await res.text();
  const htmlImgs = extractOfferImages(html, res.url);
  const ml = await fetchMercadoLibrePublicOffer(res.url, html);
  const merged = selectOfferImages([...(ml?.pictures ?? []), ...htmlImgs]);
  console.log('input', input);
  console.log('resolved', resolved);
  console.log('fetch final', res.url.split('?')[0]);
  console.log('item id', extractMercadoLibreItemIdFromHtml(html));
  console.log('ml api pictures', ml?.pictures?.length ?? 0, 'source', ml?.source);
  console.log('html imgs', htmlImgs.length);
  console.log('merged selected', merged.length);
}

main();
