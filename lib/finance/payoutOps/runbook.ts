/**
 * Runbook del periodo — pasos con estado calculado.
 * docs/SYSTEMS/SYSTEM_payout_operations.md §6
 */

import { isProductionFinancialRecord } from '@/lib/finance/financialRecordClass';
import type { BatchPreview, PayoutOpsData, PayoutOpsRuntime, RunbookStep } from './types';

export function buildRunbook(
  data: PayoutOpsData,
  runtime: PayoutOpsRuntime,
  batch: BatchPreview,
): RunbookStep[] {
  const now = Date.parse(data.now);
  const periodStart = Date.parse(data.periodStart);

  const evidenceRows = data.ledger.filter(
    (r) =>
      Date.parse(r.created_at) >= periodStart &&
      (r.source === 'csv_import' || r.source === 'api') &&
      isProductionFinancialRecord({
        externalRef: r.external_ref,
        source: r.source,
        notes: r.notes,
        meta: r.meta,
        trackingTag: r.tracking_tag,
      }),
  ).length;

  const approvedUnsettled = data.commissions.filter(
    (c) => c.status === 'approved' && !c.ledger_entry_id,
  ).length;

  const rewardsPeriod = data.rewards.filter((r) => Date.parse(r.created_at) >= periodStart).length;
  const overdueHolds = data.rewards.filter(
    (r) => r.status === 'VALIDATING' && r.hold_until && Date.parse(r.hold_until) <= now,
  ).length;

  const reserved = data.intents.filter((i) => i.status === 'RESERVED').length;
  const submitted = data.intents.filter((i) => i.status === 'SUBMITTED').length;

  const providerReady =
    runtime.payoutProvider.mode === 'real' ||
    runtime.payoutProvider.mode === 'manual_spei' ||
    runtime.payoutProvider.mode === 'sandbox' ||
    runtime.payoutProvider.mode === 'stub';

  const steps: RunbookStep[] = [
    {
      id: 'evidence',
      order: 1,
      title: 'Evidencia de red importada',
      description: 'Reporte Amazon/ML (o API) del periodo cargado al ledger canónico.',
      actor: 'finance',
      status: !data.tables.affiliate_ledger_entries ? 'na' : evidenceRows > 0 ? 'done' : 'pending',
      detail:
        evidenceRows > 0
          ? `${evidenceRows} fila(s) de producción con fuente csv_import/api este periodo.`
          : 'Sin evidencia de red este periodo. Sin esto no hay base para pagar.',
      href: '/equipo/contabilidad/ledger',
    },
    {
      id: 'settle',
      order: 2,
      title: 'Comisiones asentadas en ledger canónico',
      description: 'Toda comisión approved tiene su ledger_entry_id (settlement bridge).',
      actor: 'sistema',
      status: !data.tables.affiliate_commissions
        ? 'na'
        : approvedUnsettled === 0
          ? 'done'
          : runtime.settlementBridgeEnabled
            ? 'pending'
            : 'blocked',
      detail:
        approvedUnsettled === 0
          ? 'Sin comisiones approved pendientes de asentar.'
          : `${approvedUnsettled} comisión(es) approved sin ledger_entry_id${runtime.settlementBridgeEnabled ? '' : ' — SETTLEMENT_BRIDGE_ENABLED apagado'}.`,
      href: null,
    },
    {
      id: 'rewards',
      order: 3,
      title: 'Recompensas creadas (split 40/60)',
      description: 'Ledger atribuido → creator_rewards en VALIDATING con hold.',
      actor: 'sistema',
      status: !data.tables.creator_rewards
        ? 'na'
        : rewardsPeriod > 0
          ? 'done'
          : evidenceRows > 0
            ? 'pending'
            : 'blocked',
      detail:
        rewardsPeriod > 0
          ? `${rewardsPeriod} recompensa(s) creadas este periodo.`
          : evidenceRows > 0
            ? 'Hay evidencia pero aún no se generaron recompensas (cron ledger-reward-bridge).'
            : 'Depende del paso 1.',
      href: '/admin/rewards',
    },
    {
      id: 'holds',
      order: 4,
      title: 'Holds liberados',
      description: 'VALIDATING con hold vencido pasa a AVAILABLE (cron diario).',
      actor: 'sistema',
      status: !data.tables.creator_rewards ? 'na' : overdueHolds === 0 ? 'done' : 'pending',
      detail:
        overdueHolds === 0
          ? 'Ningún hold vencido sin liberar.'
          : `${overdueHolds} recompensa(s) con hold vencido siguen en VALIDATING.`,
      href: null,
    },
    {
      id: 'batch',
      order: 5,
      title: 'Lote preparado y gates evaluados',
      description: 'Saldos agrupados por creador; cada uno con pass / review / fail / carry.',
      actor: 'finance',
      status:
        batch.lines.length === 0
          ? 'pending'
          : batch.totals.reviewCount === 0
            ? 'done'
            : 'pending',
      detail:
        batch.lines.length === 0
          ? 'Sin saldos disponibles para agrupar.'
          : `${batch.totals.payableCount} pass · ${batch.totals.reviewCount} review · ${batch.totals.blockedCount} fail · ${batch.totals.carryCount} carry.`,
      href: null,
    },
    {
      id: 'approve',
      order: 6,
      title: 'Aprobación del lote',
      description: 'Decisión humana explícita (owner/finance). Nunca automática en V1.',
      actor: 'owner',
      status: runtime.moneyPathFrozen
        ? 'blocked'
        : batch.readyToRelease
          ? 'pending'
          : 'blocked',
      detail: runtime.moneyPathFrozen
        ? 'MONEY_PATH_FROZEN activo: no se libera dinero en este runtime.'
        : batch.readyToRelease
          ? 'Lote listo para decisión.'
          : `Bloqueado por: ${batch.releaseBlockers.join(', ')}.`,
      href: null,
    },
    {
      id: 'disburse',
      order: 7,
      title: 'Ejecutar SPEI',
      description: 'payout_intents RESERVED → SUBMITTED vía proveedor (o banca manual).',
      actor: providerReady && runtime.payoutProvider.mode === 'real' ? 'sistema' : 'finance',
      status: !providerReady ? 'blocked' : reserved === 0 ? 'done' : 'pending',
      detail: !providerReady
        ? runtime.payoutProvider.detail
        : reserved === 0
          ? 'Sin intents reservados esperando envío.'
          : `${reserved} intent(s) reservados por enviar.`,
      href: '/admin/rewards',
    },
    {
      id: 'confirm',
      order: 8,
      title: 'Confirmar y conciliar',
      description: 'SUBMITTED → SUCCEEDED/FAILED; recompensa PAID; ledger marcado.',
      actor: runtime.payoutProvider.mode === 'real' ? 'sistema' : 'finance',
      status: !data.tables.payout_intents ? 'na' : submitted === 0 ? 'done' : 'pending',
      detail:
        submitted === 0
          ? 'Nada pendiente de confirmar.'
          : `${submitted} intent(s) enviados sin confirmación.`,
      href: '/admin/rewards',
    },
    {
      id: 'fiscal',
      order: 9,
      title: 'Fiscal / CFDI',
      description: 'Constancias y retenciones con contador externo. Fuera del producto.',
      actor: 'externo',
      status: 'na',
      detail: 'Exportar lote pagado y entregar al contador fiscal.',
      href: null,
    },
  ];

  return steps;
}
