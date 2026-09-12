/**
 * FASE 9.1 — Home Depot sitemap → PDP, no persistente.
 * No crea adapter. No activa flags.
 */
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import { isDayToDayFlagOn } from '../lib/hunter/dayToDay/config';
import { discoverSitemapChannel, profileFor } from '../lib/hunter/retailerDiscovery';

async function main() {
  const profile = profileFor('home_depot_mx');
  if (!profile) throw new Error('missing home_depot_mx profile');
  const cfg = loadBotIngestConfig();

  const report = await discoverSitemapChannel(profile, {
    budget: {
      maxRequests: 8,
      maxSitemaps: 3,
      maxPilotCandidates: 10,
      maxPages: 1,
      maxCandidates: 10,
    },
    sitemapIndexUrl: 'https://www.homedepot.com.mx/sitemap_10351.xml',
  });

  console.log(
    JSON.stringify(
      {
        persisted: false,
        inserted: false,
        published: false,
        adapterCreated: false,
        report,
        flags: {
          homeDepotConfigured: profile.implementationStatus,
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
