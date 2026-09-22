/**
 * Las 6 cajas del pipeline + clasificación de automatización (calculada, no declarada).
 * docs/SYSTEMS/SYSTEM_payout_operations.md §2
 */

import { isProductionFinancialRecord } from '@/lib/finance/financialRecordClass';
import { centsToMx } from '@/lib/finance/hubConfig';
import type {
  AutomationLevel,
  PayoutOpsData,
  PayoutOpsRuntime,
  PipelineStage,
  StageId,
} from './types';

export const STAGE_ORDER: StageId[] = ['ingest', 'split', 'hold', 'batch', 'disburse', 'reconcile'];

const STAGE_COPY: Record<
  StageId,
  { title: string; question: string; actor: PipelineStage['actor'] }
> = {
  ingest: {
    title: '1 · Entra',
    question: '¿Cuánta comisión confirmó la red este periodo?',
    actor: 'finance',
  },
  split: {
    title: '2 · Reparte',
    question: '¿Cuánto es del creador (40 %) y cuánto de Aventa (60 %)?',
    actor: 'sistema',
  },
  hold: {
    title: '3 · Espera',
    question: '¿Qué ya pasó el hold de devoluciones y qué sigue esperando?',
    actor: 'sistema',
  },
  batch: {
    title: '4 · Junta',
    question: '¿Quién llega al mínimo y pasa los gates para cobrar?',
    actor: 'finance',
  },
  disburse: {
    title: '5 · Sale',
    question: '¿Cómo sale el dinero a la CLABE de cada creador?',
    actor: 'sistema',
  },
  reconcile: {
    title: '6 · Cierra',
    question: '¿El banco cuadra con el ledger? ¿Qué quedó en excepciones?',
    actor: 'finance',
  },
};

function isProdRow(r: {
  external_ref: string | null;
  source: string | null;
  notes: string | null;
  meta: unknown;
  tracking_tag: string | null;
}): boolean {
  return isProductionFinancialRecord({
    externalRef: r.external_ref,
    source: r.source,
    notes: r.notes,
    meta: r.meta,
    trackingTag: r.tracking_tag,
  });
}

export function classifyIngest(data: PayoutOpsData): {
  level: AutomationLevel;
  reason: string;
  next: string;
  live: boolean;
} {
  const prodLedger = data.ledger.filter(isProdRow);
  const apiRows = prodLedger.filter((r) => r.source === 'api').length;
  const csvRows = prodLedger.filter((r) => r.source === 'csv_import').length;
  const apiCommissions = data.commissions.filter(
    (c) => c.source === 'api' || c.source === 'webhook',
  ).length;
  const csvCommissions = data.commissions.filter((c) => c.source === 'csv_import').length;

  if (apiRows > 0 || apiCommissions > 0) {
    return {
      level: 'auto',
      reason: 'Hay comisiones ingresadas por adapter/API con id externo.',
      next: 'Mantener match rate y cobertura de redes.',
      live: true,
    };
  }
  if (csvCommissions > 0) {
    return {
      level: 'semi',
      reason:
        'Evidencia Amazon (Orders/Earnings) importada al Centro de Pagos: parser, huella idempotente y estados automáticos; la descarga sigue siendo manual.',
      next: 'Repetir cada periodo (día 1–3). Amazon no expone API de comisiones: esto es el techo real de "Entra".',
      live: true,
    };
  }
  if (csvRows > 0) {
    return {
      level: 'semi',
      reason: 'La evidencia entra por CSV importado a mano; el parseo y la idempotencia son automáticos.',
      next: 'Usar el importador Amazon del Centro de Pagos (V2) para que la evidencia llegue como commissions.',
      live: true,
    };
  }
  return {
    level: 'blocked',
    reason: 'Sin evidencia de red en producción: ni CSV ni API. No hay base real para repartir.',
    next: 'Descargar Orders + Earnings de Amazon Associates MX e importarlos (Evidence Capture).',
    live: false,
  };
}

export function classifySplit(runtime: PayoutOpsRuntime): {
  level: AutomationLevel;
  reason: string;
  next: string;
  live: boolean;
} {
  const live = runtime.settlementBridgeEnabled || runtime.rewardsProgramActive;
  return {
    level: 'auto',
    reason: 'splitCommissionCents (40/60) + cron ledger-reward-bridge; idempotente por ledger_entry_id.',
    next: live
      ? 'Nada pendiente en esta caja.'
      : 'Encender SETTLEMENT_BRIDGE_ENABLED / REWARDS_PROGRAM_ACTIVE fuera de producción para canary.',
    live,
  };
}

export function classifyHold(): {
  level: AutomationLevel;
  reason: string;
  next: string;
  live: boolean;
} {
  return {
    level: 'auto',
    reason: 'Cron rewards-release-holds mueve VALIDATING → AVAILABLE al vencer hold_until (60 d).',
    next: 'Nada pendiente. Considerar hold variable por red cuando haya datos de devoluciones.',
    live: true,
  };
}

export function classifyBatch(): {
  level: AutomationLevel;
  reason: string;
  next: string;
  live: boolean;
} {
  return {
    level: 'semi',
    reason: 'El sistema agrupa saldos y evalúa gates; la liberación del lote es humana por diseño.',
    next: 'Persistir lotes (payout_batches) con aprobación owner/finance y doble confirmación (V3).',
    live: true,
  };
}

export function classifyDisburse(runtime: PayoutOpsRuntime): {
  level: AutomationLevel;
  reason: string;
  next: string;
  live: boolean;
} {
  const mode = runtime.payoutProvider.mode;
  if (mode === 'real') {
    return {
      level: 'semi',
      reason: 'Proveedor SPEI real configurado: envío automático; excepciones a revisión humana.',
      next: 'Auto-release cuando todos los gates pasan y hay fondos (V5).',
      live: !runtime.moneyPathFrozen,
    };
  }
  if (mode === 'manual_spei' || mode === 'stub' || mode === 'sandbox') {
    return {
      level: 'manual',
      reason: `PAYOUT_PROVIDER=${runtime.payoutProvider.configured ?? mode}: intents y estados existen, pero el SPEI se hace en banca o en sandbox.`,
      next: 'Contratar proveedor SPEI (STP / PSP) y configurar PAYOUT_PROVIDER=real + webhook firmado (V4).',
      live: false,
    };
  }
  return {
    level: 'blocked',
    reason: runtime.payoutProvider.detail,
    next: 'Definir PAYOUT_PROVIDER explícito fuera de producción; en producción sigue fail-closed.',
    live: false,
  };
}

export function classifyReconcile(runtime: PayoutOpsRuntime): {
  level: AutomationLevel;
  reason: string;
  next: string;
  live: boolean;
} {
  if (runtime.payoutProvider.mode === 'real') {
    return {
      level: 'semi',
      reason: 'Webhook firmado confirma SUCCEEDED/FAILED; lo no matcheado cae a excepciones.',
      next: 'Conciliación contra estado de cuenta bancario (import) para cierre mensual.',
      live: !runtime.moneyPathFrozen,
    };
  }
  return {
    level: 'manual',
    reason: 'Sin proveedor real: finance confirma pagos a mano (spei_reference) y marca ledger.',
    next: 'Llega con V4 (proveedor real) — confirmación por webhook.',
    live: true,
  };
}

export function buildPipelineStages(
  data: PayoutOpsData,
  runtime: PayoutOpsRuntime,
  config: { creatorShareBps: number; holdDays: number; minPayoutCents: number },
  batch: { payableCents: number; payableCount: number; reviewCount: number; blockedCount: number; carryCount: number },
): PipelineStage[] {
  const now = Date.parse(data.now);
  const periodStart = Date.parse(data.periodStart);

  const prodLedger = data.ledger.filter(isProdRow);
  const ledgerPeriod = prodLedger.filter((r) => Date.parse(r.created_at) >= periodStart);
  const grossPeriod = ledgerPeriod.reduce((s, r) => s + r.amount_cents, 0);
  const unattributed = prodLedger
    .filter((r) => r.attributable === false || !r.creator_id)
    .reduce((s, r) => s + r.amount_cents, 0);

  const rewardsPeriod = data.rewards.filter((r) => Date.parse(r.created_at) >= periodStart);
  const creatorPeriod = rewardsPeriod.reduce((s, r) => s + r.creator_share_cents, 0);
  const platformPeriod = rewardsPeriod.reduce(
    (s, r) => s + Math.max(0, r.gross_commission_cents - r.creator_share_cents),
    0,
  );

  const validating = data.rewards.filter((r) => r.status === 'VALIDATING');
  const validatingCents = validating.reduce((s, r) => s + r.creator_share_cents, 0);
  const overdueHolds = validating.filter(
    (r) => r.hold_until && Date.parse(r.hold_until) <= now,
  ).length;
  const available = data.rewards.filter((r) => r.status === 'AVAILABLE');
  const availableCents = available.reduce((s, r) => s + r.creator_share_cents, 0);

  const reserved = data.intents.filter((i) => i.status === 'RESERVED').length;
  const submitted = data.intents.filter((i) => i.status === 'SUBMITTED').length;
  const succeeded = data.intents.filter((i) => i.status === 'SUCCEEDED');
  const failed = data.intents.filter((i) => i.status === 'FAILED' || i.status === 'UNKNOWN').length;
  const paidCents =
    succeeded.reduce((s, i) => s + i.amount_cents, 0) +
    data.payouts.filter((p) => p.status === 'completed').reduce((s, p) => s + p.amount_cents, 0);

  const ingest = classifyIngest(data);
  const split = classifySplit(runtime);
  const hold = classifyHold();
  const batchC = classifyBatch();
  const disburse = classifyDisburse(runtime);
  const reconcile = classifyReconcile(runtime);

  const mk = (
    id: StageId,
    c: { level: AutomationLevel; reason: string; next: string; live: boolean },
    metrics: PipelineStage['metrics'],
  ): PipelineStage => ({
    id,
    order: STAGE_ORDER.indexOf(id) + 1,
    title: STAGE_COPY[id].title,
    question: STAGE_COPY[id].question,
    actor: STAGE_COPY[id].actor,
    automation: c.level,
    automationReason: c.reason,
    nextUnlock: c.next,
    live: c.live,
    metrics,
  });

  return [
    mk('ingest', ingest, [
      { label: 'Comisión confirmada (periodo)', value: centsToMx(grossPeriod) },
      { label: 'Filas producción', value: String(ledgerPeriod.length) },
      {
        label: 'No atribuible → plataforma',
        value: centsToMx(unattributed),
        hint: 'Sin tag/oferta: 100 % Aventa, se registra igual.',
      },
    ]),
    mk('split', split, [
      { label: `Creadores (${config.creatorShareBps / 100} %)`, value: centsToMx(creatorPeriod) },
      { label: 'Plataforma', value: centsToMx(platformPeriod) },
      { label: 'Recompensas creadas', value: String(rewardsPeriod.length) },
    ]),
    mk('hold', hold, [
      { label: `En hold (${config.holdDays} d)`, value: centsToMx(validatingCents) },
      { label: 'Recompensas esperando', value: String(validating.length) },
      {
        label: 'Holds vencidos sin liberar',
        value: String(overdueHolds),
        hint: overdueHolds > 0 ? 'El cron debería moverlos hoy.' : undefined,
      },
    ]),
    mk('batch', batchC, [
      { label: 'Disponible total', value: centsToMx(availableCents) },
      { label: 'Pagable ahora (pass)', value: `${centsToMx(batch.payableCents)} · ${batch.payableCount}` },
      {
        label: 'Revisión / bloqueado / carry',
        value: `${batch.reviewCount} / ${batch.blockedCount} / ${batch.carryCount}`,
      },
    ]),
    mk('disburse', disburse, [
      { label: 'Proveedor', value: runtime.payoutProvider.configured ?? 'ninguno' },
      { label: 'Reservados / enviados', value: `${reserved} / ${submitted}` },
      { label: 'Fallidos / desconocidos', value: String(failed) },
    ]),
    mk('reconcile', reconcile, [
      { label: 'Pagado acumulado', value: centsToMx(paidCents) },
      { label: 'Confirmados', value: String(succeeded.length + data.payouts.filter((p) => p.status === 'completed').length) },
      { label: 'Pendientes de confirmar', value: String(submitted) },
    ]),
  ];
}
