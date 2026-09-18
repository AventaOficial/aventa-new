process.env.ML_OAUTH_ENABLED = '1';
import { fetchMlApi } from '../lib/integrations/mercadolibre/apiClient';
import { getValidAccessToken } from '../lib/integrations/mercadolibre/tokenRefresh';

async function probe(id: string) {
  const paths = [
    `/items/${id}`,
    `/items/${id}/prices`,
    `/items/${id}/sale_price`,
    `/products/${id}`,
    `/products/${id}/items`,
  ];
  const out: Record<string, unknown> = { id };
  for (const path of paths) {
    const r = await fetchMlApi(path);
    out[path] = {
      ok: r.ok,
      status: r.status,
      auth: r.authenticated,
      keys: r.ok && r.data && typeof r.data === 'object' ? Object.keys(r.data as object).slice(0, 12) : null,
    };
  }
  return out;
}

async function main() {
  const tok = await getValidAccessToken();
  console.log({ hasToken: Boolean(tok) });
  const ids = ['MLM3446533433', 'MLMU3718209495', 'MLM67666199'];
  for (const id of ids) {
    console.log(JSON.stringify(await probe(id), null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
