process.env.ML_OAUTH_ENABLED = '1';

import { fetchMlApi } from '../lib/integrations/mercadolibre/apiClient';

async function main() {
  const id = 'MLM19559684';
  const paths = [
    `/products/${id}/items`,
    `/products/${id}`,
    `/sites/MLM/search?product_identifier=${id}&limit=2`,
    `/sites/MLM/search?catalog_product_id=${id}&limit=2`,
  ];
  for (const p of paths) {
    const r = await fetchMlApi(p);
    console.log(JSON.stringify({ path: p, ok: r.ok, status: r.status, snippet: r.ok ? JSON.stringify(r.data).slice(0, 350) : null }));
  }

  // domain discovery → maybe list items another way
  const dom = await fetchMlApi('/sites/MLM/domain_discovery/search?q=perfume%20mujer&limit=3');
  console.log('domain', dom.ok, JSON.stringify(dom.data).slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
