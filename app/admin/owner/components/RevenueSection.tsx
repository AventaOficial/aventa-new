'use client';

import Link from 'next/link';
import GlassCard from '@/app/components/panel/GlassCard';
import SectionHeader from '@/app/components/panel/SectionHeader';
import { formatMoneyCents, formatNum } from '@/app/components/panel/utils';
import { moneyProvenanceLabel } from '@/lib/finance/financialRecordClass';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';

export default function RevenueSection({ data }: { data: OwnerDashboardPayload }) {
  const confirmed = data.economy.month.realCents ?? 0;
  const estimated = data.economy.month.estimatedCents;
  const outbound = data.economy.month.outbound;

  return (
    <GlassCard variant="dark" padding="lg" className="mb-6">
      <SectionHeader
        title="Money truth"
        subtitle="Confirmed production ≠ estimated opportunity"
        variant="dark"
        action={
          <Link href="/admin/commissions" className="text-xs font-medium text-violet-400 hover:text-violet-300">
            Ledger →
          </Link>
        }
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/70">
            Revenue confirmed
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-white">
            {formatMoneyCents(confirmed)}
          </p>
          <p className="mt-2 text-xs text-white/50">
            {confirmed > 0
              ? 'Comisiones productivas del mes (QA excluido).'
              : 'No confirmed production sales yet.'}
          </p>
          <p className="mt-2 text-[10px] text-white/30">
            {moneyProvenanceLabel(data.economy.confirmedProvenance)}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/70">
            Estimated opportunity
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-white">
            {estimated != null ? formatMoneyCents(estimated) : 'NO_DATA'}
          </p>
          <p className="mt-2 text-xs text-white/50">
            {estimated != null
              ? `Clics (${formatNum(outbound)}) × EPC productivo · ${data.economy.epcWindowLabel}`
              : 'EPC = NO_DATA. No se inventa estimación con datos QA.'}
          </p>
          <p className="mt-2 text-[10px] text-white/30">
            {moneyProvenanceLabel(data.economy.estimatedProvenance)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-wide text-white/35">EPC</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-white">
            {data.economy.epcStatus === 'READY' && data.economy.epcCents != null
              ? formatMoneyCents(data.economy.epcCents)
              : 'NO_DATA'}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
          <p className="text-[10px] uppercase tracking-wide text-white/35">Confianza</p>
          <p className="mt-1 text-lg font-semibold text-white capitalize">{data.economy.confidence}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 col-span-2 md:col-span-1">
          <p className="text-[10px] uppercase tracking-wide text-white/35">QA excluidas</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-white">
            {data.economy.syntheticLedgerRowsExcluded}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-white/40">{data.economy.confidenceReason}</p>
    </GlassCard>
  );
}
