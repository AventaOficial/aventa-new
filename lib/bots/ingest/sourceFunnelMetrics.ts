/**
 * Day 6 — Per-source discovery funnel stages.
 * Extends cycle observability; does not replace DQE/S6.1 or invent yields.
 */

import type { SourceDiscoveryStatus } from '@/lib/hunter/discovery/sourceDiscoveryStatus';
import { explainZeroYield } from '@/lib/hunter/discovery/sourceDiscoveryStatus';

export type SourceFunnelStageCounts = {
  source_id: string;
  status: SourceDiscoveryStatus;
  discovered: number;
  canonicalized: number;
  identity_valid: number;
  pm_ready: number;
  offer_standard_pass: number;
  dqe_verified: number;
  dqe_potential: number;
  s61_pass: number;
  blocked: number;
  failed: number;
  duplicate: number;
  pending: number;
  error_code: string | null;
  zero_yield_reason: string | null;
};

export function emptySourceFunnel(
  sourceId: string,
  status: SourceDiscoveryStatus = 'NO_RESULTS',
): SourceFunnelStageCounts {
  return {
    source_id: sourceId,
    status,
    discovered: 0,
    canonicalized: 0,
    identity_valid: 0,
    pm_ready: 0,
    offer_standard_pass: 0,
    dqe_verified: 0,
    dqe_potential: 0,
    s61_pass: 0,
    blocked: 0,
    failed: 0,
    duplicate: 0,
    pending: 0,
    error_code: null,
    zero_yield_reason: null,
  };
}

export function finalizeSourceFunnel(row: SourceFunnelStageCounts): SourceFunnelStageCounts {
  const pendingOrPass = row.pending + row.s61_pass;
  const zero =
    row.discovered === 0 ||
    (row.pending === 0 && row.s61_pass === 0 && row.dqe_verified === 0);
  return {
    ...row,
    zero_yield_reason:
      zero && pendingOrPass === 0
        ? explainZeroYield(row.status, row.error_code)
        : null,
  };
}

export function upsertSourceFunnel(
  map: Record<string, SourceFunnelStageCounts>,
  sourceId: string,
  patch: Partial<SourceFunnelStageCounts> & { status?: SourceDiscoveryStatus },
): Record<string, SourceFunnelStageCounts> {
  const prev = map[sourceId] ?? emptySourceFunnel(sourceId, patch.status ?? 'NO_RESULTS');
  const next: SourceFunnelStageCounts = {
    ...prev,
    ...patch,
    source_id: sourceId,
    discovered: patch.discovered ?? prev.discovered,
    canonicalized: patch.canonicalized ?? prev.canonicalized,
    identity_valid: patch.identity_valid ?? prev.identity_valid,
    pm_ready: patch.pm_ready ?? prev.pm_ready,
    offer_standard_pass: patch.offer_standard_pass ?? prev.offer_standard_pass,
    dqe_verified: patch.dqe_verified ?? prev.dqe_verified,
    dqe_potential: patch.dqe_potential ?? prev.dqe_potential,
    s61_pass: patch.s61_pass ?? prev.s61_pass,
    blocked: patch.blocked ?? prev.blocked,
    failed: patch.failed ?? prev.failed,
    duplicate: patch.duplicate ?? prev.duplicate,
    pending: patch.pending ?? prev.pending,
    error_code: patch.error_code !== undefined ? patch.error_code : prev.error_code,
    status: patch.status ?? prev.status,
  };
  return { ...map, [sourceId]: finalizeSourceFunnel(next) };
}

export function formatSourceFunnelLog(
  bySource: Record<string, SourceFunnelStageCounts> | undefined,
): string {
  if (!bySource || Object.keys(bySource).length === 0) return '';
  const parts = Object.values(bySource).map((s) => {
    const loss =
      s.discovered > 0 && s.s61_pass === 0 && s.pending === 0
        ? `loss@${s.blocked > 0 ? 'gate' : s.identity_valid === 0 ? 'identity' : 'dqe'}`
        : 'ok';
    return `${s.source_id}:${s.status}:d=${s.discovered}/id=${s.identity_valid}/dqe=${s.dqe_verified + s.dqe_potential}/s61=${s.s61_pass}/${loss}`;
  });
  return `[source-funnel] ${parts.join(' ')}`;
}
