process.env.ML_OAUTH_ENABLED = '1';

import { fetchMlApi } from '../lib/integrations/mercadolibre/apiClient';
import { getValidAccessToken } from '../lib/integrations/mercadolibre/tokenRefresh';

async function main() {
  const token = await getValidAccessToken();
  console.log({ tokenLen: token?.length ?? 0 });

  const paths = [
    '/sites/MLM/search?q=perfume&limit=1',
    '/sites/MLM/search?q=laptop&limit=1',
    '/users/me',
    '/items/MLM1234567890',
  ];
  for (const path of paths) {
    const r = await fetchMlApi(path);
    console.log(path, { ok: r.ok, status: r.status, auth: r.authenticated });
  }

  // Legacy query-param token style (algunos endpoints ML aún lo aceptan)
  if (token) {
    const url = `https://api.mercadolibre.com/sites/MLM/search?q=perfume&limit=1&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    console.log('query_token_search', res.status, (await res.text()).slice(0, 180));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
