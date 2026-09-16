'use client';

import Link from 'next/link';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import { moneyProvenanceLabel } from '@/lib/finance/financialRecordClass';
import { formatMoneyCents, formatNum, cn } from '@/app/components/panel/utils';
import {
  formatMedianDecisionTime,
  formatPendingToLivePct,
} from '@/lib/moderation/outcomes';
import { formatHoursToDrain } from '@/lib/moderation/slaContract';

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
      tone: (data.liveDeals ?? 0) >= 3 ? 'green' : (data.liveDeals ?? 0) > 0 ? 'yellow' : 'red',
    },
    {
      label: 'Needs review',
      value: formatNum(pending),
      meaning:
        data.moderation.pendingGt24h > 0
          ? `${data.moderation.pendingGt24h} >24h · más vieja ${
              data.moderation.oldestPendingHours != null
                ? `${data.moderation.oldestPendingHours}h`
                : 'n/d'
            }`
          : pending > 0
            ? 'Pendientes en cola de moderación'
            : 'Cola limpia',
      tone: reviewTone,
    },
    {
      label: 'Outbound 7d',
      value: formatNum(data.week.outbound),
      meaning: 'Clicks reales a tienda (offer_events)',
      tone: (data.week.outbound ?? 0) > 0 ? 'green' : 'gray',
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

  const bn = data.circuitBottleneck;

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

      <div
        className={cn('mb-4 rounded-2xl border p-4', toneClass(bn.severity))}
        data-circuit-bottleneck={bn.id}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          Bottleneck · {bn.id}
        </p>
        <p className="mt-1 text-sm font-semibold text-white">{bn.problem}</p>
        <p className="mt-1 text-xs text-white/50">
          <span className="text-white/35">Impacto:</span> {bn.impact}
        </p>
        <p className="mt-1 text-xs text-white/70">
          <span className="text-white/35">Acción:</span> {bn.recommendedAction}
        </p>
        <Link
          href={bn.href}
          className="mt-2 inline-flex text-xs font-semibold text-violet-300 hover:text-violet-200"
        >
          Ir al cuello de botella →
        </Link>
      </div>

      <div
        className={cn(
          'mb-4 rounded-2xl border p-4',
          toneClass(
            data.supply.bottleneck === 'none'
              ? 'green'
              : data.supply.bottleneck === 'moderation'
                ? 'yellow'
                : 'yellow',
          ),
        )}
        data-ceo-supply
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          Supply Engine
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div>
            <p className="text-[10px] text-white/40">Discovered</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.supply.discovered)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Verified</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.supply.verified)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Approval ready</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.supply.approvalReady)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Sticky observed</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.supply.stickyObserved)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Fresh discovered</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.supply.freshDiscovered)}
            </p>
            <p className="text-[9px] text-white/30">excl. sticky_*</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-white/55">
          Sticky {formatNum(data.supply.stickyObserved)} obs · API{' '}
          {formatNum(data.supply.stickyApiSuccess ?? data.supply.stickyPdpSuccess ?? null)} · rich{' '}
          {formatNum(data.supply.stickyEvidenceRich ?? null)} · hist{' '}
          {formatNum(data.supply.stickyHistoryReady ?? null)} · drop{' '}
          {formatNum(data.supply.stickyPriceDrop ?? null)} · low{' '}
          {formatNum(data.supply.stickyHistoricalLow ?? null)} ·{' '}
          {formatNum(data.supply.stickyVerified)} ver ·{' '}
          {formatNum(data.supply.stickyApprovalReady)} ready
          {' · '}
          Fresh {formatNum(data.supply.freshDiscovered)} disc ·{' '}
          {formatNum(data.supply.freshVerified)} ver ·{' '}
          {formatNum(data.supply.freshApprovalReady)} ready
        </p>
        {(data.supply.stickyByNiche?.length ?? 0) > 0 ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[10px] text-white/70">
              <thead className="text-white/40">
                <tr>
                  <th className="py-1 pr-2 font-medium">NICHE</th>
                  <th className="py-1 pr-2 font-medium">SELECTED</th>
                  <th className="py-1 pr-2 font-medium">VERIFIED</th>
                  <th className="py-1 pr-2 font-medium">HISTORY READY</th>
                  <th className="py-1 pr-2 font-medium">PRICE DROP</th>
                  <th className="py-1 pr-2 font-medium">HISTORICAL LOW</th>
                  <th className="py-1 font-medium">APPROVAL READY</th>
                </tr>
              </thead>
              <tbody>
                {data.supply.stickyByNiche.map((row) => (
                  <tr key={row.nicheId} className="border-t border-white/10">
                    <td className="py-1 pr-2 text-white/80">{row.nicheId}</td>
                    <td className="py-1 pr-2 tabular-nums">{row.selected}</td>
                    <td className="py-1 pr-2 tabular-nums">{row.verified}</td>
                    <td className="py-1 pr-2 tabular-nums">{row.historyReady}</td>
                    <td className="py-1 pr-2 tabular-nums">{row.priceDrop}</td>
                    <td className="py-1 pr-2 tabular-nums">{row.historicalLow}</td>
                    <td className="py-1 tabular-nums text-white">{row.approvalReady}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="mt-1 text-xs text-white/70">
          <span className="text-white/35">Bottleneck:</span> {data.supply.bottleneck}
          {' · '}
          <span className="text-white/35">Action:</span> {data.supply.action}
        </p>
        {data.supply.priceMemory ? (
          <p className="mt-1 text-[10px] text-white/45">
            PM niche coverage {formatNum(data.supply.priceMemory.nicheCoverageRatePct)}% · with=
            {formatNum(data.supply.priceMemory.snapshotsWithNiche)} · without=
            {formatNum(data.supply.priceMemory.snapshotsWithoutNiche)}
            {data.supply.priceMemory.stickyPoolEligibleByNiche
              ? ` · pool b=${formatNum(data.supply.priceMemory.stickyPoolEligibleByNiche.beauty)} e=${formatNum(data.supply.priceMemory.stickyPoolEligibleByNiche.electronics)} d=${formatNum(data.supply.priceMemory.stickyPoolEligibleByNiche.day_to_day)}`
              : ''}
          </p>
        ) : null}
        <p className="mt-1 text-[10px] text-white/35">
          mode={data.supply.mode} · WRITE={data.supply.writeEnabled ? '1' : '0'}
          {data.supplyTruth ? (
            <>
              {' · '}Truth today={formatNum(data.supplyTruth.todayVerified)} / 24h=
              {formatNum(data.supplyTruth.h24Verified)} / 7d=
              {formatNum(data.supplyTruth.d7Verified)} ({data.supplyTruth.globalStatus ?? 'n/d'})
            </>
          ) : null}
        </p>
      </div>

      <div
        className={cn(
          'mb-4 rounded-2xl border p-4',
          toneClass(
            data.attribution?.status === 'healthy'
              ? 'green'
              : data.attribution?.status === 'degraded'
                ? 'yellow'
                : data.attribution?.status === 'blocked'
                  ? 'red'
                  : 'gray',
          ),
        )}
        data-ceo-attribution
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          Attribution Truth (24h)
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <p className="text-[10px] text-white/40">Persisted clicks</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.attribution?.attributedClicks ?? null)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Unique click IDs</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.attribution?.uniqueClickIds ?? null)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Completeness</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {data.attribution?.completenessPct != null
                ? `${data.attribution.completenessPct}%`
                : 'NO_DATA'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Attribution gap</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.attribution?.attributionGap ?? null)}
            </p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <p className="text-[10px] text-white/40">Volume outbound</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.attribution?.outboundVolume ?? null)}
            </p>
            <p className="text-[9px] text-white/35">offer_events ≠ clicks</p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Complete / total</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.attribution?.attributionComplete ?? null)}
              {' / '}
              {formatNum(data.attribution?.attributedClicks ?? null)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Conversion</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {data.attribution?.conversion?.label ?? 'not connected'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Commission / Revenue</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {data.attribution?.commission?.label ?? 'not connected'}
            </p>
          </div>
        </div>
        {(data.attribution?.byChannel?.length ?? 0) > 0 ? (
          <p className="mt-2 text-[10px] text-white/50">
            Top channels:{' '}
            {data.attribution!.byChannel
              .slice(0, 4)
              .map((c) => `${c.channel}=${c.clicks}`)
              .join(' · ')}
          </p>
        ) : null}
        {(data.attribution?.byCampaign?.length ?? 0) > 0 ? (
          <p className="mt-1 text-[10px] text-white/50">
            Top campaigns:{' '}
            {data.attribution!.byCampaign
              .slice(0, 3)
              .map((c) => `${c.campaignKey}=${c.clicks}`)
              .join(' · ')}
          </p>
        ) : null}
        <p className="mt-2 text-[10px] text-white/45">
          {data.attribution?.note ?? 'Attribution snapshot unavailable'} · SoT=
          {data.attribution?.attributionSot ?? 'reward_outbound_clicks'}
        </p>
      </div>

      <div
        className={cn(
          'mb-4 rounded-2xl border p-4',
          toneClass(
            data.systemHealth?.overall === 'healthy'
              ? 'green'
              : data.systemHealth?.overall === 'degraded'
                ? 'yellow'
                : data.systemHealth?.overall === 'blocked'
                  ? 'red'
                  : 'gray',
          ),
        )}
        data-ceo-system-health
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          System Health
        </p>
        <p className="mt-1 text-sm font-semibold text-white">
          {data.systemHealth?.overall?.toUpperCase() ?? 'UNKNOWN'}
          <span className="ml-2 text-[10px] font-normal text-white/40">
            money={data.systemHealth?.moneyPathFrozen ? 'FROZEN' : 'OPEN'} · WRITE=
            {data.systemHealth?.supplyWriteEnabled ? '1' : '0'}
          </span>
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {(data.systemHealth?.components ?? []).map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/60"
              title={c.detail}
            >
              {c.id}:{c.status}
            </li>
          ))}
        </ul>
      </div>

      <div
        className={cn(
          'mb-4 rounded-2xl border p-4',
          toneClass(reviewTone === 'green' ? 'green' : reviewTone),
        )}
        data-ceo-moderation
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          Moderation
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          <div>
            <p className="text-[10px] text-white/40">Pending</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.moderation.pending)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">SLA breach</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.moderation.slaBreachEstimate)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">High value</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.moderation.highValueEstimate)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Claimed</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.moderation.claimedActive)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Throughput</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {data.moderation.throughputLastHour != null
                ? `${data.moderation.throughputLastHour}/h`
                : 'NO_DATA'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">ETA drain</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatHoursToDrain(data.moderation.hoursToDrain)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Live</p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {formatNum(data.liveDeals)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Target</p>
            <p className="text-sm font-semibold tabular-nums text-white">5–10</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-white/70">
          <span className="text-white/35">Recomendación:</span> {bn.recommendedAction}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
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
