import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareMachineCandidateOffer } from '@/lib/offers/ingestion/prepareMachineCandidateOffer';
import { evaluateMachineCandidateAdmission } from '@/lib/offers/ingestion/machineCandidatePolicy';

const URL = 'https://www.soriana.com/leche-uht-lala-deslactosada-1-litro-6-piezas/11400966.html';
const IMAGE = 'https://www.soriana.com/dw/image/v2/BGBD_PRD/on/demandware.static/-/Sites-soriana-grocery-master-catalog/default/dw1/images/product/11400966.jpg';

function sorianaPage(strike: string | null): string {
  const list = strike
    ? `<div class="list d-flex align-items-center inline-max-content-disabled align-self-start size-price-content align-self-lg-center"> <span class="value " content="${strike}"> <span class="strike-through cart-price price-plp price-not-found price-pdp text-truncate "> $${strike} </span> </span> </div>`
    : '';
  return `<html><head>
    <meta property="og:image" content="${IMAGE}" />
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'http://schema.org/',
      '@type': 'Product',
      name: 'Leche UHT Lala Deslactosada 1 Litro 6 Piezas',
      image: [IMAGE],
      offers: { '@type': 'Offer', priceCurrency: 'MXN', price: '163.00', availability: 'http://schema.org/InStock' },
    })}</script></head><body>${list}${list}</body></html>`;
}

function stubPage(html: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })),
  );
}

async function admit(html: string, botDeclared: { price: number | null; originalPrice: number | null }) {
  stubPage(html);
  const prepared = await prepareMachineCandidateOffer(URL);
  return {
    prepared,
    admission: evaluateMachineCandidateAdmission({ url: URL, prepared, botDeclared, isLowQualityTitle: () => false }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Soriana: del tachado de la ficha a la política MCP', () => {
  it('el tachado visible confirma el precio de lista con fuente de página', async () => {
    const { prepared, admission } = await admit(sorianaPage('224.50'), { price: 163, originalPrice: 224.5 });
    expect(prepared.price).toBe(163);
    expect(prepared.priceSource).toBe('retail_html');
    expect(prepared.originalPrice).toBe(224.5);
    expect(prepared.originalPriceSource).toBe('retail_html');
    expect(admission).toMatchObject({
      outcome: 'admit',
      kind: 'list_price_comparison',
      price: 163,
      originalPrice: 224.5,
      originalPriceProvenance: 'source_explicit',
      referenceDropped: null,
    });
  });

  it('sin tachado, el precio de lista que declara el bot no llega a la oferta', async () => {
    const { prepared, admission } = await admit(sorianaPage(null), { price: 163, originalPrice: 224.5 });
    expect(prepared.originalPrice).toBeNull();
    expect(admission).toMatchObject({
      outcome: 'admit',
      kind: 'price_opportunity',
      originalPrice: null,
      referenceDropped: 'absent',
      botDeclared: { price: 163, originalPrice: 224.5 },
    });
  });

  it('el precio actual siempre sale de la ficha, no del bot', async () => {
    const { admission } = await admit(sorianaPage('224.50'), { price: 99, originalPrice: 500 });
    expect(admission).toMatchObject({ outcome: 'admit', price: 163, originalPrice: 224.5 });
  });
});
