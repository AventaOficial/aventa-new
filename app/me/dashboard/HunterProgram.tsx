'use client';

import Link from 'next/link';
import RewardsProgramPanel from '@/app/me/RewardsProgramPanel';

/** El panel conserva su copy. Esta capa solo lo sitúa en el dashboard. */
export default function HunterProgram() {
  return (
    <section aria-label="Programa de recompensas" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-zinc-500">Requisitos y elegibilidad. Independiente de tu nivel.</p>
        <Link href="/me/programa" className="shrink-0 rounded-md text-xs font-medium text-violet-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400">
          Ver el programa
        </Link>
      </div>
      <RewardsProgramPanel />
    </section>
  );
}
