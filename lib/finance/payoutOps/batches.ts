/**
 * Lotes de pago persistidos (V3) — preparar → aprobar (dos personas) → liberar.
 * docs/SYSTEMS/SYSTEM_payout_operations.md §5, §9
 *
 * "Liberar" = reservar payout_intents por recompensa vía processAvailableRewardPayoutIntent,
 * que ya aplica los guards (REWARDS_PROGRAM_ACTIVE, MONEY_PATH_FROZEN, elegibilidad).
 * En producción congelada el resultado es deferred/rejected y el lote sigue en approved.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { processAvailableRewardPayoutIntent } from '@/lib/rewards/availablePayoutIntent/processAvailableRewardPayoutIntent';
import { writeRewardAuditLog } from '@/lib/rewards/audit';
import type { BatchPreview, PayoutOpsRuntime } from './types';

export type PayoutBatchStatus = 'draft' | 'approved' | 'released' | 'cancelled';

export type PayoutBatchRow = {
  id: string;
  period_key: string;
  status: PayoutBatchStatus;
  currency: string;
  payable_cents: number;
  payable_count: number;
  review_count: number;
  blocked_count: number;
  carry_count: number;
  min_payout_cents: number;
  creator_share_bps: number;
  prepared_by: string | null;
  prepared_at: string;
  approved_by: string | null;
  approved_at: string | null;
  released_by: string | null;
  released_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  notes: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type PayoutBatchLineRow = {
  id: string;
  batch_id: string;
  creator_id: string;
  amount_cents: number;
  reward_count: number;
  reward_ids: string[];
  decision: 'pass' | 'review' | 'fail' | 'carry';
  gate_codes: string[];
  gate_reasons: string[];
  display_name: string | null;
  release_status: 'none' | 'reserved' | 'reused' | 'deferred' | 'rejected';
  release_reason: string | null;
};

export type PayoutBatchWithLines = PayoutBatchRow & { lines: PayoutBatchLineRow[] };

export type BatchActor = { id: string; role: string };

// ---------- puro ----------

export function buildBatchInsert(
  preview: BatchPreview,
  config: { minPayoutCents: number; creatorShareBps: number },
  actor: BatchActor,
  notes: string | null,
) {
  const batch = {
    period_key: preview.periodLabel,
    status: 'draft' as PayoutBatchStatus,
    currency: 'MXN',
    payable_cents: preview.totals.payableCents,
    payable_count: preview.totals.payableCount,
    review_count: preview.totals.reviewCount,
    blocked_count: preview.totals.blockedCount,
    carry_count: preview.totals.carryCount,
    min_payout_cents: config.minPayoutCents,
    creator_share_bps: config.creatorShareBps,
    prepared_by: actor.id,
    notes,
    meta: {
      prepared_role: actor.role,
      release_blockers_at_prepare: preview.releaseBlockers,
      source: 'payout_ops_v3',
    },
  };
  const lines = preview.lines.map((l) => ({
    creator_id: l.creatorId,
    amount_cents: l.amountCents,
    reward_count: l.rewardCount,
    reward_ids: l.rewardIds,
    decision: l.gate.decision,
    gate_codes: l.gate.codes,
    gate_reasons: l.gate.reasons,
    display_name: l.displayName,
  }));
  return { batch, lines };
}

export type ApprovalCheck = { ok: true; selfApproved: boolean } | { ok: false; reason: string };

/** Regla de dos personas: approved_by ≠ prepared_by; owner puede forzar (queda en meta). */
export function canApproveBatch(
  batch: Pick<PayoutBatchRow, 'status' | 'prepared_by'>,
  actor: BatchActor,
  force: boolean,
): ApprovalCheck {
  if (batch.status !== 'draft') return { ok: false, reason: `batch_not_draft:${batch.status}` };
  if (batch.prepared_by && batch.prepared_by === actor.id) {
    if (actor.role === 'owner' && force) return { ok: true, selfApproved: true };
    return { ok: false, reason: 'two_person_rule' };
  }
  return { ok: true, selfApproved: false };
}

export function releaseBlockersFor(
  batch: Pick<PayoutBatchRow, 'status' | 'payable_count'>,
  runtime: PayoutOpsRuntime,
): string[] {
  const blockers: string[] = [];
  if (batch.status !== 'approved') blockers.push(`batch_not_approved:${batch.status}`);
  if (batch.payable_count === 0) blockers.push('no_payable_lines');
  if (runtime.moneyPathFrozen) blockers.push('money_path_frozen');
  if (!runtime.rewardsProgramActive) blockers.push('rewards_program_off');
  if (
    runtime.payoutProvider.mode === 'none' ||
    runtime.payoutProvider.mode === 'invalid' ||
    runtime.payoutProvider.mode === 'forbidden_production'
  ) {
    blockers.push('payout_provider_not_ready');
  }
  return blockers;
}

// ---------- server ----------

function hasMissingTable(error: { message?: string } | null): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return m.includes('payout_batch') || m.includes('does not exist') || m.includes('schema cache');
}

function rowToBatch(r: Record<string, unknown>): PayoutBatchRow {
  return {
    id: String(r.id),
    period_key: String(r.period_key ?? ''),
    status: (String(r.status ?? 'draft') as PayoutBatchStatus) ?? 'draft',
    currency: String(r.currency ?? 'MXN'),
    payable_cents: Number(r.payable_cents) || 0,
    payable_count: Number(r.payable_count) || 0,
    review_count: Number(r.review_count) || 0,
    blocked_count: Number(r.blocked_count) || 0,
    carry_count: Number(r.carry_count) || 0,
    min_payout_cents: Number(r.min_payout_cents) || 0,
    creator_share_bps: Number(r.creator_share_bps) || 0,
    prepared_by: (r.prepared_by as string | null) ?? null,
    prepared_at: String(r.prepared_at ?? r.created_at ?? ''),
    approved_by: (r.approved_by as string | null) ?? null,
    approved_at: (r.approved_at as string | null) ?? null,
    released_by: (r.released_by as string | null) ?? null,
    released_at: (r.released_at as string | null) ?? null,
    cancelled_by: (r.cancelled_by as string | null) ?? null,
    cancelled_at: (r.cancelled_at as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    meta: (r.meta && typeof r.meta === 'object' ? (r.meta as Record<string, unknown>) : {}),
    created_at: String(r.created_at ?? ''),
  };
}

function rowToLine(r: Record<string, unknown>): PayoutBatchLineRow {
  return {
    id: String(r.id),
    batch_id: String(r.batch_id),
    creator_id: String(r.creator_id),
    amount_cents: Number(r.amount_cents) || 0,
    reward_count: Number(r.reward_count) || 0,
    reward_ids: Array.isArray(r.reward_ids) ? r.reward_ids.map(String) : [],
    decision: (r.decision as PayoutBatchLineRow['decision']) ?? 'carry',
    gate_codes: Array.isArray(r.gate_codes) ? r.gate_codes.map(String) : [],
    gate_reasons: Array.isArray(r.gate_reasons) ? r.gate_reasons.map(String) : [],
    display_name: (r.display_name as string | null) ?? null,
    release_status: (r.release_status as PayoutBatchLineRow['release_status']) ?? 'none',
    release_reason: (r.release_reason as string | null) ?? null,
  };
}

export async function listPayoutBatches(
  supabase: SupabaseClient,
  limit = 12,
): Promise<{ batches: PayoutBatchWithLines[]; tableAvailable: boolean }> {
  const { data, error } = await supabase
    .from('payout_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { batches: [], tableAvailable: !hasMissingTable(error) };
  const batches = (data ?? []).map((r) => rowToBatch(r as Record<string, unknown>));
  if (batches.length === 0) return { batches: [], tableAvailable: true };

  const { data: lines } = await supabase
    .from('payout_batch_lines')
    .select('*')
    .in('batch_id', batches.map((b) => b.id))
    .order('amount_cents', { ascending: false });
  const byBatch = new Map<string, PayoutBatchLineRow[]>();
  for (const l of lines ?? []) {
    const line = rowToLine(l as Record<string, unknown>);
    const arr = byBatch.get(line.batch_id) ?? [];
    arr.push(line);
    byBatch.set(line.batch_id, arr);
  }
  return {
    batches: batches.map((b) => ({ ...b, lines: byBatch.get(b.id) ?? [] })),
    tableAvailable: true,
  };
}

export async function getPayoutBatch(
  supabase: SupabaseClient,
  id: string,
): Promise<PayoutBatchWithLines | null> {
  const { data, error } = await supabase.from('payout_batches').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const batch = rowToBatch(data as Record<string, unknown>);
  const { data: lines } = await supabase.from('payout_batch_lines').select('*').eq('batch_id', id);
  return { ...batch, lines: (lines ?? []).map((l) => rowToLine(l as Record<string, unknown>)) };
}

export type BatchOpResult =
  | { ok: true; batch: PayoutBatchWithLines }
  | { ok: false; error: string; status: 400 | 404 | 409 | 500 | 503 };

export async function createPayoutBatch(
  supabase: SupabaseClient,
  preview: BatchPreview,
  config: { minPayoutCents: number; creatorShareBps: number },
  actor: BatchActor,
  notes: string | null,
): Promise<BatchOpResult> {
  if (preview.lines.length === 0) {
    return { ok: false, error: 'Sin saldos disponibles para preparar un lote.', status: 400 };
  }
  const { batch, lines } = buildBatchInsert(preview, config, actor, notes);
  const { data, error } = await supabase.from('payout_batches').insert(batch).select('*').single();
  if (error || !data) {
    if (error?.code === '23505') {
      return { ok: false, error: `Ya existe un lote activo para ${preview.periodLabel}. Cancélalo antes de preparar otro.`, status: 409 };
    }
    if (hasMissingTable(error)) {
      return { ok: false, error: 'Falta migración: docs/supabase-migrations/20260922_payout_batches_v3.sql', status: 503 };
    }
    return { ok: false, error: 'No se pudo crear el lote', status: 500 };
  }
  const created = rowToBatch(data as Record<string, unknown>);
  const { error: lineErr } = await supabase
    .from('payout_batch_lines')
    .insert(lines.map((l) => ({ ...l, batch_id: created.id })));
  if (lineErr) {
    await supabase.from('payout_batches').delete().eq('id', created.id);
    return { ok: false, error: 'No se pudieron guardar las líneas del lote', status: 500 };
  }
  await writeRewardAuditLog(supabase, {
    eventType: 'payout_batch_prepared',
    actorId: actor.id,
    entityType: 'payout_batch',
    entityId: created.id,
    previousState: null,
    newState: 'draft',
    metadata: { period_key: created.period_key, payable_cents: created.payable_cents, lines: lines.length },
  });
  const full = await getPayoutBatch(supabase, created.id);
  return full ? { ok: true, batch: full } : { ok: false, error: 'Lote creado pero no legible', status: 500 };
}

export async function approvePayoutBatch(
  supabase: SupabaseClient,
  id: string,
  actor: BatchActor,
  force: boolean,
): Promise<BatchOpResult> {
  const batch = await getPayoutBatch(supabase, id);
  if (!batch) return { ok: false, error: 'Lote no encontrado', status: 404 };
  const check = canApproveBatch(batch, actor, force);
  if (!check.ok) {
    const msg =
      check.reason === 'two_person_rule'
        ? 'Regla de dos personas: quien preparó el lote no puede aprobarlo. El owner puede forzar (queda registrado).'
        : `No se puede aprobar: ${check.reason}`;
    return { ok: false, error: msg, status: 409 };
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('payout_batches')
    .update({
      status: 'approved',
      approved_by: actor.id,
      approved_at: now,
      updated_at: now,
      meta: { ...batch.meta, approved_role: actor.role, self_approved: check.selfApproved },
    })
    .eq('id', id)
    .eq('status', 'draft');
  if (error) return { ok: false, error: 'No se pudo aprobar el lote', status: 500 };
  await writeRewardAuditLog(supabase, {
    eventType: 'payout_batch_approved',
    actorId: actor.id,
    entityType: 'payout_batch',
    entityId: id,
    previousState: 'draft',
    newState: 'approved',
    metadata: { self_approved: check.selfApproved, role: actor.role },
  });
  const full = await getPayoutBatch(supabase, id);
  return full ? { ok: true, batch: full } : { ok: false, error: 'Lote no legible', status: 500 };
}

export async function cancelPayoutBatch(
  supabase: SupabaseClient,
  id: string,
  actor: BatchActor,
  reason: string | null,
): Promise<BatchOpResult> {
  const batch = await getPayoutBatch(supabase, id);
  if (!batch) return { ok: false, error: 'Lote no encontrado', status: 404 };
  if (batch.status === 'released' || batch.status === 'cancelled') {
    return { ok: false, error: `No se puede cancelar un lote ${batch.status}`, status: 409 };
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('payout_batches')
    .update({
      status: 'cancelled',
      cancelled_by: actor.id,
      cancelled_at: now,
      updated_at: now,
      meta: { ...batch.meta, cancel_reason: reason },
    })
    .eq('id', id)
    .in('status', ['draft', 'approved']);
  if (error) return { ok: false, error: 'No se pudo cancelar el lote', status: 500 };
  await writeRewardAuditLog(supabase, {
    eventType: 'payout_batch_cancelled',
    actorId: actor.id,
    entityType: 'payout_batch',
    entityId: id,
    previousState: batch.status,
    newState: 'cancelled',
    metadata: { reason },
  });
  const full = await getPayoutBatch(supabase, id);
  return full ? { ok: true, batch: full } : { ok: false, error: 'Lote no legible', status: 500 };
}

/**
 * Libera líneas `pass`: reserva payout_intents por recompensa. Los guards del money path viven
 * dentro de processAvailableRewardPayoutIntent → en producción congelada todo sale deferred.
 */
export async function releasePayoutBatch(
  supabase: SupabaseClient,
  id: string,
  actor: BatchActor,
  runtime: PayoutOpsRuntime,
): Promise<BatchOpResult & { summary?: { reserved: number; reused: number; deferred: number; rejected: number } }> {
  const batch = await getPayoutBatch(supabase, id);
  if (!batch) return { ok: false, error: 'Lote no encontrado', status: 404 };
  const blockers = releaseBlockersFor(batch, runtime);
  if (blockers.length > 0) {
    return { ok: false, error: `No liberable: ${blockers.join(', ')}`, status: 409 };
  }

  const summary = { reserved: 0, reused: 0, deferred: 0, rejected: 0 };
  for (const line of batch.lines) {
    if (line.decision !== 'pass') continue;
    let lineStatus: PayoutBatchLineRow['release_status'] = 'none';
    const reasons: string[] = [];
    for (const rewardId of line.reward_ids) {
      const r = await processAvailableRewardPayoutIntent(supabase, rewardId, { actorId: actor.id });
      summary[r.outcome] += 1;
      reasons.push(`${rewardId.slice(0, 8)}:${r.outcome}:${r.reason}`);
      // Peor estado gana para la línea.
      const rank: Record<PayoutBatchLineRow['release_status'], number> = {
        none: 0,
        reserved: 1,
        reused: 1,
        deferred: 2,
        rejected: 3,
      };
      if (rank[r.outcome] > rank[lineStatus]) lineStatus = r.outcome;
    }
    await supabase
      .from('payout_batch_lines')
      .update({ release_status: lineStatus, release_reason: reasons.join(' | ').slice(0, 2000), updated_at: new Date().toISOString() })
      .eq('id', line.id);
  }

  const allClaimed = summary.deferred === 0 && summary.rejected === 0 && summary.reserved + summary.reused > 0;
  const now = new Date().toISOString();
  await supabase
    .from('payout_batches')
    .update({
      status: allClaimed ? 'released' : 'approved',
      released_by: allClaimed ? actor.id : batch.released_by,
      released_at: allClaimed ? now : batch.released_at,
      updated_at: now,
      meta: {
        ...batch.meta,
        release_attempts: [
          ...((batch.meta.release_attempts as unknown[]) ?? []),
          { at: now, by: actor.id, ...summary },
        ].slice(-10),
      },
    })
    .eq('id', id);

  await writeRewardAuditLog(supabase, {
    eventType: allClaimed ? 'payout_batch_released' : 'payout_batch_release_partial',
    actorId: actor.id,
    entityType: 'payout_batch',
    entityId: id,
    previousState: 'approved',
    newState: allClaimed ? 'released' : 'approved',
    metadata: summary,
  });

  const full = await getPayoutBatch(supabase, id);
  return full ? { ok: true, batch: full, summary } : { ok: false, error: 'Lote no legible', status: 500 };
}
