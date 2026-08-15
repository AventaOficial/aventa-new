'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Lightbulb } from 'lucide-react';
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
  const n = guide.steps.length;
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= n - 1;

  return (
    <div className="mx-auto max-w-lg md:max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 flex items-center gap-3"
      >
        <button
          type="button"
          onClick={onBackToHub}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e5e5e7] bg-white text-[#6e6e73] transition-colors hover:bg-[#f5f5f7] dark:border-[#262626] dark:bg-[#141414] dark:text-[#a3a3a3]"
          aria-label="Volver al hub de guías"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
            {guide.title}
          </p>
          <p className="text-sm font-medium text-[#6e6e73] dark:text-[#a3a3a3]">
            Paso {stepIndex + 1} de {n}
          </p>
        </div>
      </motion.div>

      <div className="mb-5 flex gap-1" role="tablist" aria-label="Progreso de la guía">
        {guide.steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onDotClick(i)}
            className="h-1.5 flex-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
            aria-label={`Ir al paso ${i + 1}: ${s.title}`}
            aria-current={i === stepIndex ? 'step' : undefined}
          >
            <span
              className={`block h-full rounded-full ${
                i <= stepIndex ? 'bg-violet-600' : 'bg-[#e8e8ed] dark:bg-[#2c2c2e]'
              }`}
            />
          </button>
        ))}
      </div>

      <motion.article
        key={`${guide.id}-${step.id}`}
        initial={{ opacity: 0, x: direction >= 0 ? 28 : -28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="overflow-hidden rounded-3xl border border-[#e8e8ed] bg-white dark:border-[#2a2a2a] dark:bg-[#141414]"
      >
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <p className="text-xs font-medium text-violet-600 dark:text-violet-400">{step.subtitle}</p>
          <h1 className="mt-1 text-xl font-bold leading-tight tracking-tight text-[#1d1d1f] dark:text-[#fafafa] md:text-2xl">
            {step.title}
          </h1>
          <div className="mt-3 space-y-2.5 text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3] md:text-[15px]">
            {step.body.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <GuideIllustration id={step.illustration} />
        </div>

        {step.tips && step.tips.length > 0 ? (
          <div className="mx-5 mb-5 rounded-2xl bg-violet-50 px-4 py-3 dark:bg-violet-950/30 sm:mx-6">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden />
              ¿Sabías que?
            </p>
            <ul className="mt-2 space-y-1.5">
              {step.tips.map((tip) => (
                <li key={tip} className="text-sm leading-snug text-violet-900 dark:text-violet-200">
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step.cta ? (
          <div className="px-5 pb-2 sm:px-6">
            <Link
              href={step.cta.href}
              className="inline-flex text-sm font-semibold text-violet-600 hover:text-violet-500 dark:text-violet-400"
            >
              {step.cta.label} →
            </Link>
          </div>
        ) : null}

        <nav className="space-y-2 px-5 pb-5 pt-3 sm:px-6" aria-label="Navegación de la guía">
          {isLast ? (
            <motion.button
              type="button"
              onClick={onBackToHub}
              whileTap={{ scale: 0.98 }}
              className="inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-violet-600 text-sm font-semibold text-white"
            >
              Ver otras guías
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={onNext}
              whileTap={{ scale: 0.98 }}
              className="inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-violet-600 text-sm font-semibold text-white"
            >
              Siguiente paso
              <ChevronRight className="h-4 w-4" aria-hidden />
            </motion.button>
          )}
          {!isLast ? (
            <div className="flex items-center justify-center gap-4">
              {!isFirst ? (
                <button
                  type="button"
                  onClick={onPrev}
                  className="h-10 text-sm font-medium text-[#6e6e73] dark:text-[#a3a3a3]"
                >
                  Anterior
                </button>
              ) : null}
              <button
                type="button"
                onClick={onNext}
                className="h-10 text-sm font-medium text-[#6e6e73] dark:text-[#a3a3a3]"
              >
                Saltar paso
              </button>
            </div>
          ) : (
            <Link
              href="/"
              className="flex h-10 w-full items-center justify-center text-sm font-medium text-violet-600 dark:text-violet-400"
            >
              Ir al inicio
            </Link>
          )}
        </nav>
      </motion.article>
    </div>
  );
}
