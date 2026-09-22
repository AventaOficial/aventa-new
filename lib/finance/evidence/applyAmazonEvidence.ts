/**
 * Persiste evidencia Amazon en la Economy Foundation (observación, no dinero):
 * conversions + commissions con id externo idempotente. NUNCA escribe ledger,
 * rewards ni payouts: eso lo hace el settlement bridge (gated) y los crons.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordCommission } from '@/lib/economy/recordCommission';
import { recordConversion } from '@/lib/economy/recordConversion';
import type { AmazonEvidenceRow, AmazonReportType } from './amazonReport';

export type ApplyAmazonEvidenceResult = {
  dryRun: boolean;
  conversionsCreated: number;
  conversionsReused: number;
  commissionsCreated: number;
  commissionsReused: number;
  revisionsNeeded: number;
  failed: number;
  attributedRows: number;
  unattributedRows: number;
  creatorsMatched: number;
  errors: string[];
};

export async function resolveCreatorsByAmazonTag(
  supabase: SupabaseClient,
  trackingIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const wanted = new Set(trackingIds.map((t) => t.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return map;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, amazon_tracking_tag')
      .not('amazon_tracking_tag', 'is', null);
    if (error) return map;
    for (const p of data ?? []) {
      const tag = String((p as { amazon_tracking_tag?: string | null }).amazon_tracking_tag ?? '')
        .trim()
        .toLowerCase();
      if (tag && wanted.has(tag)) map.set(tag, String((p as { id: string }).id));
    }
  } catch {
    /* columna ausente → nada atribuible */
  }
  return map;
}

export async function applyAmazonEvidence(
  supabase: SupabaseClient,
  type: AmazonReportType,
  rows: AmazonEvidenceRow[],
  options: { dryRun: boolean; actorId: string | null; reportLabel?: string | null },
): Promise<ApplyAmazonEvidenceResult> {
  const result: ApplyAmazonEvidenceResult = {
    dryRun: options.dryRun,
    conversionsCreated: 0,
    conversionsReused: 0,
    commissionsCreated: 0,
    commissionsReused: 0,
    revisionsNeeded: 0,
    failed: 0,
    attributedRows: 0,
    unattributedRows: 0,
    creatorsMatched: 0,
    errors: [],
  };

  const creators = await resolveCreatorsByAmazonTag(
    supabase,
    rows.map((r) => r.trackingId ?? '').filter(Boolean),
  );
  result.creatorsMatched = new Set(creators.values()).size;

  for (const row of rows) {
    const creatorId = row.trackingId ? creators.get(row.trackingId.toLowerCase()) ?? null : null;
    if (creatorId) result.attributedRows += 1;
    else result.unattributedRows += 1;

    if (row.kind === 'return') {
      result.revisionsNeeded += 1;
      continue;
    }
    if (options.dryRun) {
      result.conversionsCreated += 1;
      if (type === 'earnings' && (row.feesCents ?? 0) > 0) result.commissionsCreated += 1;
      continue;
    }

    const actor = options.actorId ? `staff:${options.actorId}` : 'staff:payout_ops';
    const conversion = await recordConversion(supabase, {
      source: 'csv_import',
      network: 'amazon',
      externalConversionId: row.externalId,
      occurredAt: row.occurredAt,
      status: type === 'earnings' ? 'confirmed' : 'pending',
      orderAmountCents: row.revenueCents ?? (row.priceCents != null ? row.priceCents * Math.max(1, row.quantity) : null),
      currency: 'MXN',
      rawReference: {
        report_type: type,
        report_label: options.reportLabel ?? null,
        line: row.line,
        asin: row.asin,
        name: row.name,
        tracking_id: row.trackingId,
        creator_id: creatorId,
        quantity: row.quantity,
        returns: row.returns,
        fingerprint: true,
        note: 'Amazon Associates report row; no stable order id — external id is a deterministic fingerprint.',
      },
      actor,
    });

    if (!conversion) {
      result.failed += 1;
      result.errors.push(`Línea ${row.line}: no se pudo registrar la conversión.`);
      continue;
    }
    if (conversion.reused) result.conversionsReused += 1;
    else result.conversionsCreated += 1;

    if (type === 'earnings' && (row.feesCents ?? 0) > 0) {
      const commission = await recordCommission(supabase, {
        conversionId: conversion.conversionId,
        source: 'csv_import',
        network: 'amazon',
        externalCommissionId: row.externalId,
        grossCommissionCents: row.feesCents ?? 0,
        currency: 'MXN',
        occurredAt: row.occurredAt,
        status: 'approved',
        rawReference: {
          report_type: type,
          line: row.line,
          asin: row.asin,
          tracking_id: row.trackingId,
          creator_id: creatorId,
        },
        actor,
      });
      if (!commission) {
        result.failed += 1;
        result.errors.push(`Línea ${row.line}: conversión ok pero comisión no registrada.`);
        continue;
      }
      if (commission.reused) result.commissionsReused += 1;
      else result.commissionsCreated += 1;
    }
  }

  return result;
}
