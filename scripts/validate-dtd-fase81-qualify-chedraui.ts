/**
 * FASE 8.1 — pilot Chedraui no persistente.
 * Discovery en proceso únicamente. No toca production env.
 */
import { chedrauiSource } from '../lib/hunter/dayToDay/adapters';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import {
  getDealQualificationMetrics,
  resetDealQualificationMetrics,
} from '../lib/hunter/dealQualification';

async function main() {
  process.env.DAY_TO_DAY_PILOT = '1';
  process.env.DAY_TO_DAY_CHEDRAUI_DISCOVERY = '1';
  delete process.env.DAY_TO_DAY_FIXTURES;
  resetDealQualificationMetrics();

  const cfg = loadBotIngestConfig();
  const t0 = Date.now();
  const result = await chedrauiSource.collect({ config: cfg, rotationWave: 0 });
  const metrics = getDealQualificationMetrics();

  console.log(
    JSON.stringify(
      {
        id: 'chedraui_mx',
        ok: result.ok,
        errorCode: result.errorCode ?? null,
        pipelineCandidates: result.candidates.length,
        skipReasonCounts: result.skipReasonCounts ?? {},
        qualificationSamples: result.qualificationSamples ?? [],
        latencyMs: Date.now() - t0,
        persisted: false,
        qualification: {
          evaluated: metrics.candidatesEvaluated,
          verifiedDeals: metrics.verifiedDeals,
          promotions: metrics.promotions,
          potentialDeals: metrics.potentialDeals,
          noVerifiedDeals: metrics.noVerifiedDeals,
          catalogOnlyPct: metrics.catalogOnlyPct,
          verifiedDealPct: metrics.verifiedDealPct,
          topRejectionReasons: metrics.topRejectionReasons,
        },
        samples: result.candidates.slice(0, 10).map((c) => ({
          title: c.title,
          price: c.price,
          originalPrice: c.originalPrice,
          url: c.url,
          qualification: c.rawMetadata.dealQualification ?? null,
          reasons: c.rawMetadata.dealQualificationReasons ?? null,
          provenance: c.rawMetadata.originalPriceProvenance ?? null,
          monetization: c.rawMetadata.monetizationStatus ?? null,
        })),
        flags: {
          chedrauiEnabled: process.env.DAY_TO_DAY_CHEDRAUI_ENABLED ?? null,
          autoPublish: process.env.BOT_INGEST_AUTO_PUBLISH ?? null,
          legacyAutoApprove: cfg.legacyAutoApproveWriteEnabled,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
