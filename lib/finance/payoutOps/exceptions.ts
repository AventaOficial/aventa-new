/**
 * Cola de excepciones — el 1–5 % que sí requiere humano.
 * docs/SYSTEMS/SYSTEM_payout_operations.md §7
 */

import { isProductionFinancialRecord } from '@/lib/finance/financialRecordClass';
import { centsToMx } from '@/lib/finance/hubConfig';
import type { BatchPreview, ExceptionItem, PayoutOpsData } from './types';

export const STALE_INTENT_HOURS = 48;

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

export function buildExceptionQueue(data: PayoutOpsData, batch: BatchPreview): ExceptionItem[] {
  const now = Date.parse(data.now);
  const out: ExceptionItem[] = [];

  for (const i of data.intents) {
    if (i.status === 'FAILED' || i.status === 'UNKNOWN') {
      out.push({
        id: `intent:${i.id}`,
        kind: i.status === 'FAILED' ? 'intent_failed' : 'intent_unknown',
        severity: 'critical',
        title: i.status === 'FAILED' ? 'Intent de pago fallido' : 'Intent en estado desconocido',
        detail: `Intent ${i.id.slice(0, 8)} · ${centsToMx(i.amount_cents)} · proveedor ${i.provider ?? 'n/d'}. Verificar en proveedor antes de reintentar (idempotencia).`,
        amountCents: i.amount_cents,
        owner: 'finance',
        href: '/admin/rewards',
      });
      continue;
    }
    if (i.status === 'RESERVED' || i.status === 'SUBMITTED') {
      const since = i.submitted_at ?? i.reserved_at ?? i.created_at;
      const ageH = (now - Date.parse(since)) / 3_600_000;
      if (ageH >= STALE_INTENT_HOURS) {
        out.push({
          id: `intent-stale:${i.id}`,
          kind: 'intent_stale',
          severity: 'attention',
          title: `Intent ${i.status} sin avanzar ${Math.floor(ageH)} h`,
          detail: `Intent ${i.id.slice(0, 8)} · ${centsToMx(i.amount_cents)}. Revisar cron/proveedor.`,
          amountCents: i.amount_cents,
          owner: 'finance',
          href: '/admin/rewards',
        });
      }
    }
  }

  for (const r of data.rewards) {
    if (r.status !== 'AVAILABLE' && r.status !== 'VALIDATING') continue;
    const flags = toStringArray(r.fraud_flags);
    if (flags.length === 0) continue;
    out.push({
      id: `reward-fraud:${r.id}`,
      kind: 'reward_fraud_flags',
      severity: 'attention',
      title: 'Recompensa con señales de fraude',
      detail: `Recompensa ${r.id.slice(0, 8)} · ${centsToMx(r.creator_share_cents)} · flags: ${flags.join(', ')}.`,
      amountCents: r.creator_share_cents,
      owner: 'finance',
      href: '/admin/rewards',
    });
  }

  const pendingClawbacks = data.clawbacks.filter((c) => c.status === 'pending');
  if (pendingClawbacks.length > 0) {
    const total = pendingClawbacks.reduce((s, c) => s + Math.abs(c.adjustment_amount_cents), 0);
    out.push({
      id: 'clawbacks:pending',
      kind: 'clawback_pending',
      severity: 'attention',
      title: `${pendingClawbacks.length} clawback(s) pendientes`,
      detail: `${centsToMx(total)} por recuperar o descontar de futuros pagos. SPEI no se revierte: es un ajuste nuevo.`,
      amountCents: total,
      owner: 'finance',
      href: '/admin/rewards',
    });
  }

  for (const line of batch.lines) {
    if (line.gate.decision !== 'fail' && line.gate.decision !== 'review') continue;
    out.push({
      id: `payee:${line.creatorId}`,
      kind: line.gate.decision === 'fail' ? 'payee_gate_fail' : 'payee_gate_review',
      severity: 'attention',
      title:
        line.gate.decision === 'fail'
          ? `Bloqueado: ${line.displayName ?? line.creatorId.slice(0, 8)}`
          : `Revisar: ${line.displayName ?? line.creatorId.slice(0, 8)}`,
      detail: `${centsToMx(line.amountCents)} · ${line.gate.reasons.join(' ')}`,
      amountCents: line.amountCents,
      owner: 'finance',
      href: null,
    });
  }

  let unattributedCents = 0;
  let unattributedCount = 0;
  let syntheticCount = 0;
  for (const r of data.ledger) {
    const prod = isProductionFinancialRecord({
      externalRef: r.external_ref,
      source: r.source,
      notes: r.notes,
      meta: r.meta,
      trackingTag: r.tracking_tag,
    });
    if (!prod) {
      syntheticCount += 1;
      continue;
    }
    if ((r.attributable === false || !r.creator_id) && r.status !== 'void') {
      unattributedCents += r.amount_cents;
      unattributedCount += 1;
    }
  }
  if (unattributedCount > 0) {
    out.push({
      id: 'ledger:unattributed',
      kind: 'ledger_unattributed',
      severity: 'info',
      title: `${unattributedCount} comisión(es) sin creador atribuible`,
      detail: `${centsToMx(unattributedCents)} se queda 100 % en plataforma. Es normal; solo revisar si el volumen crece.`,
      amountCents: unattributedCents,
      owner: 'sistema',
      href: '/equipo/contabilidad/ledger',
    });
  }
  if (syntheticCount > 0) {
    out.push({
      id: 'ledger:synthetic',
      kind: 'ledger_synthetic',
      severity: 'info',
      title: `${syntheticCount} fila(s) QA / no verificadas excluidas`,
      detail: 'No cuentan para ningún cálculo de pago (financialRecordClass).',
      amountCents: null,
      owner: 'sistema',
      href: '/equipo/contabilidad/ledger',
    });
  }

  const sev = { critical: 0, attention: 1, info: 2 };
  out.sort((a, b) => sev[a.severity] - sev[b.severity] || (b.amountCents ?? 0) - (a.amountCents ?? 0));
  return out;
}
