'use client';

import KpiCard from '@/app/components/panel/KpiCard';
import { formatMoneyCents, formatNum } from '@/app/components/panel/utils';
import { formatDiff } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import { listConfiguredMarkets } from '@/lib/markets';

export default function OwnerKpiStrip({ data }: { data: OwnerDashboardPayload }) {
  const revenue = data.economy.ledgerAvailable
    ? data.economy.month.realCents
    : data.economy.month.estimatedCents;

  const revenueDiff = data.economy.week.estimatedCents != null && data.economy.day.estimatedCents != null
    ? formatDiff(data.economy.week.estimatedCents, data.economy.day.estimatedCents * 7)
    : null;

  const clicksDiff = formatDiff(data.week.outbound, data.today.outbound != null ? data.today.outbound * 7 : null);
  const usersDiff = formatDiff(data.week.newUsers, data.today.newUsers != null ? data.today.newUsers * 7 : null);

  const approvedEstimate =
    data.week.offersApproved != null
      ? data.week.offersApproved
      : data.today.offersApproved;

  const markets = listConfiguredMarkets();
  const activeMarkets = markets.length;
  const targetMarkets = 50;

  const sparkClicks = [data.today.outbound, data.yesterday.outbound, data.week.outbound]
    .filter((v): v is number => v != null)
    .slice(0, 3);

  return (
    <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
      <KpiCard
        label="Revenue"
        value={formatMoneyCents(revenue)}
        delta={revenueDiff?.delta}
        deltaLabel={revenueDiff?.label ?? undefined}
        variant="dark"
      />
      <KpiCard
        label="Affiliate Clicks"
        value={formatNum(data.week.outbound)}
        delta={clicksDiff.delta}
        deltaLabel={clicksDiff.label ?? undefined}
        sparkline={sparkClicks.length >= 2 ? sparkClicks : undefined}
        variant="dark"
      />
      <KpiCard
        label="Active Users"
        value={formatNum(data.today.activeUsers ?? data.week.activeUsers)}
        delta={usersDiff.delta}
        deltaLabel={usersDiff.label ?? undefined}
        variant="dark"
      />
      <KpiCard
        label="Published Offers"
        value={formatNum(approvedEstimate)}
        deltaLabel="7 días"
        variant="dark"
      />
      <KpiCard
        label="Active Markets"
        value={`${activeMarkets} / ${targetMarkets}`}
        deltaLabel={activeMarkets > 1 ? `+${activeMarkets - 1}` : 'MX live'}
        variant="dark"
        className="hidden xl:block"
      />
    </section>
  );
}
