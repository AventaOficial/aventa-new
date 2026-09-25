/**
 * Day 6 — multisource supply: isolation, funnel, Liverpool seeds, prioritization.
 */

import { describe, expect, it } from 'vitest';
import {
  classifySourceDiscoveryStatus,
  explainZeroYield,
  legacyStatusFromCanonical,
} from '@/lib/hunter/discovery/sourceDiscoveryStatus';
import {
  emptySourceFunnel,
  finalizeSourceFunnel,
  formatSourceFunnelLog,
  upsertSourceFunnel,
} from '@/lib/bots/ingest/sourceFunnelMetrics';
import { liverpoolSeedsSource } from '@/lib/hunter/sources/liverpoolSeeds';
import {
  computeAcquisitionPriorityBoost,
  prioritizeAcquisitionPool,
} from '@/lib/hunter/offerStandard/prioritizeAcquisitionPool';
import { externalIdFromUrl } from '@/lib/hunter/normalize';
import type { IngestItem } from '@/lib/bots/ingest/types';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { HunterCollectContext } from '@/lib/hunter/types';

function item(url: string, source: IngestItem['source'], title: string): IngestItem {
  return {
    url,
    source,
    precomputedMeta: {
      canonicalUrl: url,
      title,
      store: source,
      imageUrl: 'https://example.com/i.jpg',
      discountPrice: 100,
      originalPrice: 200,
      discountPercent: 50,
    },
  };
}

describe('Day 6 source discovery status', () => {
  it('never maps auth/external blocks to FAILED', () => {
    expect(
      classifySourceDiscoveryStatus({
        ok: false,
        errorCode: '403',
        errorMessageSafe: 'blocked by anti-bot',
      }),
    ).toBe('BLOCKED_EXTERNAL');
    expect(
      classifySourceDiscoveryStatus({
        ok: false,
        errorCode: 'ML_OAUTH_TOKEN_READ_FAILED',
        errorMessageSafe: 'oauth',
      }),
    ).toBe('BLOCKED_AUTH');
    expect(
      classifySourceDiscoveryStatus({ ok: true, itemsFound: 0 }),
    ).toBe('NO_RESULTS');
    expect(legacyStatusFromCanonical('BLOCKED_EXTERNAL')).toBe('blocked');
    expect(legacyStatusFromCanonical('NO_RESULTS')).toBe('empty');
  });

  it('explains zero yield without claiming success', () => {
    expect(explainZeroYield('BLOCKED_EXTERNAL', '403')).toMatch(/External/);
    expect(explainZeroYield('SUCCESS')).toMatch(/downstream/);
  });
});

describe('Day 6 per-source funnel', () => {
  it('tracks loss stages per source', () => {
    let map = upsertSourceFunnel({}, 'ml_worker', {
      status: 'SUCCESS',
      discovered: 36,
      identity_valid: 33,
      dqe_potential: 10,
      s61_pass: 0,
      blocked: 33,
    });
    map = upsertSourceFunnel(map, 'ml_api_legacy', {
      status: 'BLOCKED_AUTH',
      discovered: 0,
      error_code: 'ML_OAUTH_TOKEN_READ_FAILED',
    });
    const ml = map.ml_worker!;
    expect(ml.discovered).toBe(36);
    expect(ml.s61_pass).toBe(0);
    expect(ml.zero_yield_reason).toMatch(/downstream|gate|Source succeeded/i);
    const oauth = finalizeSourceFunnel(map.ml_api_legacy!);
    expect(oauth.zero_yield_reason).toMatch(/Auth/);
    expect(formatSourceFunnelLog(map)).toMatch(/ml_worker:SUCCESS/);
    expect(formatSourceFunnelLog(map)).toMatch(/ml_api_legacy:BLOCKED_AUTH/);
  });

  it('emptySourceFunnel defaults to NO_RESULTS', () => {
    expect(emptySourceFunnel('x').status).toBe('NO_RESULTS');
  });
});

describe('Day 6 Liverpool seed source', () => {
  it('is disabled without BOT_INGEST_LIVERPOOL_URLS', () => {
    const ctx = {
      config: { liverpoolUrls: [] } as BotIngestConfig,
      rotationWave: 0,
    } as HunterCollectContext;
    expect(liverpoolSeedsSource.isEnabled(ctx)).toBe(false);
    expect(liverpoolSeedsSource.isConfigured?.(ctx)).toBe(false);
  });

  it('collects only Liverpool PDPs with SKU identity', async () => {
    const ctx = {
      config: {
        liverpoolUrls: [
          'https://www.liverpool.com.mx/tienda/pdp/foo/1103982915',
          'https://www.example.com/not-liverpool',
          'https://www.liverpool.com.mx/tienda/categoria/x',
        ],
      } as BotIngestConfig,
      rotationWave: 0,
      now: new Date('2026-09-25T12:00:00Z'),
    } as HunterCollectContext;
    expect(liverpoolSeedsSource.isEnabled(ctx)).toBe(true);
    const result = await liverpoolSeedsSource.collect(ctx);
    expect(result.ok).toBe(true);
    expect(result.itemsFound).toBe(1);
    expect(result.candidates[0]?.externalId).toBe('1103982915');
    expect(result.candidates[0]?.fingerprint).toBe('liv:1103982915');
    expect(result.skipReasonCounts?.not_liverpool_pdp).toBe(2);
  });

  it('externalIdFromUrl resolves Liverpool SKU', () => {
    expect(
      externalIdFromUrl('https://www.liverpool.com.mx/tienda/pdp/x/1103982915'),
    ).toBe('1103982915');
  });
});

describe('Day 6 acquisition prioritization', () => {
  it('boosts healthy sources and near-ready PM days without bypassing sort authority', () => {
    const healthyBoost = computeAcquisitionPriorityBoost(
      item('https://www.liverpool.com.mx/tienda/pdp/a/1', 'liverpool_mx', 'iPhone 15'),
      { sourceHealth: { liverpool_mx: 'healthy' }, daysUntilReadyByUrl: { 'https://www.liverpool.com.mx/tienda/pdp/a/1': 1 } },
    );
    const downBoost = computeAcquisitionPriorityBoost(
      item('https://www.amazon.com.mx/dp/B0TEST', 'amazon_asin', 'iPhone 15'),
      { sourceHealth: { amazon_asin: 'down' } },
    );
    expect(healthyBoost).toBeGreaterThan(downBoost);

    const ranked = prioritizeAcquisitionPool(
      [
        item('https://www.amazon.com.mx/dp/B0AAA', 'amazon_asin', 'Generic cable'),
        item('https://www.liverpool.com.mx/tienda/pdp/x/1103982915', 'liverpool_mx', 'iPhone 15 Pro'),
      ],
      {
        sourceHealth: { liverpool_mx: 'healthy', amazon_asin: 'degraded' },
        daysUntilReadyByUrl: {
          'https://www.liverpool.com.mx/tienda/pdp/x/1103982915': 0,
        },
      },
    );
    expect(ranked[0]?.source).toBe('liverpool_mx');
  });
});

describe('Day 6 source isolation contract', () => {
  it('one BLOCKED_EXTERNAL source does not imply cycle failure', () => {
    const statuses = [
      classifySourceDiscoveryStatus({ ok: false, errorCode: '403' }),
      classifySourceDiscoveryStatus({ ok: true, itemsFound: 12 }),
      classifySourceDiscoveryStatus({ skippedDisabled: true }),
    ];
    expect(statuses).toEqual(['BLOCKED_EXTERNAL', 'SUCCESS', 'SKIPPED']);
    expect(statuses.every((s) => s !== 'FAILED' || s === 'FAILED')).toBe(true);
    const surviving = statuses.filter((s) => s === 'SUCCESS' || s === 'NO_RESULTS' || s === 'SKIPPED');
    expect(surviving.length).toBeGreaterThan(0);
  });
});
