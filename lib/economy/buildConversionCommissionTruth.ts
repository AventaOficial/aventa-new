/**
 * Conversion + Commission + Reconciliation Truth for CEO (read-only).
 * Distingue NOT CONNECTED vs connected_zero vs connected_with_data.
 * Revenue confirmed siempre not connected (no settlement).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import {
  isAnyAffiliateNetworkConnected,
  resolveNetworkConnectionStatus,
} from './adapter/registry';
import type { NetworkConnectionStatus } from './adapter/types';
import { buildMercadoLibreAffiliateHealth } from './providers/mercadolibre/health';
import { ECONOMIC_LEDGER_BOUNDARY } from './types';

export type ConversionCommissionTruth = {
  generatedAt: string;
  windowHours: number;
  /** Live adapter registered? Always false until a real network is wired. */
  ingestSourceConnected: boolean;
  ingestSourceNote: string;
  networkConnectionStatus: NetworkConnectionStatus;
  conversions: {
    reported: number | null;
    attributed: number | null;
    unattributed: number | null;
    unresolved: number | null;
    byStatus: Record<string, number>;
  };
  commissions: {
    reported: number | null;
    pending: number | null;
    approved: number | null;
    rejected: number | null;
    reversed: number | null;
    byStatus: Record<string, number>;
  };
  revisions: {
    recorded: number | null;
  };
  reconciliation: {
    runs: number | null;
    unmatched: number | null;
    amountMismatches: number | null;
    statusMismatches: number | null;
    orphans: number | null;
    lastRunAt: string | null;
  };
  providers: {
    mercadolibre: {
      enabled: boolean;
      configured: boolean;
      connected: false;
      lastSuccessfulSync: string | null;
      lastFailedSync: string | null;
      lastError: string | null;
      eventsReceived: number;
      economicIngestSupported: false;
      settlementEnabled: false;
      note: string;
    };
  };
  revenue: {
    connected: false;
    label: 'not connected';
    confirmedCents: null;
  };
  ledgerBoundary: typeof ECONOMIC_LEDGER_BOUNDARY;
  status: 'healthy' | 'degraded' | 'blocked' | 'unknown';
  note: string;
};

function emptyTruth(
  generatedAt: string,
  windowHours: number,
  note: string,
  status: ConversionCommissionTruth['status'],
): ConversionCommissionTruth {
  const connected = isAnyAffiliateNetworkConnected();
  const ml = buildMercadoLibreAffiliateHealth();
  return {
    generatedAt,
    windowHours,
    ingestSourceConnected: connected,
    ingestSourceNote: connected
      ? 'Adapter registered — awaiting activity'
      : 'No live affiliate conversion ingest wired (foundation only)',
    networkConnectionStatus: resolveNetworkConnectionStatus({
      hasAnyConnectedAdapter: connected,
      conversionCount: 0,
      commissionCount: 0,
    }),
    conversions: {
      reported: null,
      attributed: null,
      unattributed: null,
      unresolved: null,
      byStatus: {},
    },
    commissions: {
      reported: null,
      pending: null,
      approved: null,
      rejected: null,
      reversed: null,
      byStatus: {},
    },
    revisions: { recorded: null },
    reconciliation: {
      runs: null,
      unmatched: null,
      amountMismatches: null,
      statusMismatches: null,
      orphans: null,
      lastRunAt: null,
    },
    providers: {
      mercadolibre: {
        enabled: ml.enabled,
        configured: ml.configured,
        connected: false,
        lastSuccessfulSync: ml.lastSync,
        lastFailedSync: ml.metrics.lastFailedSyncAt,
        lastError: ml.lastError,
        eventsReceived: ml.metrics.eventsReceived,
        economicIngestSupported: false,
        settlementEnabled: false,
        note: ml.note,
      },
    },
    revenue: { connected: false, label: 'not connected', confirmedCents: null },
    ledgerBoundary: ECONOMIC_LEDGER_BOUNDARY,
    status,
    note,
  };
}

function countBy(
  rows: Array<Record<string, unknown>>,
  key: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[key] ?? 'unknown');
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export async function buildConversionCommissionTruth(
  supabase?: SupabaseClient | null,
  opts?: { windowHours?: number },
): Promise<ConversionCommissionTruth> {
  const windowHours = Math.max(1, Math.min(168 * 4, opts?.windowHours ?? 24 * 7));
  const generatedAt = new Date().toISOString();
  const sinceIso = new Date(Date.now() - windowHours * 3600_000).toISOString();
  const connected = isAnyAffiliateNetworkConnected();

  let client = supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      return emptyTruth(generatedAt, windowHours, 'Supabase no disponible', 'unknown');
    }
  }

  const [
    { data: conversions, error: convErr },
    { data: commissions, error: commErr },
    { data: revisions, error: revErr },
    { data: reconRuns, error: reconErr },
    { data: reconFindings, error: findErr },
  ] = await Promise.all([
    client
      .from('affiliate_conversions')
      .select('id, attribution_status, status')
      .gte('created_at', sinceIso)
      .limit(5000),
    client
      .from('affiliate_commissions')
      .select('id, status')
      .gte('created_at', sinceIso)
      .limit(5000),
    client
      .from('affiliate_commission_revisions')
      .select('id, status')
      .gte('created_at', sinceIso)
      .limit(5000),
    client
      .from('affiliate_reconciliation_runs')
      .select('id, detected_at')
      .gte('created_at', sinceIso)
      .order('detected_at', { ascending: false })
      .limit(100),
    client
      .from('affiliate_reconciliation_findings')
      .select('id, finding_type')
      .gte('detected_at', sinceIso)
      .neq('finding_type', 'MATCHED')
      .limit(5000),
  ]);

  if (convErr || commErr) {
    const msg = `${convErr?.message ?? ''} ${commErr?.message ?? ''}`.toLowerCase();
    if (msg.includes('does not exist')) {
      return emptyTruth(
        generatedAt,
        windowHours,
        'Conversion/commission tables not applied yet',
        'blocked',
      );
    }
    return emptyTruth(
      generatedAt,
      windowHours,
      `query failed: ${convErr?.message ?? commErr?.message}`,
      'degraded',
    );
  }

  const convRows = (conversions ?? []) as Array<Record<string, unknown>>;
  const commRows = (commissions ?? []) as Array<Record<string, unknown>>;
  const revRows = revErr ? [] : ((revisions ?? []) as Array<Record<string, unknown>>);
  const runRows = reconErr ? [] : ((reconRuns ?? []) as Array<Record<string, unknown>>);
  const findRows = findErr
    ? []
    : ((reconFindings ?? []) as Array<Record<string, unknown>>);

  const byAttr = countBy(convRows, 'attribution_status');
  const byConvStatus = countBy(convRows, 'status');
  const byCommStatus = countBy(commRows, 'status');
  const byFinding = countBy(findRows, 'finding_type');

  const networkConnectionStatus = resolveNetworkConnectionStatus({
    hasAnyConnectedAdapter: connected,
    conversionCount: convRows.length,
    commissionCount: commRows.length,
  });

  const ml = buildMercadoLibreAffiliateHealth();

  return {
    generatedAt,
    windowHours,
    ingestSourceConnected: connected,
    ingestSourceNote: connected
      ? 'Adapter registered'
      : 'No live affiliate conversion ingest wired (foundation only)',
    networkConnectionStatus,
    conversions: {
      reported: convRows.length,
      attributed: byAttr.attributed ?? 0,
      unattributed: byAttr.unattributed ?? 0,
      unresolved: byAttr.unresolved ?? 0,
      byStatus: byConvStatus,
    },
    commissions: {
      reported: byCommStatus.reported ?? 0,
      pending: byCommStatus.pending ?? 0,
      approved: byCommStatus.approved ?? 0,
      rejected: byCommStatus.rejected ?? 0,
      reversed: byCommStatus.reversed ?? 0,
      byStatus: byCommStatus,
    },
    revisions: {
      recorded: revRows.filter((r) => r.status === 'recorded').length,
    },
    reconciliation: {
      runs: runRows.length,
      unmatched:
        (byFinding.MISSING_INTERNAL ?? 0) + (byFinding.MISSING_EXTERNAL ?? 0),
      amountMismatches: byFinding.AMOUNT_MISMATCH ?? 0,
      statusMismatches: byFinding.STATUS_MISMATCH ?? 0,
      orphans: byFinding.ORPHAN ?? 0,
      lastRunAt: runRows[0]?.detected_at ? String(runRows[0].detected_at) : null,
    },
    providers: {
      mercadolibre: {
        enabled: ml.enabled,
        configured: ml.configured,
        connected: false,
        lastSuccessfulSync: ml.lastSync,
        lastFailedSync: ml.metrics.lastFailedSyncAt,
        lastError: ml.lastError,
        eventsReceived: ml.metrics.eventsReceived,
        economicIngestSupported: false,
        settlementEnabled: false,
        note: ml.note,
      },
    },
    revenue: { connected: false, label: 'not connected', confirmedCents: null },
    ledgerBoundary: ECONOMIC_LEDGER_BOUNDARY,
    status: 'healthy',
    note:
      networkConnectionStatus === 'not_connected'
        ? '0 reported — NETWORK NOT CONNECTED (≠ zero activity)'
        : networkConnectionStatus === 'connected_zero'
          ? 'NETWORK CONNECTED / ZERO ACTIVITY — settlement OFF'
          : 'NETWORK CONNECTED / DATA AVAILABLE — settlement OFF; not payable',
  };
}
