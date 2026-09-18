process.env.ML_OAUTH_ENABLED = '1';

import { fetchMlApi } from '../lib/integrations/mercadolibre/apiClient';

async function main() {
  const product = await fetchMlApi('/products/MLM19559684');
  const d = product.data as Record<string, unknown>;
  console.log(
    Object.keys(d).filter((k) => /pic|image|thumb|permalink|name|price/i.test(k)),
  );
  console.log({
    name: d.name,
    pictures: Array.isArray(d.pictures) ? d.pictures.slice(0, 2) : d.pictures,
    short: JSON.stringify(d).includes('http'),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
