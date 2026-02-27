'use client';

import { X, Plus, Filter, Sparkles as SparklesIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  example: React.ReactNode;
}

export default function Onboarding({ isOpen, onClose }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);

  // Bloquear scroll del body cuando el onboarding está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const steps: Step[] = [
    {
      id: 'step-upload',
      title: 'Sube ofertas',
      description: 'Comparte lo que encuentres. La comunidad decide las mejores ofertas.',
      icon: <Plus className="h-6 w-6 text-white" />,
      example: (
        <div className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
          <Plus className="h-4 w-4" />
          <span>Subir oferta</span>
        </div>
      ),
    },
    {
      id: 'step-filters',
      title: 'Filtra por tiempo',
      description: 'Encuentra ofertas de hoy, esta semana o este mes.',
      icon: <Filter className="h-6 w-6 text-white" />,
      example: (
        <div className="flex gap-2 rounded-xl bg-white p-1 shadow-md">
          <button className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-500 px-4 py-2 text-sm font-semibold text-white">
            Hoy
          </button>
          <button className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600">
            Semana
          </button>
          <button className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600">
            Mes
          </button>
        </div>
      ),
    },
    {
      id: 'step-offers',
      title: 'Explora ofertas',
      description: 'Haz clic en cualquier oferta para ver más detalles y comentarios.',
      icon: <SparklesIcon className="h-6 w-6 text-white" />,
      example: (
        <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 p-4 shadow-lg">
          <div className="mb-2 h-32 rounded-xl bg-gradient-to-br from-purple-200 to-pink-200" />
          <h3 className="font-bold text-gray-900">iPhone 15 Pro Max</h3>
          <p className="text-sm text-gray-600">$999</p>
        </div>
      ),
    },
    {
      id: 'step-luna',
      title: 'Conoce a Luna',
      description: 'Luna te ayuda a explorar lo que la comunidad encuentra.',
      icon: <SparklesIcon className="h-6 w-6 text-white" />,
      example: (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-pink-500 shadow-lg">
          <SparklesIcon className="h-6 w-6 text-white" />
        </div>
      ),
    },
  ];

  if (!isOpen) return null;

  const current = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-3xl rounded-3xl bg-white p-10 shadow-2xl"
        >
          {/* Botón de cerrar */}
          <button
            onClick={onClose}
            className="absolute right-6 top-6 rounded-full bg-gray-100 p-2 text-gray-600 transition-all duration-200 ease-out hover:bg-gray-200"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Contenido del paso */}
          <div className="flex items-center gap-10">
            {/* Ejemplo visual a la izquierda */}
            <div className="flex-shrink-0">
              <div className="flex h-40 w-40 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100">
                {current.example}
              </div>
            </div>

            {/* Explicación a la derecha */}
            <div className="flex-1">
              <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
                {current.icon}
              </div>
              <h2 className="mb-3 text-3xl font-bold text-gray-900">{current.title}</h2>
              <p className="text-lg text-gray-600 leading-relaxed">{current.description}</p>
            </div>
          </div>

          {/* Indicadores de pasos */}
          <div className="mt-10 flex justify-center gap-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`h-2 rounded-full transition-all duration-200 ease-out ${
                  index === currentStep
                    ? 'w-8 bg-purple-600'
                    : index < currentStep
                    ? 'w-2 bg-purple-300'
                    : 'w-2 bg-gray-300'
                }`}
              />
            ))}
          </div>

          {/* Botones de navegación */}
          <div className="mt-8 flex gap-3">
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="flex-1 rounded-xl border-2 border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-purple-300 hover:bg-purple-50 active:translate-y-0"
              >
                Anterior
              </button>
            )}
            {!isLastStep ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-3 font-semibold text-white shadow-lg transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl active:translate-y-0"
              >
                Siguiente
              </button>
            ) : (
              <button
                onClick={onClose}
                className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-3 font-semibold text-white shadow-lg transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl active:translate-y-0"
              >
                Comenzar
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
