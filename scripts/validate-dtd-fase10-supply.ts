/**
 * FASE 10 dry-run. No persiste. No activa retailers. No toca production offers.
 */
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import { isDayToDayFlagOn } from '../lib/hunter/dayToDay/config';
import { communitySupplySource, runSupplyRouter, type SupplySource } from '../lib/hunter/supply';
import { toSupplyCandidate } from '../lib/hunter/supply/candidate';
import { AUTONOMOUS_POLICY_V1 } from '../lib/autonomous/policy';
import { DEAL_VERIFIER_THRESHOLDS } from '../lib/verifier/thresholds';

function machineSource(): SupplySource {
  return {
    ...communitySupplySource,
    id: 'ml_worker',
    displayName: 'ML Worker (dry-run)',
    family: 'external_worker',
    type: 'external_worker',
    hunterSourceId: 'ml_worker',
    ingestSourceId: 'ml_worker',
    async collect() {
      return {
        ok: true,
        candidates: [
          toSupplyCandidate({
            item: {
              url: 'https://articulo.mercadolibre.com.mx/MLM-1111111111-taladro-_JM',
              source: 'ml_worker',
              sourceDetail: 'dry-run:ml',
              precomputedMeta: {
                canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1111111111-taladro-_JM',
                title: 'Taladro Bosch 20V',
                store: 'Mercado Libre',
                imageUrl: 'https://http2.mlstatic.com/taladro.jpg',
                discountPrice: 799,
                originalPrice: 999,
                discountPercent: 20,
                signals: {
                  currentPriceProvenance: 'source_explicit',
                  originalPriceProvenance: 'source_explicit',
                },
              },
            },
            hunterSourceId: 'ml_worker',
            sourceId: 'ml_worker',
            sourceFamily: 'external_worker',
            sourceType: 'external_worker',
          }),
        ],
      };
    },
  };
}

async function main() {
  const cfg = loadBotIngestConfig();
  const down: SupplySource = {
    ...communitySupplySource,
    id: 'amazon_paapi',
    displayName: 'Amazon PA-API (unavailable)',
    family: 'official_api',
    type: 'official_api',
    hunterSourceId: 'amazon_paapi',
    isEnabled: () => true,
    isConfigured: () => false,
    async collect() {
      throw new Error('should not collect when not configured');
    },
  };

  const report = await runSupplyRouter({
    config: cfg,
    persist: false,
    communityUrls: [
      'https://articulo.mercadolibre.com.mx/MLM-1111111111-taladro-_JM',
      'https://www.chedraui.com.mx/te-manzanilla/p',
    ],
    sources: [communitySupplySource, machineSource(), down],
    collectOverrides: {
      community: async () => ({
        ok: true,
        candidates: [
          toSupplyCandidate({
            item: {
              url: 'https://www.chedraui.com.mx/te-manzanilla/p',
              source: 'env_urls',
              sourceDetail: 'community:paste',
              precomputedMeta: {
                canonicalUrl: 'https://www.chedraui.com.mx/te-manzanilla/p',
                title: 'Té manzanilla 2x1',
                store: 'Chedraui',
                imageUrl: 'https://www.chedraui.com.mx/img/te.jpg',
                discountPrice: 40,
                originalPrice: null,
                discountPercent: 0,
                signals: {
                  currentPriceProvenance: 'source_explicit',
                  promotionType: '2x1',
                  promotionBoundToProduct: true,
                },
              },
            },
            hunterSourceId: 'env_urls',
            sourceId: 'community',
            sourceFamily: 'community',
            sourceType: 'community',
          }),
          toSupplyCandidate({
            item: {
              url: 'https://articulo.mercadolibre.com.mx/MLM-1111111111-taladro-_JM',
              source: 'ml_api',
              sourceDetail: 'community:paste',
              precomputedMeta: {
                canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-1111111111-taladro-_JM',
                title: 'Taladro Bosch 20V',
                store: 'Mercado Libre',
                imageUrl: 'https://http2.mlstatic.com/taladro.jpg',
                discountPrice: 799,
                originalPrice: 999,
                discountPercent: 20,
                signals: {
                  currentPriceProvenance: 'source_explicit',
                  originalPriceProvenance: 'source_explicit',
                },
              },
            },
            hunterSourceId: 'ml_api_legacy',
            sourceId: 'community',
            sourceFamily: 'community',
            sourceType: 'community',
          }),
        ],
      }),
    },
  });

  console.log(
    JSON.stringify(
      {
        persisted: report.persisted,
        published: report.published,
        inserted: report.inserted,
        rewardsTouched: report.rewardsTouched,
        verifierBypassed: report.verifierBypassed,
        globalStatus: report.globalStatus,
        recommendedAction: report.recommendedAction,
        candidatesDiscovered: report.candidatesDiscovered,
        unique: report.uniqueCandidates.map((c) => ({
          sourceId: c.sourceId,
          url: c.canonicalUrl,
          qualification: c.qualification,
          monetization: c.monetizationStatus,
          verifier: c.verifierDecision,
          autonomous: c.autonomousDecision,
        })),
        duplicates: report.duplicateCandidates.map((c) => ({
          sourceId: c.sourceId,
          of: c.duplicateOf,
          reason: c.duplicateReason,
        })),
        runs: report.runs.map((r) => ({
          id: r.sourceId,
          attempted: r.attempted,
          skipped: r.skippedReason,
          ok: r.ok,
          isolatedFailure: r.isolatedFailure,
        })),
        flags: {
          chedraui: isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED'),
          bodega: isDayToDayFlagOn('DAY_TO_DAY_BODEGA_ENABLED'),
          walmart: isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED'),
          autoPublish: process.env.BOT_INGEST_AUTO_PUBLISH ?? null,
          legacyAutoApprove: cfg.legacyAutoApproveWriteEnabled,
          verifierCap: DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap,
          autonomousMin: AUTONOMOUS_POLICY_V1.minAutoApproveConfidence,
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
