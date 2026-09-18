process.env.ML_OAUTH_ENABLED = '1';

import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import { discoverMercadoLibreIngestItems } from '../lib/bots/ingest/discoverMercadoLibre';
import { applyNicheProfileToIngestConfig } from '../lib/hunter/supply/applyNicheProfile';
import { NICHE_BEAUTY } from '../lib/hunter/supply/nicheProfiles';

async function main() {
  const cfg = applyNicheProfileToIngestConfig(loadBotIngestConfig('standard'), NICHE_BEAUTY);
  const out = await discoverMercadoLibreIngestItems(cfg, new Set(), 0);
  console.log(
    JSON.stringify(
      {
        collected: out.collectedCount,
        items: out.items.length,
        skips: out.skipReasonCounts,
        sample: out.items.slice(0, 5).map((i) => ({
          title: i.precomputedMeta?.title,
          detail: i.sourceDetail,
          price: i.precomputedMeta?.discountPrice,
          original: i.precomputedMeta?.originalPrice,
          disc: i.precomputedMeta?.discountPercent,
          sold: i.precomputedMeta?.signals?.soldQuantity,
          historyReady: i.precomputedMeta?.signals?.historyReady,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
