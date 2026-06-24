'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import GuideHub from './components/GuideHub';
import InteractiveGuide from './components/InteractiveGuide';
import { getGuideById, isGuideId, type GuideId } from './guides/content';

type StepState = { index: number; dir: number };

export default function DescubreGuide() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const guiaParam = searchParams.get('guia');
  const activeGuide = isGuideId(guiaParam) ? getGuideById(guiaParam) : undefined;

  const [step, setStep] = useState<StepState>({ index: 0, dir: 0 });

  useEffect(() => {
    setStep({ index: 0, dir: 0 });
  }, [activeGuide?.id]);

  const setGuideInUrl = useCallback(
    (id: GuideId | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set('guia', id);
      else params.delete('guia');
      const q = params.toString();
      router.replace(q ? `/descubre?${q}` : '/descubre', { scroll: false });
    },
    [router, searchParams],
  );

  const goToStep = useCallback(
    (target: number) => {
      if (!activeGuide) return;
      const clamped = Math.max(0, Math.min(activeGuide.steps.length - 1, target));
      setStep((s) => {
        if (clamped === s.index) return s;
        return { index: clamped, dir: clamped > s.index ? 1 : -1 };
      });
    },
    [activeGuide],
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-transparent relative">
      <div className="mx-auto max-w-3xl px-4 py-6 md:py-10 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] md:pb-10">
        <AnimatePresence mode="wait">
          {!activeGuide ? (
            <motion.div
              key="hub"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <GuideHub onSelect={(id) => setGuideInUrl(id)} />
            </motion.div>
          ) : (
            <motion.div
              key={activeGuide.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <InteractiveGuide
                guide={activeGuide}
                stepIndex={step.index}
                direction={step.dir}
                onBackToHub={() => setGuideInUrl(null)}
                onPrev={() => goToStep(step.index - 1)}
                onNext={() => goToStep(step.index + 1)}
                onDotClick={goToStep}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {!activeGuide && (
          <p className="mt-8 text-center text-sm">
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center justify-center font-medium text-violet-600 transition-colors hover:text-violet-500 dark:text-violet-400"
            >
              Volver al inicio
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
