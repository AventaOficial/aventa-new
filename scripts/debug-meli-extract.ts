import { extractOfferImages, extractMercadoLibreItemIdFromHtml } from '../lib/offers/parseOfferPageHtml.ts';
import { selectOfferImages, mercadoLibreImageResourceId } from '../lib/offers/selectOfferImages.ts';

async function main() {
  const res = await fetch('https://meli.la/2vWwBNv', {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  const html = await res.text();
  const id = extractMercadoLibreItemIdFromHtml(html);
  const imgs = extractOfferImages(html, res.url);
  const selected = selectOfferImages(imgs);
  console.log('final', res.url.split('?')[0]);
  console.log('extracted id', id);
  console.log('html images raw', imgs.length);
  console.log('after selectOfferImages', selected.length);
  const keys = imgs.map((u) => mercadoLibreImageResourceId(u));
  console.log('unique resource keys', new Set(keys).size);
  console.log('first 5 keys', [...new Set(keys)].slice(0, 5));
}

main();
