'use client';

import Link from 'next/link';
import ReputationBar from '@/app/components/ReputationBar';
import { REPUTATION_LEVELS } from '@/lib/reputation';

type HunterProgressProps = {
  level: number;
  score: number;
};

function pointsUntilNextLevel(level: number, score: number): number | null {
  const band = REPUTATION_LEVELS.find((item) => item.level === level);
  if (!band || band.maxScore === Infinity) return null;
  const remaining = band.maxScore + 1 - score;
  return remaining > 0 ? remaining : null;
}

/** Progresión de identidad. No lee recompensas ni saldos. */
export default function HunterProgress({ level, score }: HunterProgressProps) {
  const remaining = pointsUntilNextLevel(level, score);

  return (
    <section aria-label="Nivel base de Aventa" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Tu nivel</h2>
          <p className="mt-1 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">No es el programa de recompensas.</p>
        </div>
        <Link
          href="/me/nivel"
          className="rounded-md text-[13px] text-[#6e6e73] transition-colors duration-150 hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1f] dark:text-[#a3a3a3] dark:hover:text-[#fafafa] dark:focus-visible:ring-[#fafafa]"
        >
          Ver mi nivel
        </Link>
      </div>
      <ReputationBar variant="hunter" level={level} score={score} />
      {remaining != null ? (
        <p className="text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
          Faltan {remaining} puntos para el siguiente nivel.
        </p>
      ) : null}
    </section>
  );
}
