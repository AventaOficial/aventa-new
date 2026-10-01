'use client';

import Link from 'next/link';
import type { MyRewardsState } from '@/app/me/dashboard/useMyRewards';

const quietLink =
  'rounded-md text-[13px] text-[#6e6e73] transition-colors duration-150 hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1f] dark:text-[#a3a3a3] dark:hover:text-[#fafafa] dark:focus-visible:ring-[#fafafa]';

export default function HunterRewardSummary({ state }: { state: MyRewardsState }) {
  const rows = state.kind === 'ready' ? state.rows.filter((row) => !row.isSynthetic) : [];
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.statusLabel || 'En validación';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts);

  return (
    <section aria-label="Recompensas" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Recompensas</h2>
        <Link href="/me/recompensas" className={quietLink}>
          Ver recompensas
        </Link>
      </div>

      {state.kind === 'loading' ? (
        <div className="h-5 w-40 animate-pulse rounded-full bg-black/5 dark:bg-white/10" aria-hidden />
      ) : null}
      {state.kind === 'error' ? (
        <p className="text-[15px] text-[#6e6e73] dark:text-[#a3a3a3]">No se pudo cargar el historial de recompensas.</p>
      ) : null}
      {state.kind === 'ready' && rows.length === 0 ? (
        <p className="text-[15px] text-[#6e6e73] dark:text-[#a3a3a3]">Todavía no hay recompensas.</p>
      ) : null}
      {state.kind === 'ready' && rows.length > 0 ? (
        <ul className="flex flex-wrap gap-6">
          {summary.map(([label, count]) => (
            <li key={label}>
              <p className="text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{label}</p>
              <p className="mt-1 text-[28px] font-semibold tabular-nums leading-none text-[#1d1d1f] dark:text-[#fafafa]">{count}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
