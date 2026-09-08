import { discoverMercadoLibreIngestItems } from '@/lib/bots/ingest/discoverMercadoLibre';
import type { HunterCollectContext, HunterCollectResult, HunterSource } from '../types';
import { ingestItemToCandidate } from '../normalize';

export function extractHttpStatusFromSkipReasons(
  skipReasonCounts: Record<string, number> | undefined
): string | null {
  if (!skipReasonCounts) return null;
  for (const reason of Object.keys(skipReasonCounts)) {
    const m = reason.match(/search HTTP (\d{3})/i);
    if (m) return m[1];
  }
  return null;
}

export function mlApiLegacyFailClosed(httpFail: boolean, candidateCount: number): boolean {
  return httpFail && candidateCount <= 0;
}

export const mlApiLegacySource: HunterSource = {
  id: 'ml_api_legacy',
  ingestSourceId: 'ml_api',
  displayName: 'Mercado Libre API (legacy)',
  priority: 10,
  expectedIntervalMs: 15 * 60 * 1000,
  isEnabled: (ctx) => ctx.config.discoverMlEnabled,
  isAvailable: (ctx) => ctx.config.discoverMlEnabled,
  async collect(ctx: HunterCollectContext): Promise<HunterCollectResult> {
    const seen = new Set<string>();
    const discovery = await discoverMercadoLibreIngestItems(
      ctx.config,
      seen,
      ctx.rotationWave
    );
    const detectedAt = (ctx.now ?? new Date()).toISOString();
    const candidates = discovery.items.map((item) =>
      ingestItemToCandidate(item, 'ml_api_legacy', detectedAt)
    );
    const httpStatus = extractHttpStatusFromSkipReasons(discovery.skipReasonCounts);
    const httpFail =
      httpStatus === '401' ||
      httpStatus === '403' ||
      httpStatus === '429' ||
      (httpStatus != null && /^5\d\d$/.test(httpStatus));

    if (mlApiLegacyFailClosed(httpFail, candidates.length)) {
      return {
        ok: false,
        candidates: [],
        itemsFound: 0,
        errorCode: httpStatus,
        errorMessageSafe: `ml discovery search HTTP ${httpStatus}`,
        skipReasonCounts: discovery.skipReasonCounts,
        collectedCount: discovery.collectedCount,
      };
    }

    return {
      ok: true,
      candidates,
      itemsFound: candidates.length,
      skipReasonCounts: discovery.skipReasonCounts,
      collectedCount: discovery.collectedCount,
    };
  },
};
