/**
 * Diagnóstico puntual: sticky targets → resolveMercadoLibrePrice → observeStickySkuViaServer.
 */
import { createServerClient } from '../lib/supabase/server';
import { selectStickySkuTargets } from '../lib/hunter/supply/stickySku';
import { observeStickySkuViaServer } from '../lib/hunter/supply/observeStickySkus';
import { resolveMercadoLibrePrice } from '../lib/offers/resolveMercadoLibrePrice';
import { fetchMlApi } from '../lib/integrations/mercadolibre/apiClient';

if (!process.env.ML_OAUTH_ENABLED) process.env.ML_OAUTH_ENABLED = '1';

async function main() {
  console.log('ML_OAUTH_ENABLED', process.env.ML_OAUTH_ENABLED);
  console.log('has_ML_CLIENT_ID', Boolean(process.env.ML_CLIENT_ID || process.env.MERCADOLIBRE_CLIENT_ID));
  console.log('has_ML_CLIENT_SECRET', Boolean(process.env.ML_CLIENT_SECRET || process.env.MERCADOLIBRE_CLIENT_SECRET));
  console.log('has_ML_REFRESH_TOKEN', Boolean(process.env.ML_REFRESH_TOKEN || process.env.MERCADOLIBRE_REFRESH_TOKEN));
  console.log('has_ML_ACCESS_TOKEN', Boolean(process.env.ML_ACCESS_TOKEN || process.env.MERCADOLIBRE_ACCESS_TOKEN));

  const supabase = createServerClient();
  const targets = await selectStickySkuTargets({ supabase, config: { maxTargets: 4 } });
  console.log(
    'targets',
    targets.map((t) => ({
      productId: t.productId,
      historyDays: t.historyDays,
      lastObservedAt: t.lastObservedAt,
    })),
  );

  for (const t of targets.slice(0, 4)) {
    const itemId = t.productId.replace(/-/g, '').toUpperCase();
    const rawPrices = await fetchMlApi(`/items/${encodeURIComponent(itemId)}/prices`);
    console.log('RAW_PRICES', itemId, {
      ok: rawPrices.ok,
      status: rawPrices.status,
      authMode: rawPrices.authMode,
      error: rawPrices.error,
      bodyKeys: rawPrices.data && typeof rawPrices.data === 'object' ? Object.keys(rawPrices.data as object) : null,
      sample: rawPrices.data
        ? JSON.stringify(rawPrices.data).slice(0, 400)
        : null,
    });

    const price = await resolveMercadoLibrePrice({ itemId, bypassCache: true });
    console.log('RESOLVED', itemId, price);

    const obs = await observeStickySkuViaServer({
      productId: itemId,
      nicheId: 'beauty',
      persistSnapshots: false,
      supabase,
    });
    console.log('OBS', itemId, {
      status: obs.observationStatus,
      price: obs.price,
      original: obs.originalPrice,
      title: obs.title?.slice(0, 60) ?? null,
      image: Boolean(obs.imageUrl),
      provenance: obs.provenance,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
