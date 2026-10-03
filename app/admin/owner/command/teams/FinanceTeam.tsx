'use client';

import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { GerenciaPayload } from '@/lib/staff/buildStaffHome';
import type { OwnerRangeKey } from '@/lib/owner/ownerRange';
import { formatMoneyCents } from '@/app/components/panel/utils';
import { moneyProvenanceLabel } from '@/lib/finance/financialRecordClass';
import { Metric, Unavailable, formatCount } from '../ui';
import TeamBody, { type TeamAlert } from './TeamBody';

function statusList(rec: Record<string, number> | null | undefined): string {
  if (!rec) return 'No disponible';
  const entries = Object.entries(rec);
  if (!entries.length) return 'Sin registros';
  return entries.map(([k, v]) => `${k} ${v}`).join(' · ');
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
    alerts.push({ tone: 'info', text: `${base.economy.syntheticLedgerRowsExcluded} fila(s) QA/synthetic excluidas del revenue.` });
  }
  if (base && !base.month.ledgerAvailable) alerts.push({ tone: 'warn', text: base.month.ledgerNote ?? 'Ledger no disponible.' });
  for (const a of base?.alerts ?? []) {
    if (a.id === 'ledger_empty' || a.id === 'affiliate_tags') alerts.push({ tone: a.severity === 'red' ? 'bad' : 'warn', text: `${a.title}: ${a.detail}` });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={
            frozen
              ? 'inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200'
              : 'inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200'
          }
        >
          Money path <span aria-hidden>●</span> {frozen == null ? 'desconocido' : frozen ? 'Frozen' : 'Abierto'}
        </span>
        <span className="text-[11px] text-white/40">Vista estrictamente informativa: sin acciones de payout.</span>
      </div>
      <TeamBody
        metrics={
          <>
            <Metric
              label="Revenue confirmed"
              provenance={econ ? 'REAL' : 'UNKNOWN'}
              value={econ ? formatMoneyCents(econ.realCents) : <Unavailable what="Ventana no soportada (30 días)" />}
              hint={base ? moneyProvenanceLabel(base.economy.confirmedProvenance) : undefined}
            />
            <Metric
              label="Estimated opportunity"
              provenance={econ?.estimatedCents != null ? 'DERIVED' : 'UNKNOWN'}
              value={econ?.estimatedCents != null ? formatMoneyCents(econ.estimatedCents) : <Unavailable what="EPC sin base productiva" />}
              hint={base ? `clics × EPC (${base.economy.epcWindowLabel}). ${base.economy.confidenceReason}` : undefined}
            />
            <Metric
              label="User liability"
              provenance={base ? 'REAL' : 'UNKNOWN'}
              value={base ? formatMoneyCents(base.userLiabilityConfirmedCents) : <Unavailable what="Sin snapshot" />}
              hint="creator_rewards productivos con ledger atribuible (QA excluido)"
            />
            <Metric
              label="Asignaciones pendientes"
              provenance={gerencia ? 'REAL' : 'UNKNOWN'}
              value={gerencia ? formatCount(gerencia.pulse.payoutsPending) : <Unavailable what="Pulso de staff no disponible" />}
              hint="commission_allocations.status = pending (pulso del equipo)"
            />
          </>
        }
        note={
          <>
            <span className="text-white/55">Rewards por estado:</span> {statusList(cmd?.finance.rewardsByStatus)}
            <br />
            <span className="text-white/55">Payout intents:</span> {statusList(cmd?.finance.payoutIntentsByStatus)}
            <br />
            <span className="text-white/55">Último payout batch:</span>{' '}
            {cmd?.finance.latestPayoutBatch == null
              ? 'No disponible'
              : cmd.finance.latestPayoutBatch.status
                ? `${cmd.finance.latestPayoutBatch.periodKey ?? '—'} · ${cmd.finance.latestPayoutBatch.status}`
                : 'Ninguno'}
            {' · '}
            <span className="text-white/55">Eventos de auditoría de rewards ({cmd?.range.label ?? '—'}):</span> {formatCount(cmd?.finance.rewardAuditEventsInRange)}
            <br />
            Conteos de registros (incluyen QA/synthetic; sin montos).
          </>
        }
        alerts={alerts}
        ctas={[
          { href: '/equipo/contabilidad', label: 'Ver finanzas', primary: true },
          { href: '/admin/commissions', label: 'Comisiones' },
          { href: '/admin/rewards', label: 'Rewards ops' },
        ]}
      />
    </div>
  );
}
