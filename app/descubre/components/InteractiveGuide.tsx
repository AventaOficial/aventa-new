'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import type { GuideMeta } from '../guides/content';
import GuideIllustration from './GuideIllustrations';

const EASE = [0.22, 1, 0.36, 1] as const;

type Props = {
  guide: GuideMeta;
  stepIndex: number;
  direction: number;
  onBackToHub: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDotClick: (i: number) => void;
};

export default function InteractiveGuide({
  guide,
  stepIndex,
  direction,
  onBackToHub,
  onPrev,
  onNext,
  onDotClick,
}: Props) {
  const step = guide.steps[stepIndex];
  const Icon = step.icon;
  const n = guide.steps.length;
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= n - 1;

  return (
    <div className="mx-auto max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 flex items-center gap-3"
      >
        <button
          type="button"
          onClick={onBackToHub}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200/90 bg-white/90 text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label="Volver al hub de guías"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
            {guide.title}
          </p>
          <h1 className="truncate text-lg font-bold text-gray-900 dark:text-gray-50 md:text-xl">
            {step.title}
          </h1>
        </div>
      </motion.div>

      <div className="mb-4 h-1 overflow-hidden rounded-full bg-gray-200/80 dark:bg-gray-700/80">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${guide.accent}`}
          initial={false}
          animate={{ width: `${((stepIndex + 1) / n) * 100}%` }}
          transition={{ duration: 0.35, ease: EASE }}
        />
      </div>

      <motion.article
        key={`${guide.id}-${step.id}`}
        initial={{ opacity: 0, x: direction >= 0 ? 40 : -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.38, ease: EASE }}
        className="overflow-hidden rounded-2xl border border-gray-200/70 bg-gradient-to-br from-white via-white to-violet-50/30 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12)] dark:border-gray-700/60 dark:from-gray-900 dark:via-gray-900 dark:to-violet-950/20 md:rounded-[1.35rem]"
      >
        <GuideIllustration id={step.illustration} />

        <div className="border-t border-gray-100/80 p-5 dark:border-gray-800 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/20">
              <Icon className="h-5 w-5 text-violet-600 dark:text-violet-400" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-xs font-medium text-violet-600 dark:text-violet-400">{step.subtitle}</p>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 md:text-lg">{step.title}</h2>
            </div>
          </div>

          <div className="space-y-2.5 text-[14px] leading-relaxed text-gray-600 dark:text-gray-400 md:text-[15px]">
            {step.body.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </div>

          {step.tips && step.tips.length > 0 && (
            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="mt-4 space-y-2 rounded-xl bg-violet-50/80 p-3 dark:bg-violet-950/30"
            >
              {step.tips.map((tip) => (
                <li key={tip} className="flex gap-2 text-sm text-violet-900 dark:text-violet-200">
                  <span className="text-violet-500">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </motion.ul>
          )}

          {step.cta && (
            <Link
              href={step.cta.href}
              className="mt-5 inline-flex text-sm font-semibold text-violet-600 transition-colors hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              {step.cta.label} →
            </Link>
          )}
        </div>
      </motion.article>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {guide.steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onDotClick(i)}
            className="rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
            aria-label={`Ir al paso ${i + 1}: ${s.title}`}
            aria-current={i === stepIndex ? 'step' : undefined}
          >
            <motion.span
              className="block rounded-full bg-gray-300 dark:bg-gray-600"
              animate={{
                width: i === stepIndex ? 24 : 8,
                height: 8,
                opacity: i === stepIndex ? 1 : 0.45,
              }}
              transition={{ duration: 0.25, ease: EASE }}
            />
          </button>
        ))}
      </div>

      <nav className="mt-4 space-y-3" aria-label="Navegación de la guía">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <motion.button
            type="button"
            onClick={onPrev}
            disabled={isFirst}
            whileTap={{ scale: 0.98 }}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-gray-200/90 bg-white/90 px-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-35 dark:border-gray-600/70 dark:bg-[#1a1a1a]/80 dark:text-gray-200"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
            Anterior
          </motion.button>
          {isLast ? (
            <motion.button
              type="button"
              onClick={onBackToHub}
              whileTap={{ scale: 0.98 }}
              className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r ${guide.accent} px-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/20`}
            >
              Ver otras guías
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={onNext}
              whileTap={{ scale: 0.98 }}
              className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r ${guide.accent} px-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/20`}
            >
              Siguiente
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            </motion.button>
          )}
        </div>
        {isLast && (
          <Link
            href="/"
            className="flex h-11 items-center justify-center rounded-2xl border border-gray-200/90 bg-white/90 text-sm font-semibold text-violet-600 transition-colors hover:bg-violet-50 dark:border-gray-600/70 dark:bg-[#1a1a1a]/80 dark:text-violet-400 dark:hover:bg-violet-950/30"
          >
            Ir al inicio
          </Link>
        )}
      </nav>
    </div>
  );
}
