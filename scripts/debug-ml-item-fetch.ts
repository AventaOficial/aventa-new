process.env.ML_OAUTH_ENABLED = '1';

import { fetchMlApi } from '../lib/integrations/mercadolibre/apiClient';
import { fetchMercadoLibreItemsMulti } from '../lib/bots/ingest/mlItemDetails';

async function main() {
  const hl = await fetchMlApi('/highlights/MLM/category/MLM1246');
  const content = (hl.data as { content?: Array<{ id?: string }> }).content ?? [];
  const productId = content[0]?.id!;
  const items = await fetchMlApi(`/products/${productId}/items`);
  const results = (items.data as { results?: Array<{ item_id?: string }> }).results ?? [];
  const itemId = results[0]?.item_id!;
  console.log({ productId, itemId });

  const one = await fetchMlApi(`/items/${itemId}`);
  console.log('item', { ok: one.ok, status: one.status, auth: one.authenticated });
  console.log('itemData', one.ok ? JSON.stringify(one.data).slice(0, 500) : null);

  const bulk = await fetchMlApi(`/items?ids=${itemId}`);
  console.log('bulk', { ok: bulk.ok, status: bulk.status });
  console.log('bulkData', bulk.ok ? JSON.stringify(bulk.data).slice(0, 500) : null);

  const multi = await fetchMercadoLibreItemsMulti([itemId]);
  console.log('multi size', multi.size, [...multi.keys()]);
  if (multi.size) {
    const body = multi.get(itemId)!;
    console.log({ title: body.title, price: body.price, original: body.original_price });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
