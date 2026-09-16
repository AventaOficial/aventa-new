/**
 * Conversion + Commission Truth for CEO (read-only).
 * Distingue: source not connected vs 0 reported rows.
 * Revenue confirmed siempre not connected (no settlement).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { ECONOMIC_LEDGER_BOUNDARY } from './types';

export type ConversionCommissionTruth = {
  generatedAt: string;
  windowHours: number;
  /** Ningún webhook/API de red cableado todavía. */
  ingestSourceConnected: false;
  ingestSourceNote: string;
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
  return {
    generatedAt,
    windowHours,
    ingestSourceConnected: false,
    ingestSourceNote: 'No live affiliate conversion ingest wired (foundation only)',
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

  let client = supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      return emptyTruth(generatedAt, windowHours, 'Supabase no disponible', 'unknown');
    }
  }

  const [{ data: conversions, error: convErr }, { data: commissions, error: commErr }] =
    await Promise.all([
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
  const byAttr = countBy(convRows, 'attribution_status');
  const byConvStatus = countBy(convRows, 'status');
  const byCommStatus = countBy(commRows, 'status');

  return {
    generatedAt,
    windowHours,
    ingestSourceConnected: false,
    ingestSourceNote: 'No live affiliate conversion ingest wired (foundation only)',
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
    revenue: { connected: false, label: 'not connected', confirmedCents: null },
    ledgerBoundary: ECONOMIC_LEDGER_BOUNDARY,
    status: 'healthy',
    note:
      convRows.length === 0 && commRows.length === 0
        ? '0 reported conversions/commissions — ingest source not connected'
        : 'Foundation counts only — settlement/payout disabled',
  };
}
