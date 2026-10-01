/**
 * Day 4 — Retailer capability matrix (pipeline stages).
 * Reuses Hunter coverage + Day-to-Day matrix; does not invent ACTIVE scrapers.
 */

import { HUNTER_SOURCE_COVERAGE } from '@/lib/hunter/sourceCoverage';
import { DAY_TO_DAY_CAPABILITY_MATRIX } from '@/lib/hunter/dayToDay/capabilityMatrix';

export type RetailerCapabilityStatus =
  | 'IMPLEMENTED'
  | 'PARTIAL'
  | 'BLOCKED_EXTERNAL'
  | 'NOT_IMPLEMENTED';

export type RetailerStageCapabilities = {
  discovery: RetailerCapabilityStatus;
  fetch: RetailerCapabilityStatus;
  extraction: RetailerCapabilityStatus;
  identity: RetailerCapabilityStatus;
  price: RetailerCapabilityStatus;
  availability: RetailerCapabilityStatus;
  image: RetailerCapabilityStatus;
  seller: RetailerCapabilityStatus;
  coupon: RetailerCapabilityStatus;
};

export type RetailerCapabilityRow = {
  retailer: string;
  ingestSourceId: string | null;
  stages: RetailerStageCapabilities;
  notes: string;
};

function stage(
  discovery: RetailerCapabilityStatus,
  fetch: RetailerCapabilityStatus,
  extraction: RetailerCapabilityStatus,
  identity: RetailerCapabilityStatus,
  price: RetailerCapabilityStatus,
  availability: RetailerCapabilityStatus,
  image: RetailerCapabilityStatus,
  seller: RetailerCapabilityStatus,
  coupon: RetailerCapabilityStatus,
): RetailerStageCapabilities {
  return {
    discovery,
    fetch,
    extraction,
    identity,
    price,
    availability,
    image,
    seller,
    coupon,
  };
}

/**
 * Operator-facing matrix. Status reflects code capability, not current HTTP health.
 * BLOCKED_EXTERNAL = implemented but frequently blocked from agent/Vercel IPs.
 */
export const RETAILER_CAPABILITY_MATRIX: RetailerCapabilityRow[] = [
  {
    retailer: 'Mercado Libre',
    ingestSourceId: 'ml_api',
    stages: stage(
      'IMPLEMENTED',
      'BLOCKED_EXTERNAL',
      'IMPLEMENTED',
      'IMPLEMENTED',
      'IMPLEMENTED',
      'PARTIAL',
      'IMPLEMENTED',
      'PARTIAL',
      'PARTIAL',
    ),
    notes:
      'Official API + worker Playwright. OAuth can degrade (ML_OAUTH_TOKEN_READ_FAILED). Agent/Cursor IPs often 403. Price Memory marketplace lock = mercadolibre.',
  },
  {
    retailer: 'Amazon México',
    ingestSourceId: 'amazon_asin',
    stages: stage(
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'IMPLEMENTED',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'NOT_IMPLEMENTED',
      'PARTIAL',
    ),
    notes: 'ASIN host-scoped identity. PA-API optional; HTML captcha common. Keepa for history when enabled.',
  },
  {
    retailer: 'Liverpool',
    ingestSourceId: 'liverpool_mx',
    stages: stage(
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'IMPLEMENTED',
      'PARTIAL',
      'NOT_IMPLEMENTED',
      'PARTIAL',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
    ),
    notes:
      'Day 6: seed-PDP Hunter source (BOT_INGEST_LIVERPOOL_URLS). Uses liv:SKU identity + existing PDP extract. No search scrape. Empty seeds = disabled.',
  },
  {
    retailer: 'Walmart México',
    ingestSourceId: 'walmart_mx',
    stages: stage(
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
    ),
    notes: 'Day-to-Day adapter exists; disabled/not_configured until flags + policy review.',
  },
  {
    retailer: 'Coppel',
    ingestSourceId: null,
    stages: stage(
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
    ),
    notes: 'No Hunter source. Do not add shallow scraper without identity + robots policy.',
  },
  {
    retailer: 'Elektra',
    ingestSourceId: null,
    stages: stage(
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
    ),
    notes: 'No Hunter source.',
  },
  {
    retailer: 'Chedraui',
    ingestSourceId: 'chedraui_mx',
    stages: stage(
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
    ),
    notes: 'Day-to-Day JSON-LD pilot; disabled by default.',
  },
  {
    retailer: 'Bodega Aurrera',
    ingestSourceId: 'bodega_aurrera_mx',
    stages: stage(
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
      'NOT_IMPLEMENTED',
      'NOT_IMPLEMENTED',
    ),
    notes: 'Day-to-Day adapter; disabled by default.',
  },
];

export function summarizeRetailerMatrix(): {
  implementedDiscovery: number;
  blockedExternal: number;
  notImplemented: number;
  rows: RetailerCapabilityRow[];
  hunterCoverageCount: number;
  dayToDayCount: number;
} {
  let implementedDiscovery = 0;
  let blockedExternal = 0;
  let notImplemented = 0;
  for (const row of RETAILER_CAPABILITY_MATRIX) {
    if (row.stages.discovery === 'IMPLEMENTED' || row.stages.discovery === 'PARTIAL') {
      implementedDiscovery += 1;
    }
    if (Object.values(row.stages).includes('BLOCKED_EXTERNAL')) blockedExternal += 1;
    if (row.stages.discovery === 'NOT_IMPLEMENTED') notImplemented += 1;
  }
  return {
    implementedDiscovery,
    blockedExternal,
    notImplemented,
    rows: RETAILER_CAPABILITY_MATRIX,
    hunterCoverageCount: HUNTER_SOURCE_COVERAGE.length,
    dayToDayCount: DAY_TO_DAY_CAPABILITY_MATRIX.length,
  };
}
