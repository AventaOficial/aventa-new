import { extractMercadoLibrePdpEvidence } from '../src/extractPdpEvidence.mjs';

const cases = [
  {
    id: 'beauty',
    url: 'https://articulo.mercadolibre.com.mx/MLM-100',
    html: `<meta property="og:title" content="Serum vitamina C" />
      <meta property="og:image" content="https://http2.mlstatic.com/x.webp" />
      <meta property="product:price:amount" content="299" />
      <meta property="product:original_price:amount" content="499" />
      <h1>Serum vitamina C</h1>`,
  },
  {
    id: 'electronics',
    url: 'https://www.mercadolibre.com.mx/ssd/p/MLM200?wid=MLM200',
    html: `<meta property="og:title" content="SSD 1TB" />
      <meta property="og:image" content="https://http2.mlstatic.com/y.webp" />
      <div class="ui-pdp-price__second-line"><span class="andes-money-amount__fraction">1.299</span></div>
      <span class="andes-money-amount andes-money-amount--previous"><span class="andes-money-amount__fraction">1.899</span></span>
      {"price":1299,"currency_id":"MXN","original_price":1899}`,
  },
  {
    id: 'day_to_day',
    url: 'https://articulo.mercadolibre.com.mx/MLM-300',
    html: `<meta property="og:title" content="Detergente 3L" />
      <meta property="og:image" content="https://http2.mlstatic.com/z.webp" />
      <script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","price":"189","priceCurrency":"MXN","highPrice":"249"}}</script>
      <h1>Detergente 3L</h1>`,
  },
  {
    id: 'blocked',
    url: 'https://www.mercadolibre.com.mx/gz/account-verification?go=x',
    html: `<div class="account-verification-main">login</div>
      <link href="suspicious-traffic-frontend/x.css" />`,
  },
];

let pdpSuccess = 0;
for (const c of cases) {
  const ev = extractMercadoLibrePdpEvidence(c.html, { url: c.url });
  if (ev.ok && ev.price?.value > 0) pdpSuccess += 1;
  console.log(
    JSON.stringify({
      niche: c.id,
      ok: ev.ok,
      blocked: ev.blocked,
      reason: ev.reason,
      price: ev.price?.value ?? null,
      original: ev.originalPrice?.value ?? null,
      incomplete: ev.incomplete,
      sources: ev.evidence,
    }),
  );
}
console.log(JSON.stringify({ stickyPdpSuccessAfterExtractor: pdpSuccess, stickyPdpSuccessBefore: 0 }));
