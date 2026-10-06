'use client';

import Link from 'next/link';
import { formatRewardShare } from '@/lib/me/rewardStatusCopy';
import type { MyRewardsState, MyRewardRow, RewardGoal } from '@/app/me/dashboard/useMyRewards';

type RewardDetail = MyRewardRow & {
  shareCents?: number | null;
  currency?: string | null;
  offer?: { title?: string | null } | null;
};

const quietLink =
  'rounded-md text-[13px] text-[#6e6e73] transition-colors duration-150 hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1f] dark:text-[#a3a3a3] dark:hover:text-[#fafafa] dark:focus-visible:ring-[#fafafa]';

function Meter({ label, current, required }: { label: string; current: number; required: number }) {
  const percent = required > 0 ? Math.min(100, Math.round((current / required) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">{label}</p>
        <p className="text-[13px] font-medium tabular-nums text-[#1d1d1f] dark:text-[#fafafa]">{current} / {required}</p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-violet-600" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function MobileRewardBody({ state, goal, pending }: { state: MyRewardsState; goal: RewardGoal | null; pending: boolean }) {
  const rows = state.kind === 'ready'
    ? (state.rows.filter((row) => !row.isSynthetic) as RewardDetail[])
    : [];
  const next = rows.find((row) => row.uiStatus === 'validating' || row.uiStatus === 'available') ?? rows[0] ?? null;
  const amount = next ? formatRewardShare(next.shareCents ?? null, next.currency ?? null) : null;
  const hasGoal = Boolean(goal && goal.requiredOffers > 0);

  if (state.kind === 'error') {
    return <p className="text-[15px] text-[#6e6e73] dark:text-[#a3a3a3] sm:hidden">No pudimos mostrar tus recompensas en este momento.</p>;
  }

  if ((state.kind === 'loading' || pending) && !goal && !next) {
    return <div className="h-5 w-40 animate-pulse rounded-full bg-black/5 dark:bg-white/10 sm:hidden" aria-hidden />;
  }

  if (!next && !hasGoal) {
    return (
      <p className="text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3] sm:hidden">
        Tu próxima recompensa aparecerá aquí cuando cumplas los requisitos.
      </p>
    );
  }

  return (
    <div className="space-y-3 sm:hidden">
      {next ? (
        <div>
          <p className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">Próxima recompensa</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-[#1d1d1f] dark:text-[#fafafa]">
            {next.offer?.title?.trim() || next.statusLabel}
          </p>
          {amount ? <p className="mt-1 text-[14px] tabular-nums text-[#1d1d1f] dark:text-[#fafafa]">{amount}</p> : null}
          <p className="mt-1 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">{next.statusLabel}</p>
        </div>
      ) : goal ? (
        <div>
          <p className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">Próxima recompensa</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-[#1d1d1f] dark:text-[#fafafa]">{goal.programName}</p>
        </div>
      ) : null}
      {goal && goal.requiredOffers > 0 ? <Meter label="Ofertas aprobadas" current={goal.approvedOffers} required={goal.requiredOffers} /> : null}
      {goal && goal.requiredVotes > 0 ? <Meter label="Votos positivos" current={goal.positiveVotes} required={goal.requiredVotes} /> : null}
    </div>
  );
}

export default function HunterRewardSummary({
  state,
  goal = null,
  goalPending = false,
}: {
  state: MyRewardsState;
  goal?: RewardGoal | null;
  goalPending?: boolean;
}) {
  const rows = state.kind === 'ready' ? state.rows.filter((row) => !row.isSynthetic) : [];
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.statusLabel || 'En validación';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts);

  return (
    <section aria-label="Recompensas" className="space-y-3 rounded-2xl border border-black/[0.04] bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#141414] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Recompensas Aventa</h2>
          <p className="mt-0.5 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Rewards no está activo en todas las cuentas.</p>
        </div>
        <Link href="/me/recompensas" className={`${quietLink} inline-flex min-h-11 shrink-0 items-center text-violet-600 dark:text-violet-400 sm:inline sm:min-h-0`}>
          Ver recompensas
        </Link>
      </div>

      <MobileRewardBody state={state} goal={goal} pending={goalPending} />

      {state.kind === 'loading' ? (
        <div className="hidden h-5 w-40 animate-pulse rounded-full bg-black/5 dark:bg-white/10 sm:block" aria-hidden />
      ) : null}
      {state.kind === 'error' ? (
        <p className="hidden text-[15px] text-[#6e6e73] dark:text-[#a3a3a3] sm:block">No pudimos mostrar tus recompensas en este momento.</p>
      ) : null}
      {state.kind === 'ready' && rows.length === 0 ? (
        <p className="hidden text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3] sm:block">
          Tu próxima recompensa aparecerá aquí cuando cumplas los requisitos. Todavía no hay recompensas.
        </p>
      ) : null}
      {state.kind === 'ready' && rows.length > 0 ? (
        <ul className="hidden flex-wrap gap-5 sm:flex">
          {summary.map(([label, count]) => (
            <li key={label}>
              <p className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">{label}</p>
              <p className="mt-1 text-[20px] font-semibold tabular-nums leading-none text-[#1d1d1f] dark:text-[#fafafa]">{count}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
