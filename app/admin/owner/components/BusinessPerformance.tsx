'use client';

import Link from 'next/link';
import GlassCard from '@/app/components/panel/GlassCard';
import SectionHeader from '@/app/components/panel/SectionHeader';
import { formatNum } from '@/app/components/panel/utils';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';

export default function BusinessPerformance({ data }: { data: OwnerDashboardPayload }) {
  return (
    <GlassCard variant="dark" padding="lg">
      <SectionHeader
        title="Business Performance"
        subtitle="Rendimiento agregado · 7 días"
        variant="dark"
        action={
          <Link href="/admin/metrics" className="text-xs text-violet-400 hover:text-violet-300">
            Métricas →
          </Link>
        }
      />

      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { label: 'Revenue', value: data.economy.month.estimatedCents != null ? `$${Math.round(data.economy.month.estimatedCents / 100).toLocaleString('es-MX')}` : '—' },
          { label: 'Clicks', value: formatNum(data.week.outbound) },
          { label: 'CTR', value: data.week.ctr != null ? `${data.week.ctr}%` : '—' },
          { label: 'Offers', value: formatNum(data.week.offersApproved) },
          { label: 'Users', value: formatNum(data.week.newUsers) },
        ].map((m) => (
          <div key={m.label} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-white/35">{m.label}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-white">{m.value}</p>
          </div>
        ))}
      </div>

      {data.week.topCategories.length > 0 ? (
        <div className="mt-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/35 mb-2">Por categoría</p>
          <div className="space-y-2">
            {data.week.topCategories.slice(0, 4).map((c) => {
              const max = data.week.topCategories[0]?.outbound ?? 1;
              const pct = Math.round((c.outbound / max) * 100);
              return (
                <div key={c.category}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60 truncate">{c.category}</span>
                    <span className="text-white/40 tabular-nums shrink-0 ml-2">{c.outbound} clics</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500/60 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {data.affiliation.outboundByStore.length > 0 ? (
        <div className="mt-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/35 mb-2">Por tienda</p>
          <div className="flex flex-wrap gap-2">
            {data.affiliation.outboundByStore.slice(0, 5).map((s) => (
              <span
                key={s.store}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-white/60"
              >
                {s.store}: {s.outbound}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}
