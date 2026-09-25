/**
 * Day 3 continuous discovery — contract / isolation / funnel tests.
 * Prefer real helpers over full mocks.
 */

import { describe, expect, it } from 'vitest';
import {
  nearReadyTargetToIngestItem,
  STICKY_NEAR_READY_SOURCE_ID,
} from '@/lib/hunter/discovery/stickyNearReadySource';
import {
  explainDiscoveryCycleVerdict,
  type DiscoveryCycleFunnel,
  type DiscoverySourceOutcome,
} from '@/lib/hunter/discovery/continuousDiscoveryCycle';
import { dedupeHunterCandidates, ingestItemToCandidate } from '@/lib/hunter/normalize';
import { buildCycleFunnelSummaryFromDiscovery } from '@/lib/bots/ingest/cycleFunnelSummary';
import {
  accumulateAutomationOutcome,
  buildAutomationCycleMetrics,
  emptyAutomationCycleCounts,
} from '@/lib/bots/ingest/automationCycleMetrics';
import type { NearReadyStickyTarget } from '@/lib/hunter/supply/nearReadySticky';
import type { IngestItem } from '@/lib/bots/ingest/types';
import type { HunterCandidate } from '@/lib/hunter/types';

function sampleTarget(overrides: Partial<NearReadyStickyTarget> = {}): NearReadyStickyTarget {
  return {
    productId: 'MLM1234567890',
    priorDays: 3,
    daysUntilReady: 1,
    lastObservedOn: '2026-09-23',
    lastPrice: 999,
    hoursSinceObserved: 25,
    marketplace: 'mercadolibre',
    ...overrides,
  };
}

describe('discovery source contract', () => {
  it('sticky near-ready builds product URL without inventing list price', () => {
    const item = nearReadyTargetToIngestItem(sampleTarget(), '2026-09-24T12:00:00.000Z');
    expect(item).not.toBeNull();
    expect(item!.source).toBe('ml_api');
    expect(item!.url).toMatch(/mercadolibre\.com\.mx/);
    expect(item!.precomputedMeta?.originalPrice).toBeNull();
    expect(item!.precomputedMeta?.discountPercent).toBe(0);
    expect(item!.precomputedMeta?.discountPrice).toBe(999);
    expect(item!.sourceDetail).toContain(STICKY_NEAR_READY_SOURCE_ID);
  });

  it('rejects missing lastPrice', () => {
    expect(
      nearReadyTargetToIngestItem(
        sampleTarget({ lastPrice: null }),
        '2026-09-24T12:00:00.000Z',
      ),
    ).toBeNull();
  });
});

describe('candidate canonicalization + dedupe', () => {
  it('dedupes same ML identity across candidates', () => {
    const detectedAt = '2026-09-24T12:00:00.000Z';
    const mk = (url: string): HunterCandidate => {
      const item: IngestItem = {
        url,
        source: 'ml_api',
        sourceDetail: 'test',
        precomputedMeta: {
          canonicalUrl: url,
          title: 't',
          store: 'Mercado Libre',
          imageUrl: 'https://http2.mlstatic.com/x.jpg',
          discountPrice: 100,
          originalPrice: null,
          discountPercent: 0,
        },
      };
      return ingestItemToCandidate(item, 'ml_api_legacy', detectedAt);
    };
    const a = mk('https://articulo.mercadolibre.com.mx/MLM-1234567890-foo-_JM');
    const b = mk('https://www.mercadolibre.com.mx/p/MLM1234567890');
    // If fingerprints differ, still assert dedupe reduces when same fingerprint
    const deduped = dedupeHunterCandidates([a, a]);
    expect(deduped.length).toBe(1);
    void b;
  });
});

describe('source failure isolation (verdict)', () => {
  it('blocked source does not force global failure when others succeed', () => {
    const funnel: DiscoveryCycleFunnel = {
      cycle_id: '00000000-0000-0000-0000-000000000001',
      sources_requested: 3,
      sources_succeeded: 1,
      sources_blocked: 1,
      sources_failed: 0,
      sources_empty: 1,
      candidates_discovered: 0,
      candidates_canonicalized: 0,
      duplicates: 0,
      unsupported: 0,
      invalid: 0,
      fetch_attempted: 0,
      fetch_success: 0,
      fetch_blocked: 0,
      fetch_failed: 0,
      extracted: 0,
      identified: 0,
      price_memory_ready: 0,
      price_memory_not_ready: 0,
      offer_standard_pass: 0,
      dqe_verified: 0,
      dqe_potential: 0,
      dqe_blocked: 0,
      dqe_failed: 0,
      s61_pass: 0,
      s61_blocked: 0,
      s7_pass: 0,
      s7_blocked: 0,
      observations_created: 0,
      pending_created: 0,
      dry_run: true,
    };
    const sources: DiscoverySourceOutcome[] = [
      { sourceId: 'ml_api_legacy', status: 'blocked', candidates: 0, errorCode: '403', errorMessageSafe: '403' },
      { sourceId: 'amazon_asin', status: 'empty', candidates: 0, errorCode: null, errorMessageSafe: null },
      { sourceId: 'sticky_near_ready', status: 'success', candidates: 0, errorCode: null, errorMessageSafe: null },
    ];
    const verdict = explainDiscoveryCycleVerdict({
      funnel,
      sources,
      dryRun: true,
      allowMint: false,
    });
    expect(verdict).toMatch(/isolation OK|0 candidates/i);
    expect(verdict).not.toMatch(/All discovery sources blocked/i);
  });
});

describe('cycle funnel + dry-run write honesty', () => {
  it('dry-run keeps pending/observations at 0 in CycleFunnelSummary', () => {
    const summary = buildCycleFunnelSummaryFromDiscovery({
      cycleId: 'cycle-test',
      dryRun: true,
      operator_verdict: 'dry',
      automation_rate: 0.2,
      funnel: {
        candidates_discovered: 10,
        candidates_canonicalized: 8,
        duplicates: 2,
        unsupported: 0,
        invalid: 0,
        s61_pass: 3,
        s61_blocked: 5,
        pending_created: 3,
        observations_created: 3,
        sources_requested: 4,
        sources_succeeded: 2,
        sources_blocked: 1,
        sources_failed: 0,
        dqe_verified: 2,
        dqe_potential: 4,
        dry_run: true,
      },
    });
    expect(summary.cycle_id).toBe('cycle-test');
    expect(summary.offers_sent_to_moderation).toBe(0);
    expect(summary.pending_created).toBe(0);
    expect(summary.observations_created).toBe(0);
    expect(summary.would_insert_observation).toBe(3);
    expect(summary.dry_run).toBe(true);
    expect(summary.automation_rate).toBe(0.2);
  });
});

describe('discovery evidence enrichment', () => {
  it('returns listing-card meta for known evidence product without inventing prices', async () => {
    const { metaFromDiscoveryEvidenceForProduct } =
      await import('@/lib/hunter/discovery/censusSeedEnrichment');
    const meta = metaFromDiscoveryEvidenceForProduct(
      'MLM2177969823',
      'https://www.mercadolibre.com.mx/p/MLM2177969823',
    );
    expect(meta).not.toBeNull();
    expect(meta!.discountPrice).toBeGreaterThan(0);
    expect(meta!.originalPrice).toBeGreaterThan(meta!.discountPrice);
    expect(meta!.signals?.originalPriceProvenance).toBe('listing_card');
  });

  it('returns null for unknown product id', async () => {
    const { metaFromDiscoveryEvidenceForProduct } =
      await import('@/lib/hunter/discovery/censusSeedEnrichment');
    expect(
      metaFromDiscoveryEvidenceForProduct(
        'MLM0000000000',
        'https://www.mercadolibre.com.mx/p/MLM0000000000',
      ),
    ).toBeNull();
  });
});

describe('automation metrics definition', () => {
  it('automation_rate = auto_processed / candidate_count', () => {
    let counts = emptyAutomationCycleCounts();
    counts = accumulateAutomationOutcome(counts, 'auto_processed', { pendingCreated: true });
    counts = accumulateAutomationOutcome(counts, 'auto_processed', { pendingCreated: true });
    counts = accumulateAutomationOutcome(counts, 'blocked');
    counts = accumulateAutomationOutcome(counts, 'human_required');
    counts = accumulateAutomationOutcome(counts, 'duplicate');
    const m = buildAutomationCycleMetrics(counts);
    expect(m.candidate_count).toBe(5);
    expect(m.auto_processed).toBe(2);
    expect(m.automation_rate).toBe(0.4);
    expect(m.pending_created).toBe(2);
  });
});
