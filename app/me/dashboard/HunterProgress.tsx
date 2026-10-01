'use client';

import Link from 'next/link';
import ReputationBar from '@/app/components/ReputationBar';

type HunterProgressProps = {
  level: number;
  score: number;
};

/** Progresión de identidad. No lee recompensas ni saldos. */
export default function HunterProgress({ level, score }: HunterProgressProps) {
  return (
    <section aria-label="Nivel base de Aventa" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tu nivel</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-500">Reputación en la comunidad. No es el programa de recompensas.</p>
        </div>
        <Link href="/me/nivel" className="rounded-md text-xs font-medium text-violet-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400">
          Ver mi nivel
        </Link>
      </div>
      <ReputationBar variant="hunter" level={level} score={score} />
    </section>
  );
}
