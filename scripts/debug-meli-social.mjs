const res = await fetch('https://meli.la/2vWwBNv', {
  redirect: 'follow',
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124' },
});
const h = await res.text();
const ids = [...h.matchAll(/MLM-?\d{6,}/gi)].map((m) => m[0]);
console.log('final', res.url.split('?')[0]);
console.log('MLM ids unique', [...new Set(ids)].slice(0, 15));
console.log('item_id snippets', h.match(/item_id[^,\n]{0,100}/gi)?.slice(0, 8));
console.log('catalog_product_id', h.match(/catalog_product_id[^,\n]{0,100}/gi)?.slice(0, 5));
console.log('pictures arrays', (h.match(/"pictures"\s*:\s*\[/g) || []).length);
const ogCount = (h.match(/og:image/gi) || []).length;
console.log('og:image mentions', ogCount);
