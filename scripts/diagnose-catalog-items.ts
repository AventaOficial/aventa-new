process.env.ML_OAUTH_ENABLED = '1';
import { fetchMlApi } from '../lib/integrations/mercadolibre/apiClient';

async function main() {
  const id = 'MLM67666199';
  const items = await fetchMlApi(`/products/${id}/items`);
  const results = items.ok ? ((items.data as { results?: Array<Record<string, unknown>> }).results ?? []) : [];
  console.log(
    JSON.stringify(
      {
        count: results.length,
        sample: results.slice(0, 5).map((r) => ({
          item_id: r.item_id,
          price: r.price,
          original_price: r.original_price,
          currency_id: r.currency_id,
          condition: r.condition,
        })),
      },
      null,
      2,
    ),
  );
  const iid = String(results[0]?.item_id ?? '');
  if (!iid) return;
  const pr = await fetchMlApi(`/items/${iid}/prices`);
  console.log('item_prices', iid, { ok: pr.ok, status: pr.status, data: pr.ok ? pr.data : null });
  const item = await fetchMlApi(`/items/${iid}`);
  const d = item.ok ? (item.data as Record<string, unknown>) : null;
  console.log('item', {
    ok: item.ok,
    title: d?.title ?? null,
    permalink: d?.permalink ?? null,
    price: d?.price ?? null,
    original: d?.original_price ?? null,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
