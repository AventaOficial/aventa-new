'use client';

import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { getReputationLabel, getReputationProgress, REPUTATION_LEVELS } from '@/lib/reputation';

type ReputationBarProps = {
  level: number;
  score: number;
  className?: string;
  /** Shell premium para /me → Cazador */
  variant?: 'default' | 'hunter';
};

const LEVEL_EXPLANATIONS: Record<number, string> = {
  1: 'Todo lo que publicas pasa por moderación. Es la etapa para ganar confianza.',
  2: 'Tus comentarios se publican al instante. Las ofertas siguen en revisión.',
  3: 'Tus ofertas también se publican al instante en Recientes. Más influencia en el ranking.',
  4: 'Máxima confianza: tu voto cuenta más en el orden del feed (solo backend).',
};

export default function ReputationBar({
  level,
  score,
  className = '',
  variant = 'default',
}: ReputationBarProps) {
  const [showHelp, setShowHelp] = useState(false);
  const label = getReputationLabel(level);
  const progress = getReputationProgress(score, level);
  const pct = Math.round(progress * 100);

  if (variant === 'hunter') {
    return (
      <>
        <div
          className={`rounded-2xl border border-zinc-800/80 bg-[#0e0e10]/90 px-4 py-4 sm:px-5 ${className}`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <div className="shrink-0 sm:w-36">
              <p className="text-sm font-semibold text-white">
                Nivel {level} – {label}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center justify-end gap-1.5">
                <span className="text-xs font-semibold tabular-nums text-violet-400">{pct}%</span>
                <button
                  type="button"
                  onClick={() => setShowHelp(true)}
                  className="rounded p-0.5 text-zinc-500 transition-colors hover:text-violet-400"
                  title="¿Qué significan los niveles?"
                  aria-label="Explicación de niveles"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-zinc-800"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progreso de reputación nivel ${level}: ${pct}%`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 sm:max-w-[200px] sm:text-right">
              <p className="text-sm font-medium text-zinc-200">Sigue cazando para subir de nivel.</p>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                Tu constancia crea impacto en la comunidad.
              </p>
            </div>
          </div>
        </div>

        {showHelp ? (
          <HelpModal onClose={() => setShowHelp(false)} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <div
        className={`rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-[#1a1a1a]/80 ${className}`}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Nivel {level} – {label}
          </span>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="rounded p-0.5 text-gray-400 transition-colors hover:text-violet-600 dark:hover:text-violet-400"
            title="¿Qué significan los niveles?"
            aria-label="Explicación de niveles"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {showHelp ? <HelpModal onClose={() => setShowHelp(false)} /> : null}
    </>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-[#141414]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Niveles de reputación
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Más nivel = menos espera al publicar y más peso al votar. Sube con ofertas y comentarios
          aprobados y likes recibidos. No expira por tiempo.
        </p>
        <ul className="space-y-3">
          {REPUTATION_LEVELS.map(({ level: l, label: lbl }) => (
            <li key={l} className="text-sm">
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                Nivel {l} – {lbl}
              </span>
              <p className="mt-0.5 text-gray-600 dark:text-gray-400">
                {LEVEL_EXPLANATIONS[l] ?? ''}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
