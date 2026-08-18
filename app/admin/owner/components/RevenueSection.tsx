'use client';

import { useState } from 'react';
import Link from 'next/link';
import GlassCard from '@/app/components/panel/GlassCard';
import SectionHeader from '@/app/components/panel/SectionHeader';
import Sparkline from '@/app/components/panel/Sparkline';
import { formatMoneyCents, formatNum } from '@/app/components/panel/utils';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import { cn } from '@/app/components/panel/utils';

type Period = '7d' | '30d' | '90d' | '12m';

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días',
  '12m': '12 meses',
};

export default function RevenueSection({ data }: { data: OwnerDashboardPayload }) {
  const [period, setPeriod] = useState<Period>('30d');

  const rows = {
    '7d': data.economy.week,
    '30d': data.economy.month,
    '90d': data.economy.month,
    '12m': data.economy.month,
  }[period];

  const chartPoints = [
    data.economy.day.estimatedCents ?? data.economy.day.realCents ?? 0,
    data.economy.week.estimatedCents ?? data.economy.week.realCents ?? 0,
    data.economy.month.estimatedCents ?? data.economy.month.realCents ?? 0,
  ].filter((v) => v > 0);

  const aventaShare = data.economy.month.realCents;
  const estimated = data.economy.month.estimatedCents;
  const pending = data.economy.ledgerAvailable ? null : data.economy.month.estimatedCents;

  return (
    <GlassCard variant="dark" padding="lg" className="mb-6">
      <SectionHeader
        title="Revenue"
        subtitle="Economía del negocio · ledger real vs estimado por clics"
        variant="dark"
        action={
          <Link href="/admin/commissions" className="text-xs text-violet-400 hover:text-violet-300 font-medium">
            Ver comisiones →
          </Link>
        }
      />

      <div className="mt-4 flex flex-wrap gap-1.5">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              'rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all duration-200',
              period === p
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'text-white/40 hover:text-white/60 border border-transparent'
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="mt-5 grid md:grid-cols-2 gap-6">
        <div>
          <p className="text-3xl font-semibold tabular-nums text-white tracking-tight">
            {formatMoneyCents(rows.estimatedCents ?? rows.realCents)}
          </p>
          <p className="mt-1 text-xs text-white/40">{PERIOD_LABELS[period]} · confianza {data.economy.confidence}</p>
          {chartPoints.length >= 2 ? (
            <div className="mt-4">
              <Sparkline data={chartPoints} variant="dark" width={200} height={48} />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <p className="text-[10px] uppercase tracking-wide text-white/35">Aventa (real)</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">
              {formatMoneyCents(aventaShare)}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <p className="text-[10px] uppercase tracking-wide text-white/35">Estimado</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">{formatMoneyCents(estimated)}</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <p className="text-[10px] uppercase tracking-wide text-white/35">Clics</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">{formatNum(rows.outbound)}</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <p className="text-[10px] uppercase tracking-wide text-white/35">Pendiente ledger</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">
              {pending != null ? formatMoneyCents(pending) : data.economy.ledgerAvailable ? 'Al día' : 'Sin registrar'}
            </p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
