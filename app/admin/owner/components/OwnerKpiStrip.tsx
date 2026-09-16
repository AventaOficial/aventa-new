'use client';

import KpiCard from '@/app/components/panel/KpiCard';
import { formatMoneyCents, formatNum } from '@/app/components/panel/utils';
import { formatDiff } from '@/lib/owner/formatDiff';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import { listConfiguredMarkets } from '@/lib/markets';

/** KPI strip secundario — nunca mezcla estimated como Revenue. */
export default function OwnerKpiStrip({ data }: { data: OwnerDashboardPayload }) {
  const confirmed = data.economy.month.realCents ?? 0;

  const clicksDiff = formatDiff(
    data.week.outbound,
    data.today.outbound != null ? data.today.outbound * 7 : null,
  );
  const usersDiff = formatDiff(
    data.week.newUsers,
    data.today.newUsers != null ? data.today.newUsers * 7 : null,
  );

  const approvedEstimate =
    data.week.offersApproved != null ? data.week.offersApproved : data.today.offersApproved;

  const markets = listConfiguredMarkets();
  const activeMarkets = markets.length;
  const targetMarkets = 50;

  const sparkClicks = [data.today.outbound, data.yesterday.outbound, data.week.outbound]
    .filter((v): v is number => v != null)
    .slice(0, 3);

  return (
    <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <KpiCard
        label="Revenue confirmed"
        value={formatMoneyCents(confirmed)}
        deltaLabel="production · QA excluded"
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
