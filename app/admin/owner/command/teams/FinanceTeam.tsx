'use client';

import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { GerenciaPayload } from '@/lib/staff/buildStaffHome';
import type { OwnerRangeKey } from '@/lib/owner/ownerRange';
import { formatMoneyCents } from '@/app/components/panel/utils';
import { moneyProvenanceLabel } from '@/lib/finance/financialRecordClass';
import { Metric, Unavailable, formatCount } from '../ui';
import TeamBody, { type TeamAlert } from './TeamBody';

const PAYOUT_STATUS_LABEL: Record<string, string> = {
  RESERVED: 'reservados',
  SUBMITTED: 'enviados',
  SUCCEEDED: 'completados',
  FAILED: 'fallidos',
  UNKNOWN: 'por confirmar',
  CANCELLED: 'cancelados',
};

function statusList(rec: Record<string, number> | null | undefined, labels?: Record<string, string>): string {
  if (!rec) return 'No disponible';
  const entries = Object.entries(rec);
  if (!entries.length) return 'Sin registros';
  return entries.map(([k, v]) => `${v} ${labels?.[k] ?? k.toLowerCase()}`).join(' · ');
}

export default function FinanceTeam({
  base,
  cmd,
  gerencia,
  range,
}: {
  base: OwnerDashboardPayload | null;
  cmd: OwnerCommandPayload | null;
  gerencia: GerenciaPayload | null;
  range: OwnerRangeKey;
}) {
  const frozen = base?.systemHealth.moneyPathFrozen ?? cmd?.finance.moneyPathFrozen ?? null;
  const econ = base ? (range === 'today' ? base.economy.day : range === '7d' ? base.economy.week : range === 'month' ? base.economy.month : null) : null;
  const alerts: TeamAlert[] = [];
  if (base && base.economy.syntheticLedgerRowsExcluded > 0) {
    alerts.push({ tone: 'info', text: `${base.economy.syntheticLedgerRowsExcluded} registro(s) de prueba excluidos de los ingresos.` });
  }
  if (base && !base.month.ledgerAvailable) alerts.push({ tone: 'warn', text: 'El libro de ingresos no está disponible para este mes.' });
  for (const a of base?.alerts ?? []) {
    if (a.id === 'ledger_empty' || a.id === 'affiliate_tags') alerts.push({ tone: a.severity === 'red' ? 'bad' : 'warn', text: `${a.title}: ${a.detail}` });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={
            frozen
              ? 'inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-200'
              : 'inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200'
          }
        >
          Pagos <span aria-hidden>●</span> {frozen == null ? 'estado desconocido' : frozen ? 'Congelado' : 'Abierto'}
        </span>
        <span className="text-[11px] text-white/45">Vista solo informativa: sin acciones de pago.</span>
      </div>
      <TeamBody
        metrics={
          <>
            <Metric
              label="Ingresos confirmados"
              provenance={econ ? 'REAL' : 'UNAVAILABLE'}
              value={econ ? formatMoneyCents(econ.realCents) : <Unavailable what="Sin ventana de 30 días para ingresos" />}
              hint={base ? moneyProvenanceLabel(base.economy.confirmedProvenance) : undefined}
            />
            <Metric
              label="Oportunidad estimada"
              provenance={econ?.estimatedCents != null ? 'CALCULATED' : 'UNAVAILABLE'}
              value={econ?.estimatedCents != null ? formatMoneyCents(econ.estimatedCents) : <Unavailable what="Sin base para estimar ingresos por clic" />}
              hint={base ? `Clics × ingreso promedio por clic (${base.economy.epcWindowLabel}). ${base.economy.confidenceReason}` : undefined}
            />
            <Metric
              label="Saldo comprometido con cazadores"
              provenance={base ? 'REAL' : 'UNAVAILABLE'}
              value={base ? formatMoneyCents(base.userLiabilityConfirmedCents) : <Unavailable what="Snapshot del panel no disponible" />}
              hint="Recompensas confirmadas de cazadores con ingreso atribuible (sin registros de prueba)."
            />
            <Metric
              label="Asignaciones pendientes"
              provenance={gerencia ? 'REAL' : 'UNAVAILABLE'}
              value={gerencia ? formatCount(gerencia.pulse.payoutsPending) : <Unavailable what="Tablero de equipo no disponible" />}
              hint="Comisiones asignadas pendientes de procesar."
            />
          </>
        }
        note={
          <>
            <span className="text-white/60">Recompensas por estado:</span> {statusList(cmd?.finance.rewardsByStatus)}
            <br />
            <span className="text-white/60">Pagos por estado:</span> {statusList(cmd?.finance.payoutIntentsByStatus, PAYOUT_STATUS_LABEL)}
            <br />
            <span className="text-white/60">Último lote de pagos:</span>{' '}
            {cmd?.finance.latestPayoutBatch == null
              ? 'No disponible'
              : cmd.finance.latestPayoutBatch.status
                ? `${cmd.finance.latestPayoutBatch.periodKey ?? '—'} · ${cmd.finance.latestPayoutBatch.status.toLowerCase()}`
                : 'Ninguno'}
            <br />
            Conteos de registros (sin montos).
          </>
        }
        alerts={alerts}
        ctas={[
          { href: '/equipo/contabilidad', label: 'Ver finanzas', primary: true },
          { href: '/admin/commissions', label: 'Comisiones' },
          { href: '/admin/rewards', label: 'Recompensas' },
        ]}
      />
    </div>
  );
}
