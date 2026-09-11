/**
 * FASE 7.2 — Validación real de precio ML (sin secrets, sin persistir).
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvLocal();
if (!process.env.ML_OAUTH_ENABLED) process.env.ML_OAUTH_ENABLED = '1';

const TEST_URL =
  'https://www.mercadolibre.com.mx/p/MLM18625838?pdp_filters=item_id:MLM1413356802&matt_tool=17030900#origin=share&sid=share&wid=MLM1413356802&action=copy';

async function main() {
  const { resolveMercadoLibreItem } = await import('../lib/offers/resolveMercadoLibreItem');
  const { resolveMercadoLibrePrice, clearMercadoLibrePriceCache } = await import(
    '../lib/offers/resolveMercadoLibrePrice'
  );
  const { fetchMercadoLibrePublicOffer } = await import('../lib/offers/mlPublicOffer');
  const { loadBotIngestConfig } = await import('../lib/bots/ingest/config');

  clearMercadoLibrePriceCache();
  const resolved = resolveMercadoLibreItem(TEST_URL);
  const price = await resolveMercadoLibrePrice({
    itemId: resolved?.itemId ?? 'MLM1413356802',
    siteId: resolved?.siteId,
    catalogProductId: resolved?.catalogProductId,
    bypassCache: true,
  });
  const offer = await fetchMercadoLibrePublicOffer(TEST_URL);
  const cfg = loadBotIngestConfig();

  const pass =
    resolved?.itemId === 'MLM1413356802' &&
    resolved?.catalogProductId === 'MLM18625838' &&
    price.status === 'resolved' &&
    typeof price.price === 'number' &&
    price.price > 0 &&
    price.currency === 'MXN' &&
    offer?.price === price.price &&
    (offer?.pictures?.length ?? 0) >= 1 &&
    !cfg.legacyAutoApproveWriteEnabled;

  console.log(
    JSON.stringify(
      {
        pass,
        itemId: resolved?.itemId,
        catalogProductId: resolved?.catalogProductId,
        title: offer?.title?.slice(0, 80) ?? null,
        pictures: offer?.pictures?.length ?? 0,
        price: price.price,
        originalPrice: price.originalPrice,
        currency: price.currency,
        priceSource: price.resolvedBy,
        priceStatus: price.status,
        offerPrice: offer?.price ?? null,
        offerPriceSource: offer?.priceSource ?? null,
        legacyAutoApproveWriteEnabled: cfg.legacyAutoApproveWriteEnabled,
      },
      null,
      2,
    ),
  );
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: e instanceof Error ? e.message : String(e) }));
  process.exit(2);
});
