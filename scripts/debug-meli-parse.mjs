const shortUrl = process.argv[2] || 'https://meli.la/2vWwBNv';

function mlResourceId(raw) {
  const path = new URL(raw).pathname;
  const withVariant = path.match(
    /D_(?:NQ_NP_2X_|NQ_NP_|Q_NP_)?([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)(?:-[IOF])\.(?:jpg|jpeg|webp|png)/i,
  );
  if (withVariant) return withVariant[1].toUpperCase();
  const loose = path.match(/D_(?:NQ_NP_2X_|NQ_NP_|Q_NP_)?([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/i);
  return loose ? loose[1].toUpperCase() : null;
}

function selectCount(urls) {
  const map = new Map();
  for (const u of urls) {
    const k = mlResourceId(u) || u;
    map.set(k, u);
  }
  return map.size;
}

const res = await fetch(shortUrl, {
  redirect: 'follow',
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; AVENTA-OfferUrl/1.0)',
    Accept: 'text/html',
  },
});
console.log('final URL:', res.url);
const html = await res.text();
const idMatch = res.url.match(/\/(ML[A-Z0-9-]{6,})/i) || html.match(/MLM-?\d{6,}/i);
const id = idMatch ? idMatch[0].replace(/^\//, '').replace(/-/g, '') : null;
console.log('item id:', id);

const secureUrls = [...html.matchAll(/"secure_url"\s*:\s*"(https:[^"]+mlstatic[^"]+)"/gi)].map((m) =>
  m[1].replace(/\\u002F/g, '/'),
);
console.log('HTML secure_url count:', secureUrls.length);
console.log('HTML selectCount:', selectCount(secureUrls));

if (id) {
  for (const path of [`/items/${id}`, `/products/${id}`]) {
    const api = await fetch(`https://api.mercadolibre.com${path}`, {
      headers: { Accept: 'application/json' },
    });
    console.log(path, 'status', api.status);
    if (!api.ok) continue;
    const json = await api.json();
    const pics = json.pictures ?? [];
    console.log(path, 'pictures count', pics.length);
    const urls = pics
      .map((p) => p.secure_url || p.url || (p.id ? `https://http2.mlstatic.com/D_NQ_NP_2X_${p.id}-F.webp` : null))
      .filter(Boolean);
    console.log(
      path,
      'keys sample',
      urls.slice(0, 6).map((u) => mlResourceId(u)),
    );
    console.log(path, 'selectCount', selectCount(urls));
  }
}
