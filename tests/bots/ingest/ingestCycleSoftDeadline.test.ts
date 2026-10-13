import { describe, expect, it, vi } from 'vitest';

const collectCalls: Array<{ budgetMs?: number; signal?: AbortSignal }> = [];

vi.mock('@/lib/bots/ingest/botIngestPaused', () => ({
  getBotIngestPausedFromDb: vi.fn(async () => false),
}));

vi.mock('@/lib/bots/ingest/botIngestDailyState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/bots/ingest/botIngestDailyState')>()),
  getBotIngestLastBoostYmd: vi.fn(async () => null),
  setBotIngestLastBoostYmd: vi.fn(async () => undefined),
  countBotOffersCreatedSinceMulti: vi.fn(async () => 0),
}));

vi.mock('@/lib/bots/ingest/collectIngestItems', () => ({
  collectIngestItems: vi.fn(
    async (_config: unknown, _wave: number, opts?: { budgetMs?: number; signal?: AbortSignal }) => {
      collectCalls.push(opts ?? {});
      return {
        items: ['a', 'b', 'c'].map((k) => ({
          url: `https://articulo.mercadolibre.com.mx/MLM-${k}`,
          source: 'ml_api' as const,
        })),
        discoveryDiagnostics: {},
      };
    },
  ),
}));

vi.mock('@/lib/bots/ingest/fetchParsedOfferMetadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/bots/ingest/fetchParsedOfferMetadata')>()),
  fetchParsedOfferMetadataDetailed: vi.fn(async () => {
    throw new Error('no debe evaluarse tras el soft deadline');
  }),
}));

vi.mock('@/lib/hunter/supply/persistSnapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hunter/supply/persistSnapshots')>()),
  persistIngestSupplyRuns: vi.fn(async () => undefined),
}));

vi.mock('@/lib/autonomous', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/autonomous')>()),
  createDuplicateShadowContext: vi.fn(() => ({ supabase: null, cache: new Map() })),
  persistShadowCycleSnapshot: vi.fn(async () => ({ persisted: false })),
}));

import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import {
  INGEST_COLLECT_BUDGET_MS,
  INGEST_SOFT_DEADLINE_SKIP_REASON,
  runIngestCycleForProfile,
} from '@/lib/bots/ingest/runIngestCycle';
import { persistIngestSupplyRuns } from '@/lib/hunter/supply/persistSnapshots';

function enabledConfig() {
  return {
    ...loadBotIngestConfig('standard'),
    enabled: true,
    botUserIdsForQuota: ['00000000-0000-0000-0000-000000000001'],
    candidatePoolMax: 48,
  };
}

describe('runIngestCycleForProfile: presupuesto de tiempo', () => {
  it('pasa presupuesto y señal a la recolección', async () => {
    collectCalls.length = 0;
    await runIngestCycleForProfile('standard', undefined, {
      config: enabledConfig(),
      softDeadlineMs: 0,
    });
    expect(collectCalls).toHaveLength(1);
    expect(collectCalls[0]?.budgetMs).toBe(0);
    expect(collectCalls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(INGEST_COLLECT_BUDGET_MS).toBeLessThan(300_000);
  });

  it('al vencer el soft deadline no evalúa más, contabiliza cada candidato y aún persiste', async () => {
    const report = await runIngestCycleForProfile('standard', undefined, {
      config: enabledConfig(),
      softDeadlineMs: 0,
    });

    const deadlineSkips = report.results.filter(
      (r) => r.status === 'skipped' && r.reason === INGEST_SOFT_DEADLINE_SKIP_REASON,
    );
    expect(deadlineSkips).toHaveLength(3);
    expect(report.summary.errors).toBe(0);
    expect(report.summary.stageCounts?.evaluated).toBe(0);
    expect(persistIngestSupplyRuns).toHaveBeenCalled();
  });
});
