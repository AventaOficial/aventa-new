'use client';

import Link from 'next/link';
import { ArrowRight, Crown } from 'lucide-react';
import { REPUTATION_LEVELS, getReputationLabel } from '@/lib/reputation';

type HunterProgressProps = {
  level: number;
  score: number;
};

/** Progresión de identidad. No lee recompensas ni saldos. */
export default function HunterProgress({ level, score }: HunterProgressProps) {
  const label = getReputationLabel(level);
  const next = REPUTATION_LEVELS.find((item) => item.level === level + 1);
  const pct = next ? Math.min(100, Math.floor((score / next.minScore) * 100)) : 100;
  const remaining = next ? Math.max(0, next.minScore - score) : 0;

  return (
    <section aria-label="Nivel base de Aventa" className="h-full rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-4 text-[var(--me-ink)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Nivel Aventa</h2>
        <Link href="/me/nivel" className="inline-flex items-center gap-1 text-[13px] text-violet-600 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
          Ver todos
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <p className="mt-1 text-[12px] text-[var(--me-muted)]">No es el programa de recompensas.</p>
      <div className="mt-4 flex items-center gap-3">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center bg-linear-to-br from-violet-400 to-fuchsia-600 text-white shadow-[0_0_18px_rgba(168,85,247,0.45)]"
          style={{ clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}
          aria-hidden
        >
          <Crown className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold leading-none">Nivel {level} · {label}</p>
          <p className="mt-2 text-[13px] tabular-nums text-[var(--me-muted)]">
            {score} puntos{next ? ` · ${next.minScore} para el siguiente` : ''}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--me-chip)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de nivel ${pct}%`}>
              <div className="h-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[12px] tabular-nums text-[var(--me-muted)]">{pct}%</span>
          </div>
        </div>
      </div>
      {next ? (
        <p className="mt-3 flex items-start gap-2 text-[13px] text-[var(--me-muted)]">
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden />
          <span>
            <span className="block text-[var(--me-ink)]">Siguiente: {next.label}</span>
            <span className="block text-[12px] text-[var(--me-muted)]">Te faltan {remaining} puntos.</span>
          </span>
        </p>
      ) : (
        <p className="mt-3 text-[13px] text-[var(--me-muted)]">Este es el nivel más alto de Aventa.</p>
      )}
    </section>
  );
}
