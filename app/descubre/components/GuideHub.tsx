'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Gift, Sparkles, Trophy } from 'lucide-react';
import { GUIDES, type GuideFilter, type GuideId, type GuideTheme } from '../guides/content';
import {
  completedGuideCount,
  stepsSeen,
  totalGuideSteps,
  type GuideProgressMap,
} from '@/lib/guides/guideProgress';

const EASE = [0.22, 1, 0.36, 1] as const;

const THEME: Record<
  GuideTheme,
  { icon: string; chip: string; bar: string; arrow: string }
> = {
  violet: {
    icon: 'bg-violet-600',
    chip: 'text-violet-600 dark:text-violet-400',
    bar: 'bg-violet-600',
    arrow: 'bg-violet-600 hover:bg-violet-700',
  },
  orange: {
    icon: 'bg-orange-500',
    chip: 'text-orange-600 dark:text-orange-400',
    bar: 'bg-orange-500',
    arrow: 'bg-orange-500 hover:bg-orange-600',
  },
  teal: {
    icon: 'bg-teal-600',
    chip: 'text-teal-600 dark:text-teal-400',
    bar: 'bg-teal-600',
    arrow: 'bg-teal-600 hover:bg-teal-700',
  },
};

const FILTERS: Array<{ id: GuideFilter; label: string; icon: typeof Sparkles }> = [
  { id: 'interactive', label: 'Interactivas', icon: Sparkles },
  { id: 'steps', label: 'Paso a paso', icon: Check },
  { id: 'rewards', label: 'Con recompensas', icon: Gift },
];

type Props = {
  onSelect: (id: GuideId) => void;
  progress: GuideProgressMap;
};

export default function GuideHub({ onSelect, progress }: Props) {
  const [filter, setFilter] = useState<GuideFilter | null>(null);
  const visible = useMemo(
    () => (filter ? GUIDES.filter((g) => g.filters.includes(filter)) : GUIDES),
    [filter],
  );
  const totalSteps = totalGuideSteps();
  const seenSteps = GUIDES.reduce((sum, g) => sum + stepsSeen(g.id, g.steps.length, progress), 0);
  const pct = totalSteps > 0 ? Math.round((seenSteps / totalSteps) * 100) : 0;
  const doneGuides = completedGuideCount(progress);

  return (
    <div className="mx-auto max-w-lg md:max-w-2xl">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="mb-5"
      >
        <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#fafafa] md:text-[1.75rem]">
          Guías AVENTA
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3] md:text-[15px]">
          Elige un camino y avanza a tu ritmo. Cada guía es interactiva, con pasos claros.
        </p>
      </motion.header>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map(({ id, label, icon: Icon }) => {
          const active = filter === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(active ? null : id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? 'bg-[#1d1d1f] dark:bg-[#fafafa] text-white dark:text-[#1d1d1f]'
                  : 'bg-[#e8e8ed] dark:bg-[#2c2c2e] text-[#6e6e73] dark:text-[#a3a3a3]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      {seenSteps > 0 ? (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[#e8e8ed] dark:border-[#2a2a2a] bg-white dark:bg-[#141414] px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600/10 text-violet-600 dark:text-violet-400">
            <Trophy className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Tu progreso general</p>
            <p className="text-xs text-[#6e6e73] dark:text-[#a3a3a3]">
              {pct}% · {seenSteps} de {totalSteps} pasos
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e8e8ed] dark:bg-[#2c2c2e]">
              <div className="h-full rounded-full bg-violet-600" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4">
        {visible.map((guide, i) => {
          const Icon = guide.icon;
          const theme = THEME[guide.theme];
          const seen = stepsSeen(guide.id, guide.steps.length, progress);
          const ratio = guide.steps.length > 0 ? seen / guide.steps.length : 0;
          return (
            <motion.button
              key={guide.id}
              type="button"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4, ease: EASE }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelect(guide.id)}
              className="w-full overflow-hidden rounded-3xl border border-[#e8e8ed] dark:border-[#2a2a2a] bg-white dark:bg-[#141414] p-5 text-left shadow-sm md:p-6"
            >
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className={`text-[11px] font-semibold uppercase tracking-wide ${theme.chip}`}>
                    {guide.title}
                  </p>
                  <h2 className="mt-1 text-lg font-bold uppercase leading-snug tracking-tight text-[#1d1d1f] dark:text-[#fafafa] md:text-xl">
                    {guide.tagline}
                  </h2>
                  <p className="mt-2 text-sm leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">
                    {guide.description}
                  </p>
                </div>
                <div
                  className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${theme.icon} shadow-lg`}
                >
                  <Icon className="h-8 w-8 text-white" strokeWidth={1.75} />
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[#6e6e73] dark:text-[#a3a3a3]">
                    {guide.steps.length} pasos interactivos
                    {seen > 0 ? ` · ${seen}/${guide.steps.length}` : ''}
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e8e8ed] dark:bg-[#2c2c2e]">
                    <div
                      className={`h-full rounded-full ${theme.bar}`}
                      style={{ width: `${Math.max(ratio * 100, seen > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                </div>
                <span
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${theme.arrow}`}
                  aria-hidden
                >
                  <ArrowRight className="h-5 w-5" />
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-2xl bg-violet-600 px-4 py-4 text-white">
        <Trophy className="h-6 w-6 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Completa guías y gana claridad</p>
          <p className="text-xs text-violet-100">
            {doneGuides} de {GUIDES.length} guías terminadas
          </p>
        </div>
      </div>
    </div>
  );
}
