import { extractOfferImages } from '../lib/offers/parseOfferPageHtml.ts';
import { selectOfferImages, mercadoLibreImageResourceId } from '../lib/offers/selectOfferImages.ts';

async function main() {
  const res = await fetch('https://meli.la/2vWwBNv', {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124' },
  });
  const html = await res.text();
  const cdn = [
    ...html.matchAll(
      /(https?:\/\/http2\.mlstatic\.com\/D_(?:NQ_NP_2X_)?[A-Za-z0-9_-]+\.(?:jpg|jpeg|webp|png))/gi,
    ),
  ].map((m) => m[1] || m[0]);
  console.log('cdn raw', cdn.length);
  console.log('unique stems', new Set(cdn.map((u) => mercadoLibreImageResourceId(u))).size);
  console.log('selectOfferImages cdn only', selectOfferImages(cdn).length);
  console.log('extractOfferImages', extractOfferImages(html, res.url).length);
  console.log('samples', cdn.slice(0, 3));
}

main();
