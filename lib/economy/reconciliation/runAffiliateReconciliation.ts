/**
 * Reconciliation foundation — compare NETWORK snapshot vs AVENTA economic truth.
 * NEVER mutates conversions/commissions/ledger/rewards/payouts.
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NormalizedCommission,
  NormalizedConversion,
  ReconciliationFinding,
  ReconciliationRunResult,
} from '../adapter/types';
import {
  ECONOMIC_LEDGER_BOUNDARY,
  isAffiliateNetwork,
  isEconomicIngestSource,
  type AffiliateNetwork,
  type EconomicIngestSource,
} from '../types';
import { computeEffectiveCommissionCents } from '../revisions/effectiveCommission';

export type ExternalReconciliationSnapshot = {
  source: EconomicIngestSource;
  network: AffiliateNetwork;
  windowStart: string | Date;
  windowEnd: string | Date;
  conversions: NormalizedConversion[];
  commissions: NormalizedCommission[];
  /** Optional fingerprint override for idempotency (defaults to hash of sorted external IDs). */
  snapshotFingerprint?: string;
  actor?: string;
};

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return (error.message ?? '').toLowerCase().includes('duplicate');
}

function toIso(d: string | Date): string {
  return typeof d === 'string' ? d : d.toISOString();
}

function buildIdempotencyKey(input: {
  source: string;
  network: string;
  windowStart: string;
  windowEnd: string;
  fingerprint: string;
}): string {
  return [
    input.source,
    input.network,
    input.windowStart,
    input.windowEnd,
    input.fingerprint,
  ].join('|');
}

function fingerprintSnapshot(
  conversions: NormalizedConversion[],
  commissions: NormalizedCommission[],
): string {
  const parts = [
    ...conversions.map((c) => `c:${c.externalConversionId}`),
    ...commissions.map((m) => `m:${m.externalCommissionId}:${m.grossCommissionCents}:${m.currency}:${m.status}`),
  ].sort();
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
}

function emptySummary(): ReconciliationRunResult['summary'] {
  return {
    matched: 0,
    missingInternal: 0,
    missingExternal: 0,
    amountMismatch: 0,
    statusMismatch: 0,
    currencyMismatch: 0,
    duplicate: 0,
    orphan: 0,
    totalFindings: 0,
  };
}

function bump(
  summary: ReconciliationRunResult['summary'],
  type: ReconciliationFinding['findingType'],
): void {
  summary.totalFindings += 1;
  switch (type) {
    case 'MATCHED':
      summary.matched += 1;
      break;
    case 'MISSING_INTERNAL':
      summary.missingInternal += 1;
      break;
    case 'MISSING_EXTERNAL':
      summary.missingExternal += 1;
      break;
    case 'AMOUNT_MISMATCH':
      summary.amountMismatch += 1;
      break;
    case 'STATUS_MISMATCH':
      summary.statusMismatch += 1;
      break;
    case 'CURRENCY_MISMATCH':
      summary.currencyMismatch += 1;
      break;
    case 'DUPLICATE':
      summary.duplicate += 1;
      break;
    case 'ORPHAN':
      summary.orphan += 1;
      break;
  }
}

/**
 * Pure compare helper (unit-testable without DB).
 */
export function compareCommissionSnapshot(input: {
  source: EconomicIngestSource;
  network: AffiliateNetwork;
  external: NormalizedCommission;
  internal: {
    id: string;
    externalCommissionId: string;
    grossCommissionCents: number;
    effectiveCents: number;
    currency: string;
    status: string;
    conversionId: string | null;
  } | null;
  seenExternalIds: Set<string>;
}): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const extId = input.external.externalCommissionId;

  if (input.seenExternalIds.has(extId)) {
    findings.push({
      findingType: 'DUPLICATE',
      entityKind: 'commission',
      externalId: extId,
      internalId: input.internal?.id ?? null,
      expected: { once: true },
      actual: { duplicateInSnapshot: true },
      difference: { externalId: extId },
      source: input.source,
      network: input.network,
    });
    return findings;
  }
  input.seenExternalIds.add(extId);

  if (!input.internal) {
    findings.push({
      findingType: 'MISSING_INTERNAL',
      entityKind: 'commission',
      externalId: extId,
      internalId: null,
      expected: {
        grossCommissionCents: input.external.grossCommissionCents,
        currency: input.external.currency,
        status: input.external.status,
      },
      actual: {},
      difference: { missing: 'internal' },
      source: input.source,
      network: input.network,
    });
    return findings;
  }

  if (!input.internal.conversionId) {
    findings.push({
      findingType: 'ORPHAN',
      entityKind: 'commission',
      externalId: extId,
      internalId: input.internal.id,
      expected: { conversionId: 'required' },
      actual: { conversionId: null },
      difference: { orphan: true },
      source: input.source,
      network: input.network,
    });
  }

  let matched = true;
  if (input.internal.effectiveCents !== input.external.grossCommissionCents) {
    matched = false;
    findings.push({
      findingType: 'AMOUNT_MISMATCH',
      entityKind: 'commission',
      externalId: extId,
      internalId: input.internal.id,
      expected: { amountCents: input.external.grossCommissionCents },
      actual: {
        originalCents: input.internal.grossCommissionCents,
        effectiveCents: input.internal.effectiveCents,
      },
      difference: {
        deltaCents: input.internal.effectiveCents - input.external.grossCommissionCents,
      },
      source: input.source,
      network: input.network,
    });
  }

  if (
    input.internal.currency.toUpperCase() !== input.external.currency.toUpperCase()
  ) {
    matched = false;
    findings.push({
      findingType: 'CURRENCY_MISMATCH',
      entityKind: 'commission',
      externalId: extId,
      internalId: input.internal.id,
      expected: { currency: input.external.currency },
      actual: { currency: input.internal.currency },
      difference: {},
      source: input.source,
      network: input.network,
    });
  }

  if (input.external.status && input.internal.status !== input.external.status) {
    matched = false;
    findings.push({
      findingType: 'STATUS_MISMATCH',
      entityKind: 'commission',
      externalId: extId,
      internalId: input.internal.id,
      expected: { status: input.external.status },
      actual: { status: input.internal.status },
      difference: {},
      source: input.source,
      network: input.network,
    });
  }

  if (matched) {
    findings.push({
      findingType: 'MATCHED',
      entityKind: 'commission',
      externalId: extId,
      internalId: input.internal.id,
      expected: { amountCents: input.external.grossCommissionCents },
      actual: { effectiveCents: input.internal.effectiveCents },
      difference: {},
      source: input.source,
      network: input.network,
    });
  }

  return findings;
}

export async function runAffiliateReconciliation(
  supabase: SupabaseClient,
  snapshot: ExternalReconciliationSnapshot,
): Promise<ReconciliationRunResult | null> {
  void ECONOMIC_LEDGER_BOUNDARY;

  if (
    !isEconomicIngestSource(snapshot.source) ||
    !isAffiliateNetwork(snapshot.network)
  ) {
    return null;
  }

  const windowStart = toIso(snapshot.windowStart);
  const windowEnd = toIso(snapshot.windowEnd);
  if (!(Date.parse(windowEnd) > Date.parse(windowStart))) return null;

  const fingerprint =
    snapshot.snapshotFingerprint?.trim() ||
    fingerprintSnapshot(snapshot.conversions, snapshot.commissions);
  const idempotencyKey = buildIdempotencyKey({
    source: snapshot.source,
    network: snapshot.network,
    windowStart,
    windowEnd,
    fingerprint,
  });

  // Idempotent replay: return canonical prior run.
  {
    const existing = await supabase
      .from('affiliate_reconciliation_runs')
      .select('id, source, network, window_start, window_end, status, summary')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing.data?.id) {
      const findingsRes = await supabase
        .from('affiliate_reconciliation_findings')
        .select(
          'finding_type, entity_kind, external_id, internal_id, expected, actual, difference, source, network',
        )
        .eq('run_id', existing.data.id)
        .limit(5000);
      const findings: ReconciliationFinding[] = (findingsRes.data ?? []).map((f) => ({
        findingType: f.finding_type as ReconciliationFinding['findingType'],
        entityKind: f.entity_kind as ReconciliationFinding['entityKind'],
        externalId: (f.external_id as string | null) ?? null,
        internalId: (f.internal_id as string | null) ?? null,
        expected: (f.expected as Record<string, unknown>) ?? {},
        actual: (f.actual as Record<string, unknown>) ?? {},
        difference: (f.difference as Record<string, unknown>) ?? {},
        source: f.source as EconomicIngestSource,
        network: f.network as AffiliateNetwork,
      }));
      const summary =
        (existing.data.summary as ReconciliationRunResult['summary']) ?? emptySummary();
      return {
        runId: String(existing.data.id),
        reused: true,
        source: snapshot.source,
        network: snapshot.network,
        windowStart,
        windowEnd,
        status: existing.data.status as ReconciliationRunResult['status'],
        summary,
        findings,
      };
    }
  }

  const findings: ReconciliationFinding[] = [];
  const summary = emptySummary();
  const seenCommissionExternal = new Set<string>();
  const seenConversionExternal = new Set<string>();

  // Load internal window rows (bounded).
  const [{ data: internalConversions }, { data: internalCommissions }] = await Promise.all([
    supabase
      .from('affiliate_conversions')
      .select('id, external_conversion_id, status, currency, attribution_status')
      .eq('source', snapshot.source)
      .eq('network', snapshot.network)
      .gte('occurred_at', windowStart)
      .lt('occurred_at', windowEnd)
      .limit(5000),
    supabase
      .from('affiliate_commissions')
      .select(
        'id, external_commission_id, gross_commission_cents, currency, status, conversion_id',
      )
      .eq('source', snapshot.source)
      .eq('network', snapshot.network)
      .gte('occurred_at', windowStart)
      .lt('occurred_at', windowEnd)
      .limit(5000),
  ]);

  const convByExternal = new Map(
    (internalConversions ?? []).map((r) => [String(r.external_conversion_id), r]),
  );
  const commByExternal = new Map(
    (internalCommissions ?? []).map((r) => [String(r.external_commission_id), r]),
  );

  for (const ext of snapshot.conversions) {
    if (seenConversionExternal.has(ext.externalConversionId)) {
      const f: ReconciliationFinding = {
        findingType: 'DUPLICATE',
        entityKind: 'conversion',
        externalId: ext.externalConversionId,
        internalId: null,
        expected: { once: true },
        actual: { duplicateInSnapshot: true },
        difference: {},
        source: snapshot.source,
        network: snapshot.network,
      };
      findings.push(f);
      bump(summary, 'DUPLICATE');
      continue;
    }
    seenConversionExternal.add(ext.externalConversionId);
    const internal = convByExternal.get(ext.externalConversionId);
    if (!internal) {
      const f: ReconciliationFinding = {
        findingType: 'MISSING_INTERNAL',
        entityKind: 'conversion',
        externalId: ext.externalConversionId,
        internalId: null,
        expected: { status: ext.status },
        actual: {},
        difference: { missing: 'internal' },
        source: snapshot.source,
        network: snapshot.network,
      };
      findings.push(f);
      bump(summary, 'MISSING_INTERNAL');
      continue;
    }
    if (ext.status && String(internal.status) !== ext.status) {
      const f: ReconciliationFinding = {
        findingType: 'STATUS_MISMATCH',
        entityKind: 'conversion',
        externalId: ext.externalConversionId,
        internalId: String(internal.id),
        expected: { status: ext.status },
        actual: { status: internal.status },
        difference: {},
        source: snapshot.source,
        network: snapshot.network,
      };
      findings.push(f);
      bump(summary, 'STATUS_MISMATCH');
    } else {
      const f: ReconciliationFinding = {
        findingType: 'MATCHED',
        entityKind: 'conversion',
        externalId: ext.externalConversionId,
        internalId: String(internal.id),
        expected: { status: ext.status },
        actual: { status: internal.status },
        difference: {},
        source: snapshot.source,
        network: snapshot.network,
      };
      findings.push(f);
      bump(summary, 'MATCHED');
    }
  }

  for (const [externalId, row] of convByExternal) {
    if (!seenConversionExternal.has(externalId)) {
      const f: ReconciliationFinding = {
        findingType: 'MISSING_EXTERNAL',
        entityKind: 'conversion',
        externalId,
        internalId: String(row.id),
        expected: {},
        actual: { status: row.status },
        difference: { missing: 'external' },
        source: snapshot.source,
        network: snapshot.network,
      };
      findings.push(f);
      bump(summary, 'MISSING_EXTERNAL');
    }
  }

  for (const ext of snapshot.commissions) {
    const internalRow = commByExternal.get(ext.externalCommissionId) ?? null;
    let effectiveCents = internalRow
      ? Number(internalRow.gross_commission_cents)
      : 0;
    if (internalRow) {
      const eff = await computeEffectiveCommissionCents(supabase, String(internalRow.id));
      if (eff != null) effectiveCents = eff;
    }
    const piece = compareCommissionSnapshot({
      source: snapshot.source,
      network: snapshot.network,
      external: ext,
      internal: internalRow
        ? {
            id: String(internalRow.id),
            externalCommissionId: String(internalRow.external_commission_id),
            grossCommissionCents: Number(internalRow.gross_commission_cents),
            effectiveCents,
            currency: String(internalRow.currency ?? 'MXN'),
            status: String(internalRow.status),
            conversionId: internalRow.conversion_id
              ? String(internalRow.conversion_id)
              : null,
          }
        : null,
      seenExternalIds: seenCommissionExternal,
    });
    for (const f of piece) {
      findings.push(f);
      bump(summary, f.findingType);
    }
  }

  for (const [externalId, row] of commByExternal) {
    if (!seenCommissionExternal.has(externalId)) {
      const f: ReconciliationFinding = {
        findingType: 'MISSING_EXTERNAL',
        entityKind: 'commission',
        externalId,
        internalId: String(row.id),
        expected: {},
        actual: {
          grossCommissionCents: row.gross_commission_cents,
          status: row.status,
        },
        difference: { missing: 'external' },
        source: snapshot.source,
        network: snapshot.network,
      };
      findings.push(f);
      bump(summary, 'MISSING_EXTERNAL');
    }
  }

  const runInsert = await supabase
    .from('affiliate_reconciliation_runs')
    .insert({
      source: snapshot.source,
      network: snapshot.network,
      window_start: windowStart,
      window_end: windowEnd,
      idempotency_key: idempotencyKey,
      status: 'completed',
      summary,
      actor: snapshot.actor ?? 'system',
    })
    .select('id')
    .maybeSingle();

  if (isUniqueViolation(runInsert.error)) {
    // Race: re-enter via idempotent path.
    return runAffiliateReconciliation(supabase, snapshot);
  }

  if (runInsert.error || !runInsert.data?.id) {
    console.error('[economy/reconciliation]', runInsert.error?.message);
    return null;
  }

  const runId = String(runInsert.data.id);
  if (findings.length > 0) {
    const rows = findings.map((f) => ({
      run_id: runId,
      finding_type: f.findingType,
      entity_kind: f.entityKind,
      external_id: f.externalId,
      internal_id: f.internalId,
      expected: f.expected,
      actual: f.actual,
      difference: f.difference,
      status: 'open',
      source: f.source,
      network: f.network,
    }));
    // Chunk inserts to avoid payload limits.
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from('affiliate_reconciliation_findings').insert(chunk);
      if (error) {
        console.error('[economy/reconciliation/findings]', error.message);
      }
    }
  }

  return {
    runId,
    reused: false,
    source: snapshot.source,
    network: snapshot.network,
    windowStart,
    windowEnd,
    status: 'completed',
    summary,
    findings,
  };
}
