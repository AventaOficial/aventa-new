'use client';

import Link from 'next/link';
import { Shield, ArrowRight } from 'lucide-react';
import { getReputationProgress } from '@/lib/reputation';
import { useUI } from '@/app/providers/UIProvider';

export default function SidebarProgressCard({
  loggedIn,
  level,
  score,
}: {
  loggedIn: boolean;
  level: number;
  score: number;
}) {
  const { openRegisterModal } = useUI();
  const progress = Math.round(getReputationProgress(score, level) * 100);

  if (!loggedIn) {
    return (
      <div className="mt-auto rounded-2xl border border-violet-100 bg-white p-3 dark:border-violet-900/40 dark:bg-[#141414]">
        <p className="text-xs font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Tu progreso</p>
        <p className="mt-1 text-[11px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">
          Crea tu cuenta para ver nivel, puntos y cómo mejorar.
        </p>
        <button
          type="button"
          onClick={() => openRegisterModal('signup')}
          className="mt-2.5 text-xs font-semibold text-violet-600 dark:text-violet-400"
        >
          Crear cuenta →
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/me/estadisticas"
      className="mt-auto block rounded-2xl border border-violet-100 bg-white p-3 dark:border-violet-900/40 dark:bg-[#141414]"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-400">
          <Shield className="h-4 w-4" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">Nivel {level}</p>
      </div>
      <p className="mt-2 text-xs tabular-nums text-[#1d1d1f] dark:text-[#fafafa]">{score} puntos</p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e8e8ed] dark:bg-[#2c2c2e]">
        <div className="h-full rounded-full bg-violet-600" style={{ width: `${progress}%` }} />
      </div>
      <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
        Ver estadísticas
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </Link>
  );
}
