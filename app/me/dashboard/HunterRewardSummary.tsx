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
    <section aria-label="Recompensas" className="space-y-3 rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Recompensas Aventa</h2>
          <p className="mt-0.5 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Convierte tu actividad en recompensas reales.</p>
        </div>
        <Link href="/me/recompensas" className={`${quietLink} shrink-0 text-violet-600 dark:text-violet-400`}>
          Ver recompensas
        </Link>
      </div>

      {state.kind === 'loading' ? (
        <div className="h-5 w-40 animate-pulse rounded-full bg-black/5 dark:bg-white/10" aria-hidden />
      ) : null}
      {state.kind === 'error' ? (
        <p className="text-[15px] text-[#6e6e73] dark:text-[#a3a3a3]">No pudimos mostrar tus recompensas en este momento.</p>
      ) : null}
      {state.kind === 'ready' && rows.length === 0 ? (
        <p className="text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">
          Tu próxima recompensa aparecerá aquí cuando cumplas los requisitos. Todavía no hay recompensas.
        </p>
      ) : null}
      {state.kind === 'ready' && rows.length > 0 ? (
        <ul className="flex flex-wrap gap-5">
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
