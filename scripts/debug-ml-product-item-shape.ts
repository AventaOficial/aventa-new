process.env.ML_OAUTH_ENABLED = '1';

import { fetchMlApi } from '../lib/integrations/mercadolibre/apiClient';

async function main() {
  const hl = await fetchMlApi('/highlights/MLM/category/MLM1246');
  const productId = (hl.data as { content?: Array<{ id?: string }> }).content?.[0]?.id!;
  const items = await fetchMlApi(`/products/${productId}/items`);
  const results = (items.data as { results?: unknown[] }).results ?? [];
  console.log('first result keys', results[0] ? Object.keys(results[0] as object) : null);
  console.log(JSON.stringify(results[0], null, 2));

  const product = await fetchMlApi(`/products/${productId}`);
  console.log(
    'product fields',
    product.ok
      ? {
          name: (product.data as { name?: string }).name,
          permalink: (product.data as { permalink?: string }).permalink,
          buy_box: (product.data as { buy_box_winner?: unknown }).buy_box_winner,
        }
      : product,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
