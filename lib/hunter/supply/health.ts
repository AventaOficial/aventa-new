import type { HunterSourceHealth } from '@/lib/hunter/types';
import { SUPPLY_SOURCES } from './registry';
import type {
  GlobalSupplyStatus,
  SupplyRuntimeStatus,
  SupplyRouterReport,
  SupplySourceId,
} from './types';

export function mapHunterStatus(status: string | null | undefined): SupplyRuntimeStatus {
  if (status === 'healthy') return 'HEALTHY';
  if (status === 'degraded') return 'DEGRADED';
  if (status === 'down') return 'DOWN';
  if (status === 'disabled') return 'DISABLED';
  return 'NOT_CONFIGURED';
}

export function runtimeStatusForSource(
  sourceId: SupplySourceId,
  opts: {
    enabled: boolean;
    configured: boolean;
    hunter?: HunterSourceHealth | null;
    blocked?: boolean;
  },
): SupplyRuntimeStatus {
  if (opts.blocked) return 'BLOCKED';
  if (!opts.enabled) return 'DISABLED';
  if (!opts.configured) return 'NOT_CONFIGURED';
  if (sourceId === 'community') return 'HEALTHY';
  if (opts.hunter) return mapHunterStatus(opts.hunter.status);
  return 'NOT_CONFIGURED';
}

/**
 * Salud GLOBAL de supply — no es source health ni autonomousPct.
 * Community cuenta como familia disponible aunque machine esté down.
 */
export function computeGlobalSupplyStatus(input: {
  machineHealthy: number;
  machineDegraded: number;
  machineDown: number;
  communityAvailable: boolean;
  verifiedDeals: number;
  familiesContributing: number;
}): GlobalSupplyStatus {
  const anyMachine = input.machineHealthy + input.machineDegraded > 0;
  if (!anyMachine && !input.communityAvailable && input.verifiedDeals <= 0) return 'DOWN';
  if (input.familiesContributing <= 1 && (input.machineDown > 0 || !anyMachine)) return 'AT_RISK';
  if (input.machineDegraded > 0 || input.machineDown > 0 || input.verifiedDeals <= 0) {
    return 'DEGRADED';
  }
  if (anyMachine && input.communityAvailable && input.verifiedDeals > 0) return 'HEALTHY';
  return 'DEGRADED';
}

export function recommendedSupplyAction(report: Pick<
  SupplyRouterReport,
  'communityVerified' | 'machineVerified' | 'verifiedDeals' | 'sourceFailures' | 'runs'
>): string {
  const total = report.communityVerified + report.machineVerified;
  if (total > 0) {
    const communityPct = Math.round((report.communityVerified / total) * 100);
    if (communityPct >= 50) {
      return `Community aporta ${communityPct}% de los verified deals.`;
    }
  }
  const ml = report.runs.find((r) => r.sourceId === 'ml_worker' || r.sourceId === 'ml_api_legacy');
  if (ml && (!ml.ok || ml.skippedReason)) {
    return 'ML Worker/API degradado o ausente; community puede compensar.';
  }
  if (report.sourceFailures > 0) {
    return 'Hay fallos aislados de source. El resto del pipeline sigue.';
  }
  if (report.verifiedDeals === 0) {
    return 'Hay candidatos pero 0 verified deals. No activar retailers ni bajar thresholds.';
  }
  return 'Supply multi-fuente operativo. Ninguna source publica ni salta verifier.';
}

export function sourceHealthRows(hunterRows: HunterSourceHealth[]) {
  const byHunter = new Map(hunterRows.map((r) => [r.sourceId, r]));
  return SUPPLY_SOURCES.map((src) => {
    const hunter = src.hunterSourceId ? byHunter.get(src.hunterSourceId) ?? null : null;
    const enabled = src.id === 'community' ? true : Boolean(hunter?.enabled ?? false);
    const configured =
      src.id === 'community' ? true : src.id === 'affiliate_feed' || src.id === 'partner' ? false : enabled;
    return {
      sourceId: src.id,
      displayName: src.displayName,
      family: src.family,
      status: runtimeStatusForSource(src.id, {
        enabled,
        configured,
        hunter,
      }),
      hunterStatus: hunter?.status ?? null,
    };
  });
}
