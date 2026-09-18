process.env.ML_OAUTH_ENABLED = '1';

import { fetchMlApi } from '../lib/integrations/mercadolibre/apiClient';

async function main() {
  const paths = [
    '/sites/MLM/domain_discovery/search?q=perfume&limit=2',
    '/highlights/MLM/category/MLM1246',
    '/sites/MLM/hot_items/search?category=MLM1246&limit=2',
    '/categories/MLM1246',
    '/sites/MLM/search?category=MLM1246&limit=2',
  ];
  for (const p of paths) {
    const r = await fetchMlApi(p);
    const snippet =
      r.ok && r.data && typeof r.data === 'object'
        ? JSON.stringify(r.data).slice(0, 160)
        : null;
    console.log(JSON.stringify({ path: p, ok: r.ok, status: r.status, snippet }));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
