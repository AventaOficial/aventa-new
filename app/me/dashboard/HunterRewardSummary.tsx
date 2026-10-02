'use client';

import Link from 'next/link';
import type { MyRewardsState } from '@/app/me/dashboard/useMyRewards';

export default function HunterRewardSummary({ state }: { state: MyRewardsState }) {
  const rows = state.kind === 'ready' ? state.rows.filter((row) => !row.isSynthetic) : [];
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.statusLabel || 'En validación';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section aria-label="Recompensas" className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#121214]">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recompensas</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-500">El estado sale del historial, no de un intento suelto.</p>
        </div>
        <Link href="/me/recompensas" className="rounded-md text-xs font-medium text-violet-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400">
          Ver recompensas
        </Link>
      </div>

      {state.kind === 'loading' ? (
        <div className="mt-4 h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-900" aria-hidden />
      ) : null}
      {state.kind === 'error' ? (
        <p className="mt-4 text-sm text-gray-600 dark:text-zinc-300">No se pudo cargar el historial de recompensas.</p>
      ) : null}
      {state.kind === 'ready' && rows.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600 dark:text-zinc-300">Todavía no hay recompensas.</p>
      ) : null}
      {state.kind === 'ready' && rows.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {Object.entries(counts).map(([label, count]) => (
            <li key={label} className="rounded-2xl border border-gray-200 px-3 py-3 dark:border-zinc-800">
              <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{count}</p>
              <p className="text-xs text-gray-600 dark:text-zinc-400">{label}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
