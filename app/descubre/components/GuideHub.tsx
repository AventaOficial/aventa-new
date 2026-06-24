'use client';

import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { GUIDES, type GuideId } from '../guides/content';

const EASE = [0.22, 1, 0.36, 1] as const;

type Props = {
  onSelect: (id: GuideId) => void;
};

export default function GuideHub({ onSelect }: Props) {
  return (
    <div className="mx-auto max-w-3xl">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="mb-8 text-center sm:text-left"
      >
        <h1 className="text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-gray-50 md:text-[1.75rem]">
          Guías AVENTA
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-gray-600 dark:text-gray-400 md:text-[15px]">
          Elige tu camino: conoce toda la plataforma, aprende a cazar ofertas o ahorra sin complicarte.
          Cada guía es interactiva, con animaciones y pasos claros.
        </p>
      </motion.header>

      <div className="grid gap-4 sm:grid-cols-1 md:gap-5">
        {GUIDES.map((guide, i) => {
          const Icon = guide.icon;
          return (
            <motion.button
              key={guide.id}
              type="button"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4, ease: EASE }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelect(guide.id)}
              className="group relative w-full overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-lg dark:border-gray-700/60 dark:bg-gray-900/90 md:rounded-[1.25rem] md:p-6"
            >
              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${guide.accent} opacity-10 blur-2xl transition-opacity group-hover:opacity-20`}
              />
              <div className="relative flex items-start gap-4">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${guide.accent} shadow-lg shadow-violet-500/20`}
                >
                  <Icon className="h-7 w-7 text-white" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                    {guide.tagline}
                  </p>
                  <h2 className="mt-0.5 text-lg font-bold text-gray-900 dark:text-gray-50 md:text-xl">
                    {guide.title}
                  </h2>
                  <p className="mt-1.5 text-sm leading-snug text-gray-600 dark:text-gray-400">
                    {guide.description}
                  </p>
                  <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-violet-600 transition-colors group-hover:text-violet-500 dark:text-violet-400">
                    {guide.steps.length} pasos interactivos
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </p>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
