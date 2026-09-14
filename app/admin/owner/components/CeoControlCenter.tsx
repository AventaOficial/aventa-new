'use client';

import Link from 'next/link';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import { moneyProvenanceLabel } from '@/lib/finance/financialRecordClass';
import { formatMoneyCents, formatNum, cn } from '@/app/components/panel/utils';
import {
  formatMedianDecisionTime,
  formatPendingToLivePct,
} from '@/lib/moderation/outcomes';

function toneClass(tone: 'green' | 'yellow' | 'red' | 'gray') {
  if (tone === 'green') return 'border-emerald-500/30 bg-emerald-500/[0.08]';
  if (tone === 'yellow') return 'border-amber-500/30 bg-amber-500/[0.08]';
  if (tone === 'red') return 'border-red-500/30 bg-red-500/[0.08]';
  return 'border-white/[0.08] bg-white/[0.03]';
}

function toneDot(tone: 'green' | 'yellow' | 'red' | 'gray') {
  if (tone === 'green') return 'bg-emerald-400';
  if (tone === 'yellow') return 'bg-amber-400';
  if (tone === 'red') return 'bg-red-400';
  return 'bg-white/30';
}

/**
 * CEO Control Center — respuestas en ≤30s.
 * Confirmed vs Estimated nunca se mezclan.
 */
export default function CeoControlCenter({ data }: { data: OwnerDashboardPayload }) {
  const confirmed = data.economy.month.realCents ?? 0;
  const estimated = data.economy.month.estimatedCents;
  const pending = data.moderation.pending ?? 0;
  const critical = data.alerts.filter((a) => a.severity === 'red').length;
  const systemTone =
    data.summary.status === 'red' ? 'red' : data.summary.status === 'yellow' ? 'yellow' : 'green';
  const moneyTone = confirmed > 0 ? 'green' : 'gray';
  const reviewTone = pending >= 20 ? 'red' : pending >= 3 ? 'yellow' : 'green';
  const liability = data.userLiabilityConfirmedCents ?? 0;

  const kpis: Array<{
    label: string;
    value: string;
    meaning: string;
    tone: 'green' | 'yellow' | 'red' | 'gray';
    provenance?: string;
  }> = [
    {
      label: 'System',
      value:
        systemTone === 'green' ? 'Healthy' : systemTone === 'yellow' ? 'Attention' : 'Action required',
      meaning: data.summary.subline,
      tone: systemTone,
    },
    {
      label: 'Live deals',
      value: formatNum(data.liveDeals),
      meaning: 'Ofertas approved/published no expiradas',
      tone: (data.liveDeals ?? 0) > 0 ? 'green' : 'gray',
    },
    {
      label: 'Needs review',
      value: formatNum(pending),
      meaning: pending > 0 ? 'Pendientes en cola de moderación' : 'Cola limpia',
      tone: reviewTone,
    },
    {
      label: 'Revenue confirmed',
      value: formatMoneyCents(confirmed),
      meaning:
        confirmed > 0
          ? 'Comisiones productivas del mes (QA excluido)'
          : 'Sin ventas productivas confirmadas este mes',
      tone: moneyTone,
      provenance: moneyProvenanceLabel(data.economy.confirmedProvenance),
    },
    {
      label: 'Revenue estimated',
      value: estimated != null ? formatMoneyCents(estimated) : 'NO_DATA',
      meaning:
        estimated != null
          ? `Oportunidad: clics × EPC productivo (${data.economy.epcWindowLabel})`
          : 'EPC = NO_DATA — sin base productiva para estimar',
      tone: estimated != null ? 'yellow' : 'gray',
      provenance: moneyProvenanceLabel(data.economy.estimatedProvenance),
    },
    {
      label: 'User liability',
      value: formatMoneyCents(liability),
      meaning: 'Rewards productivos pendientes/pagados (QA excluido)',
      tone: liability > 0 ? 'yellow' : 'gray',
    },
    {
      label: 'Critical issues',
      value: String(critical),
      meaning: critical > 0 ? 'Alertas rojas activas' : 'Sin alertas críticas',
      tone: critical > 0 ? 'red' : 'green',
    },
    {
      label: 'Pending → Live',
      value: formatPendingToLivePct(data.moderation.pendingToLivePct),
      meaning:
        data.moderation.pendingToLivePct != null
          ? 'Conversión de decisiones humanas a ofertas live (7d)'
          : 'Sin decisiones suficientes en outcomes (7d)',
      tone:
        data.moderation.pendingToLivePct == null
          ? 'gray'
          : data.moderation.pendingToLivePct >= 20
            ? 'green'
            : data.moderation.pendingToLivePct > 0
              ? 'yellow'
              : 'gray',
    },
    {
      label: 'Median decision',
      value: formatMedianDecisionTime(data.moderation.medianDecisionMinutes),
      meaning: 'Mediana pending → approve/reject (7d)',
      tone: data.moderation.medianDecisionMinutes != null ? 'yellow' : 'gray',
    },
  ];

  return (
    <section
      className="mb-6 rounded-3xl border border-violet-500/25 bg-gradient-to-br from-[#0f0f12] via-[#16121f] to-[#0d0d10] p-5 md:p-6 shadow-[0_12px_40px_rgba(88,28,135,0.18)]"
      aria-label="CEO Control Center"
      data-ceo-control-center
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300/90">
            Aventa · CEO Control Center
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-white md:text-2xl">
            {data.summary.headline}
          </h2>
          <p className="mt-1 text-sm text-white/50">{data.summary.subline}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold',
            toneClass(systemTone),
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', toneDot(systemTone))} aria-hidden />
          {systemTone === 'green' ? 'Healthy' : systemTone === 'yellow' ? 'Attention' : 'Action'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={cn('rounded-2xl border p-3.5', toneClass(k.tone))}
            data-kpi={k.label}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">{k.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white md:text-xl">{k.value}</p>
            <p className="mt-1 text-[11px] leading-snug text-white/45">{k.meaning}</p>
            {k.provenance ? (
              <p className="mt-1.5 text-[10px] text-white/30">{k.provenance}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
          Recommended action
        </p>
        <p className="mt-1 text-sm font-semibold text-white">{data.recommendedAction.title}</p>
        <p className="mt-0.5 text-xs text-white/50">{data.recommendedAction.detail}</p>
        <Link
          href={data.recommendedAction.href}
          className="mt-3 inline-flex text-xs font-semibold text-violet-300 hover:text-violet-200"
        >
          Ir ahora →
        </Link>
      </div>

      {data.economy.syntheticLedgerRowsExcluded > 0 ? (
        <p className="mt-3 text-[11px] text-amber-200/70">
          {data.economy.syntheticLedgerRowsExcluded} registro(s) QA/synthetic preservados pero
          excluidos de revenue confirmado y EPC.
        </p>
      ) : null}
    </section>
  );
}
