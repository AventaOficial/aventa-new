import type { HunterSourceHealth } from '../types';
import { capabilityFor } from './capabilityMatrix';
import { DAY_TO_DAY_SOURCES, configurationStateFor, isDayToDaySourceId } from './registry';

/**
 * Universo Day-to-Day. No se mezcla con autonomousPct ni shadow autoApprovePct.
 * Se deriva del catálogo + hunter_source_health. No inventa inserts.
 */
export type DayToDaySupplySnapshot = {
  recommendation: string;
  sourcesHealthy: number;
  sourcesDegraded: number;
  sourcesDown: number;
  sourcesNotConfigured: number;
  sourcesDisabled: number;
  sourcesConfigured: number;
  candidates: number;
  inserted: number;
  duplicates: number;
  skipped: number;
  errors: number;
  sources: Array<{
    id: string;
    displayName: string;
    configuration: ReturnType<typeof configurationStateFor>;
    enabled: boolean;
    affiliateStatus: string;
    discoveryMethod: string;
    healthStatus: string | null;
    breakerState: string | null;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    itemsFound: number;
    itemsInserted: number;
    duplicates: number;
    skipped: number;
    errors: number;
    latencyMs: number | null;
    lastErrorCode: string | null;
  }>;
};

export function summarizeDayToDaySupply(
  healthRows: readonly Pick<
    HunterSourceHealth,
    | 'sourceId'
    | 'status'
    | 'enabled'
    | 'breakerState'
    | 'lastRunAt'
    | 'lastSuccessAt'
    | 'itemsFound'
    | 'itemsInserted'
    | 'duplicates'
    | 'skipped'
    | 'errors'
    | 'latencyMs'
    | 'lastErrorCode'
  >[] = []
): DayToDaySupplySnapshot {
  const byId = new Map(healthRows.filter((r) => isDayToDaySourceId(r.sourceId)).map((r) => [r.sourceId, r]));

  const sources = DAY_TO_DAY_SOURCES.map((src) => {
    const row = byId.get(src.id);
    const configuration = configurationStateFor(src);
    return {
      id: src.id,
      displayName: src.displayName,
      configuration,
      enabled: src.isEnabled({ config: {} as never, rotationWave: 0 }),
      affiliateStatus: src.affiliateStatus ?? 'unknown',
      discoveryMethod: src.discoveryMethod ?? 'not_available',
      healthStatus: row?.status ?? null,
      breakerState: row?.breakerState ?? null,
      lastRunAt: row?.lastRunAt ?? null,
      lastSuccessAt: row?.lastSuccessAt ?? null,
      itemsFound: row?.itemsFound ?? 0,
      itemsInserted: row?.itemsInserted ?? 0,
      duplicates: row?.duplicates ?? 0,
      skipped: row?.skipped ?? 0,
      errors: row?.errors ?? 0,
      latencyMs: row?.latencyMs ?? null,
      lastErrorCode: row?.lastErrorCode ?? null,
    };
  });

  const sourcesNotConfigured = sources.filter((s) => s.configuration === 'not_configured').length;
  const sourcesConfigured = sources.filter((s) => s.configuration === 'configured').length;
  const sourcesDisabled = sources.filter((s) => s.configuration === 'disabled').length;
  // healthy/degraded/down solo para fuentes que participan en discovery.
  const participating = sources.filter((s) => s.configuration === 'configured');
  const sourcesHealthy = participating.filter((s) => s.healthStatus === 'healthy').length;
  const sourcesDegraded = participating.filter((s) => s.healthStatus === 'degraded').length;
  const sourcesDown = participating.filter((s) => s.healthStatus === 'down').length;

  const candidates = sources.reduce((n, s) => n + s.itemsFound, 0);
  const inserted = sources.reduce((n, s) => n + s.itemsInserted, 0);
  const duplicates = sources.reduce((n, s) => n + s.duplicates, 0);
  const skipped = sources.reduce((n, s) => n + s.skipped, 0);
  const errors = sources.reduce((n, s) => n + s.errors, 0);

  let recommendation: string;
  if (sourcesConfigured === 0) {
    const degraded = DAY_TO_DAY_SOURCES.filter((s) => {
      const cap = capabilityFor(s.id);
      return cap?.complianceStatus === 'DEGRADED' || cap?.complianceStatus === 'BLOCKED';
    });
    if (degraded.length > 0) {
      recommendation = `Day-to-Day supply blocked: no configured sources. Top bottleneck: ${degraded[0]!.displayName} ${capabilityFor(degraded[0]!.id)?.complianceStatus ?? 'DEGRADED'} (anti-bot/SPA).`;
    } else {
      recommendation = 'Day-to-Day supply blocked: no configured sources.';
    }
  } else if (sourcesHealthy >= 1 && candidates > 0) {
    const top = sources.find((s) => s.itemsFound > 0);
    recommendation = top
      ? `${top.displayName} healthy: ${top.itemsFound} candidates / ${top.itemsInserted} new.`
      : `Day-to-Day supply healthy: ${sourcesHealthy} sources producing candidates.`;
  } else if (sourcesDown > 0 && sourcesHealthy === 0) {
    const down = sources.find((s) => s.healthStatus === 'down');
    recommendation = down?.lastErrorCode
      ? `${down.displayName} down: ${down.lastErrorCode}.`
      : 'Day-to-Day supply down: configured sources are not producing.';
  } else {
    recommendation = 'Day-to-Day supply idle: sources exist but have no recent yield.';
  }

  return {
    recommendation,
    sourcesHealthy,
    sourcesDegraded,
    sourcesDown,
    sourcesNotConfigured,
    sourcesDisabled,
    sourcesConfigured,
    candidates,
    inserted,
    duplicates,
    skipped,
    errors,
    sources,
  };
}
