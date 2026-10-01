'use client';

import Link from 'next/link';
import { REPUTATION_LEVELS, getReputationLabel, getReputationProgress } from '@/lib/reputation';

type HunterProgressProps = {
  level: number;
  score: number;
};

/** Progresión de identidad. No lee recompensas ni saldos. */
export default function HunterProgress({ level, score }: HunterProgressProps) {
  const label = getReputationLabel(level);
  const next = REPUTATION_LEVELS.find((item) => item.level === level + 1);
  const band = REPUTATION_LEVELS.find((item) => item.level === level);
  const pct = Math.round(getReputationProgress(score, level) * 100);
  const progressLine =
    band && band.maxScore !== Infinity ? `${score} / ${band.maxScore + 1} puntos` : `${score} puntos`;

  return (
    <section aria-label="Nivel base de Aventa" className="h-full rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Nivel Aventa</h2>
        <Link href="/me/nivel" className="rounded-md text-[13px] text-violet-600 transition-colors duration-150 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400">
          Ver niveles
        </Link>
      </div>
      <p className="mt-1 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">No es el programa de recompensas.</p>
      <div className="mt-4 flex items-center gap-4">
        <div
          className="flex h-16 w-14 shrink-0 items-center justify-center bg-violet-600 text-xl font-semibold text-white"
          style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
          aria-hidden
        >
          {level}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-none text-[#1d1d1f] dark:text-[#fafafa]">{label}</p>
          <p className="mt-2 text-[13px] tabular-nums leading-none text-[#6e6e73] dark:text-[#a3a3a3]">{progressLine}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de nivel ${pct}%`}>
            <div className="h-full rounded-full bg-violet-600" style={{ width: `${pct}%` }} />
          </div>
          {next ? (
            <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Siguiente nivel: {next.label}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
