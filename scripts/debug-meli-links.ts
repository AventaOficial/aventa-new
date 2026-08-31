import { extractOfferImages, extractMercadoLibreItemIdFromHtml } from '../lib/offers/parseOfferPageHtml.ts';
import { selectOfferImages } from '../lib/offers/selectOfferImages.ts';

async function probe(label, url) {
  const res = await fetch(url, {
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
  const kind = res.url.includes('/social/') ? 'SOCIAL' : res.url.includes('/p/') || res.url.includes('articulo') ? 'PRODUCT' : 'OTHER';
  console.log(`\n${label} [${kind}]`);
  console.log('  final:', res.url.split('?')[0].slice(0, 90));
  console.log('  id:', id);
  console.log('  html imgs:', imgs.length, '→ selected:', selected.length);
}

async function main() {
  await probe('2vWwBNv', 'https://meli.la/2vWwBNv');
  await probe('1BBS5DE', 'https://meli.la/1BBS5DE');
  await probe('1GVx742', 'https://meli.la/1GVx742');
}

main();
