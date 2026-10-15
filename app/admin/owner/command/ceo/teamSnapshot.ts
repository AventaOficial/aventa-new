import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { CeoPriority, TeamId } from '../types';
import { payoutIntentCounts } from '@/lib/owner/executiveFinance';
import { formatCount } from './model';

export type TeamMetric = { label: string; value: string | null; why: string };
export type TeamAlert = { tone: 'bad' | 'warn'; text: string };
export type TeamSnapshot = { metrics: TeamMetric[]; alert: TeamAlert | null };

const n = (v: number | null | undefined) => (v == null ? null : formatCount(v));

function payouts(cmd: OwnerCommandPayload | null, key: 'reserved' | 'submitted' | 'failed' | 'providerResolved'): number | null {
  const counts = payoutIntentCounts(cmd?.finance.payoutIntentsByStatus);
  if (key === 'failed') {
    if (counts.failed == null || counts.unknown == null) return null;
    return counts.failed + counts.unknown;
  }
  return counts[key];
}

/** Cuatro cifras básicas por equipo, solo de fuentes que el dashboard ya lee. */
export function teamSnapshot(
  id: TeamId,
  base: OwnerDashboardPayload | null,
  cmd: OwnerCommandPayload | null,
  priorities: CeoPriority[],
): TeamSnapshot {
  const top = priorities.find((p) => p.team === id && p.severity !== 'info');
  const alert: TeamAlert | null = top ? { tone: top.severity === 'critical' || top.severity === 'high' ? 'bad' : 'warn', text: top.problem } : null;
  const period = cmd ? ` ${cmd.range.label.toLowerCase()}` : '';

  switch (id) {
    case 'moderacion':
      return {
        alert,
        metrics: [
          { label: 'Pendientes', value: n(base?.moderation.pending), why: 'Snapshot de moderación no disponible.' },
          { label: `Aprobadas${period}`, value: n(cmd?.moderation.approved.value), why: 'Decisiones del período no disponibles.' },
          { label: 'Reportes', value: n(cmd?.moderation.pendingReports), why: 'Reportes no disponibles.' },
          {
            label: 'Moderadores',
            value: cmd?.moderation.activeModerators != null && cmd.moderation.teamSize != null ? `${cmd.moderation.activeModerators}/${cmd.moderation.teamSize}` : null,
            why: 'Equipo de moderación no disponible.',
          },
        ],
      };
    case 'finanzas':
      return {
        alert,
        metrics: [
          { label: 'Intents reservados', value: n(payouts(cmd, 'reserved')), why: 'Pagos no disponibles.' },
          { label: 'Enviados', value: n(payouts(cmd, 'submitted')), why: 'Pagos no disponibles.' },
          { label: 'Incidencias', value: n(payouts(cmd, 'failed')), why: 'Pagos no disponibles.' },
          {
            label: 'Flujo de dinero',
            value: cmd
              ? cmd.finance.moneyPathFrozen || cmd.finance.economicGate.payout !== 'ALLOWED'
                ? 'Bloqueado'
                : 'Sin bloqueo'
              : null,
            why: 'Estado del flujo de dinero no disponible.',
          },
        ],
      };
    case 'growth':
      return {
        alert,
        metrics: [
          { label: `Visitas${period}`, value: n(cmd?.traffic.views.value), why: 'Visitas no disponibles.' },
          { label: 'Clics a tienda', value: n(cmd?.traffic.outbound.value), why: 'Clics no disponibles.' },
          { label: 'Usuarios nuevos', value: n(cmd?.users.newUsers.value), why: 'Altas no disponibles.' },
          { label: 'Usuarios activos', value: n(cmd?.users.activeUsers), why: 'Accesos no disponibles.' },
        ],
      };
    case 'producto': {
      const sources = cmd ? Object.values(cmd.sources) : null;
      return {
        alert,
        metrics: [
          {
            label: 'Integridad',
            value: cmd?.operations.integrityOk == null ? null : cmd.operations.integrityOk ? 'OK' : 'Con fallos',
            why: 'Sin chequeo de integridad registrado.',
          },
          { label: 'Fuentes con error', value: sources ? `${sources.filter((s) => s === 'error').length}/${sources.length}` : null, why: 'Lecturas del panel no disponibles.' },
          { label: 'Escrituras fallidas', value: n(cmd?.operations.queueFailed), why: 'Cola de escritura no disponible.' },
          { label: 'Métricas diarias', value: cmd?.operations.dailyMetricsLastDate ?? null, why: 'Sin métricas diarias registradas.' },
        ],
      };
    }
    case 'hunter':
      return {
        alert,
        metrics: [
          { label: 'Runs OK', value: cmd?.hunter.runs != null ? `${formatCount(cmd.hunter.runsOk)}/${formatCount(cmd.hunter.runs)}` : null, why: 'Runs de Hunter no disponibles.' },
          { label: 'Descubiertas', value: n(cmd?.hunter.discovered), why: 'Ofertas descubiertas no disponibles.' },
          { label: 'Duplicados', value: n(cmd?.hunter.duplicates), why: 'Duplicados no disponibles.' },
          { label: 'Errores', value: n(cmd?.hunter.errors), why: 'Errores de Hunter no disponibles.' },
        ],
      };
    case 'comunidad':
      return {
        alert,
        metrics: [
          { label: `Votos${period}`, value: n(cmd?.community.votes.value), why: 'Votos no disponibles.' },
          { label: 'Comentarios', value: n(cmd?.community.comments.value), why: 'Comentarios no disponibles.' },
          { label: 'Cazadores activos', value: n(cmd?.community.activeHunters.value), why: 'Autores no disponibles.' },
          { label: 'Reportes', value: n(cmd?.community.reports.value), why: 'Reportes no disponibles.' },
        ],
      };
    case 'operaciones':
      return {
        alert,
        metrics: [
          { label: 'Cola pendiente', value: n(cmd?.operations.queuePending), why: 'Cola de escritura no disponible.' },
          { label: 'Fallidos', value: n(cmd?.operations.queueFailed), why: 'Cola de escritura no disponible.' },
          {
            label: 'Integridad',
            value: cmd?.operations.integrityOk == null ? null : cmd.operations.integrityOk ? 'OK' : 'Con fallos',
            why: 'Sin chequeo de integridad registrado.',
          },
          { label: 'Catálogo vivo', value: n(cmd?.catalog.live), why: 'Catálogo no disponible.' },
        ],
      };
  }
}
