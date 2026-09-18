process.env.ML_OAUTH_ENABLED = '1';

import { fetchMlApi } from '../lib/integrations/mercadolibre/apiClient';
import { fetchMercadoLibreItemsMulti } from '../lib/bots/ingest/mlItemDetails';

async function main() {
  const r = await fetchMlApi('/highlights/MLM/category/MLM1246');
  if (!r.ok || !r.data || typeof r.data !== 'object') {
    console.log('highlights failed', r);
    return;
  }
  const content = (r.data as { content?: Array<{ id?: string; type?: string }> }).content ?? [];
  const ids = content.map((c) => c.id).filter(Boolean).slice(0, 8) as string[];
  console.log('ids', ids);

  const items = await fetchMercadoLibreItemsMulti(ids);
  console.log('items map size', items.size);

  for (const id of ids.slice(0, 3)) {
    const product = await fetchMlApi(`/products/${id}`);
    console.log(
      JSON.stringify({
        id,
        productOk: product.ok,
        status: product.status,
        snippet: product.ok ? JSON.stringify(product.data).slice(0, 400) : null,
      }),
    );
  }

  // Also try items from a known listing if product has buy_box
  if (ids[0]) {
    const p = await fetchMlApi(`/products/${ids[0]}`);
    if (p.ok && p.data && typeof p.data === 'object') {
      const d = p.data as {
        buy_box_winner?: { item_id?: string; price?: number };
        name?: string;
      };
      console.log('buy_box', d.buy_box_winner, 'name', d.name);
      if (d.buy_box_winner?.item_id) {
        const item = await fetchMlApi(`/items/${d.buy_box_winner.item_id}`);
        console.log('winner item', item.ok, item.status, JSON.stringify(item.data).slice(0, 500));
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
