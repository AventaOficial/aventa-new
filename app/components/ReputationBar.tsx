'use client';

import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { getReputationLabel, getReputationProgress, REPUTATION_LEVELS } from '@/lib/reputation';

type ReputationBarProps = {
  level: number;
  score: number;
  className?: string;
};

const LEVEL_EXPLANATIONS: Record<number, string> = {
  1: 'Todo lo que publicas pasa por moderación. Es la etapa para ganar confianza.',
  2: 'Tus comentarios se publican al instante. Las ofertas siguen en revisión.',
  3: 'Tus ofertas también se publican al instante en Recientes. Más influencia en el ranking.',
  4: 'Máxima confianza: tu voto cuenta más en el orden del feed (solo backend).',
};

export default function ReputationBar({ level, score, className = '' }: ReputationBarProps) {
  const [showHelp, setShowHelp] = useState(false);
  const label = getReputationLabel(level);
  const progress = getReputationProgress(score, level);

  return (
    <>
      <div className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 p-3 ${className}`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Nivel {level} – {label}
          </span>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors p-0.5 rounded"
            title="¿Qué significan los niveles?"
            aria-label="Explicación de niveles"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
        <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-500 dark:to-pink-500 transition-all duration-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowHelp(false)}>
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md w-full p-5 border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Niveles de reputación</h3>
              <button type="button" onClick={() => setShowHelp(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              La reputación sube con ofertas aprobadas, comentarios aprobados y likes recibidos. No expira por tiempo.
            </p>
            <ul className="space-y-3">
              {REPUTATION_LEVELS.map(({ level: l, label: lbl }) => (
                <li key={l} className="text-sm">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Nivel {l} – {lbl}</span>
                  <p className="text-gray-600 dark:text-gray-400 mt-0.5">{LEVEL_EXPLANATIONS[l] ?? ''}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
