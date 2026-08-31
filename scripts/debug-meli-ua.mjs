const shortUrl = process.argv[2] || 'https://meli.la/2vWwBNv';
const uas = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  aventa: 'Mozilla/5.0 (compatible; AVENTA-OfferUrl/1.0; +https://aventaofertas.com)',
};

for (const [label, ua] of Object.entries(uas)) {
  const res = await fetch(shortUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': ua, Accept: 'text/html' },
  });
  const html = await res.text();
  const og = html.match(/property="og:image"[^>]*content="([^"]+)"/i)?.[1];
  const secure = [...html.matchAll(/"secure_url"\s*:\s*"(https:[^"]+mlstatic[^"]+)"/gi)].length;
  console.log('\n===', label, '===');
  console.log('final:', res.url.slice(0, 120) + (res.url.length > 120 ? '...' : ''));
  console.log('og:image', og ? og.slice(0, 80) : null);
  console.log('secure_url count', secure);
}
