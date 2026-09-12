/**
 * FASE 9 — pilot no persistente Bodega / Walmart / Home Depot.
 * Usa discoverRetailer. No activa flags. No inserta.
 */
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import { isDayToDayFlagOn } from '../lib/hunter/dayToDay/config';
import {
  discoverRetailer,
  profilesForInvestigation,
  rankRetailerRuns,
  resetRetailerDiscoveryMetrics,
  summarizeRetailerDiscoveryMatrix,
  type RetailerDiscoveryRun,
} from '../lib/hunter/retailerDiscovery';

async function main() {
  resetRetailerDiscoveryMetrics();
  const cfg = loadBotIngestConfig();
  const profiles = profilesForInvestigation();
  const runs: RetailerDiscoveryRun[] = [];

  for (const profile of profiles) {
    runs.push(
      await discoverRetailer(profile, {
        budget: { maxRequests: 6, maxPages: 1, maxPilotCandidates: 10, maxCandidates: 10 },
      }),
    );
  }

  const ranked = rankRetailerRuns(profiles, runs);

  console.log(
    JSON.stringify(
      {
        persisted: false,
        inserted: false,
        published: false,
        ranking: ranked.map((p) => p.retailer),
        runs: runs.map((r) => ({
          retailer: r.retailer,
          robotsFetched: r.robotsFetched,
          crawlDelaySeconds: r.crawlDelaySeconds,
          requests: r.requests,
          candidateCount: r.candidateCount,
          offerEvidenceCount: r.offerEvidenceCount,
          evidenceYield: r.evidenceYield,
          verifiedDeals: r.verifiedDeals,
          promotions: r.promotionCount,
          potential: r.potentialCount,
          catalogOnly: r.catalogOnlyCount,
          invalidEvidence: r.invalidEvidenceCount,
          errors: r.errors,
          latencyMs: r.latencyMs,
          antiBot: r.antiBot,
          surfaces: r.surfaces.map((s) => ({
            id: s.surfaceId,
            url: s.url,
            robotsAllowed: s.robotsAllowed,
            httpStatus: s.httpStatus,
            challenged: s.challenged,
            timedOut: s.timedOut,
            candidates: s.candidateCount,
            yield: s.evidenceYield,
            verified: s.verifiedDeals,
            promotions: s.promotionCount,
            catalog: s.catalogOnlyCount,
            potential: s.potentialCount,
            invalid: s.invalidEvidenceCount,
            suggested: s.suggestedStatus,
            declared: s.declaredStatus,
            errorCode: s.errorCode,
            samples: s.samples,
          })),
        })),
        matrix: summarizeRetailerDiscoveryMatrix(),
        flags: {
          chedraui: isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED'),
          bodega: isDayToDayFlagOn('DAY_TO_DAY_BODEGA_ENABLED'),
          walmart: isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED'),
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
