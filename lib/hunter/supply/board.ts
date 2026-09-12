import type { HunterSourceHealth } from '@/lib/hunter/types';
import { computeGlobalSupplyStatus, recommendedSupplyAction, sourceHealthRows } from './health';
import { contributionRows, peekLastSupplyRouterRun } from './metrics';
import type { SupplyBoardSnapshot, SupplyRouterReport } from './types';

export function summarizeSupplyBoard(input: {
  hunterRows?: HunterSourceHealth[];
  pendingCount?: number | null;
} = {}): SupplyBoardSnapshot {
  const lastRun = peekLastSupplyRouterRun();
  const rows = input.hunterRows ?? [];
  const machineHealthy = rows.filter((r) => r.status === 'healthy').length;
  const machineDegraded = rows.filter((r) => r.status === 'degraded').length;
  const machineDown = rows.filter((r) => r.status === 'down').length;

  const globalStatus = lastRun
    ? lastRun.globalStatus
    : computeGlobalSupplyStatus({
        machineHealthy,
        machineDegraded,
        machineDown,
        communityAvailable: true,
        verifiedDeals: 0,
        familiesContributing: machineHealthy + machineDegraded > 0 ? 1 : 0,
      });

  const stub: Pick<
    SupplyRouterReport,
    'communityVerified' | 'machineVerified' | 'verifiedDeals' | 'sourceFailures' | 'runs'
  > = lastRun ?? {
    communityVerified: 0,
    machineVerified: 0,
    verifiedDeals: 0,
    sourceFailures: 0,
    runs: [],
  };

  return {
    globalStatus,
    recommendedAction: lastRun
      ? lastRun.recommendedAction
      : recommendedSupplyAction(stub) ||
        'Community es source de primera clase. Machine down no apaga Aventa.',
    candidates: lastRun?.candidatesDiscovered ?? 0,
    verifiedDeals: lastRun?.verifiedDeals ?? 0,
    promotions: lastRun?.promotions ?? 0,
    pending: input.pendingCount ?? lastRun?.pending ?? 0,
    communityCandidates: lastRun?.uniqueCandidates.filter((c) => c.sourceId === 'community').length ?? 0,
    machineCandidates: lastRun?.uniqueCandidates.filter((c) => c.sourceId !== 'community').length ?? 0,
    communityVerified: lastRun?.communityVerified ?? 0,
    machineVerified: lastRun?.machineVerified ?? 0,
    contribution: contributionRows(lastRun),
    sourceHealth: sourceHealthRows(rows),
    lastRun,
  };
}
