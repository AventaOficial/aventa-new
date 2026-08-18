'use client';

import GlassCard from '@/app/components/panel/GlassCard';
import SectionHeader from '@/app/components/panel/SectionHeader';
import StatusBadge from '@/app/components/panel/StatusBadge';
import { formatMoneyCents, formatNum } from '@/app/components/panel/utils';
import { listConfiguredMarkets } from '@/lib/markets';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import { computeOwnerHealth } from '@/lib/owner/computeOwnerHealth';

export default function TopMarketsSection({ data }: { data: OwnerDashboardPayload }) {
  const markets = listConfiguredMarkets();
  const { overall } = computeOwnerHealth(data);

  if (markets.length <= 1) {
    const m = markets[0];
    return (
      <GlassCard variant="dark" padding="lg" className="h-full">
        <SectionHeader title="Top Markets" variant="dark" />
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{m?.nameEs ?? 'México'}</p>
              <p className="text-xs text-white/40 mt-0.5">Mercado activo principal</p>
            </div>
            <StatusBadge tone={overall >= 85 ? 'ok' : overall >= 65 ? 'attention' : 'critical'}>
              {overall}% health
            </StatusBadge>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-white/35 uppercase">Revenue</p>
              <p className="text-xs font-semibold text-white mt-0.5 tabular-nums">
                {formatMoneyCents(data.economy.month.estimatedCents ?? data.economy.month.realCents)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-white/35 uppercase">Clicks</p>
              <p className="text-xs font-semibold text-white mt-0.5 tabular-nums">{formatNum(data.week.outbound)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/35 uppercase">Growth</p>
              <p className="text-xs font-semibold text-white mt-0.5 tabular-nums">
                {data.growth.weeklyPct != null ? `${data.growth.weeklyPct >= 0 ? '+' : ''}${data.growth.weeklyPct}%` : '—'}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-white/35">
          1 mercado activo · preparado para escalar a 50+
        </p>
      </GlassCard>
    );
  }

  const healthy = markets.filter(() => overall >= 85).length;
  const attention = markets.filter(() => overall >= 65 && overall < 85).length;
  const critical = markets.length - healthy - attention;

  return (
    <GlassCard variant="dark" padding="lg" className="h-full">
      <SectionHeader title="Top Markets" variant="dark" />
      <p className="mt-3 text-2xl font-semibold text-white">{markets.length} ACTIVE MARKETS</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/50">
        <span>{healthy} healthy</span>
        <span>·</span>
        <span>{attention} attention</span>
        <span>·</span>
        <span>{critical} critical</span>
      </div>
      <div className="mt-4 space-y-2">
        {markets.slice(0, 5).map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
            <span className="text-sm text-white/70">{m.nameEs}</span>
            <StatusBadge tone="ok">{m.currency}</StatusBadge>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
