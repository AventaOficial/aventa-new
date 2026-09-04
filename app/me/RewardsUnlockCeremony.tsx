'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

export type CeremonyStep = 'hello' | 'terms';

type RewardsUnlockCeremonyProps = {
  open: boolean;
  step: CeremonyStep;
  termsHref: string;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onContinueFromHello: () => void;
  onAcceptTerms: () => void;
};

/**
 * Modal premium del desbloqueo (Fase 3).
 * Abrir el modal NO otorga recompensa — solo la aceptación de términos en backend.
 */
export default function RewardsUnlockCeremony({
  open,
  step,
  termsHref,
  submitting,
  error,
  onClose,
  onContinueFromHello,
  onAcceptTerms,
}: RewardsUnlockCeremonyProps) {
  const titleId = useId();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!open) setChecked(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, submitting]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity"
        aria-label="Cerrar"
        disabled={submitting}
        onClick={() => {
          if (!submitting) onClose();
        }}
      />

      <div
        className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#141414] shadow-2xl border border-violet-100 dark:border-violet-900/50 animate-in fade-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-600 via-violet-500 to-violet-700" />

        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
            AVENTA · Cazador
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'hello' ? (
          <div className="px-5 pb-6 pt-2 space-y-5">
            <div className="space-y-3">
              <h2
                id={titleId}
                className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50"
              >
                Hola, cazador.
              </h2>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                AVENTA quiere reconocerte por ser un excelente cazador de ofertas para la
                comunidad.
              </p>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                Has encontrado, compartido y ayudado a descubrir oportunidades para otros
                miembros.
              </p>
              <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200 font-medium">
                Esta recompensa es nuestra forma de decirte gracias.
              </p>
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-500 leading-relaxed">
              Es un reconocimiento por aportar valor — no un empleo ni un ingreso garantizado.
            </p>

            <button
              type="button"
              onClick={onContinueFromHello}
              className="w-full rounded-2xl bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] font-semibold py-3.5 text-sm hover:opacity-90 transition-opacity"
            >
              Continuar
            </button>
          </div>
        ) : (
          <div className="px-5 pb-6 pt-2 space-y-5">
            <div className="space-y-2">
              <h2
                id={titleId}
                className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-50"
              >
                Antes de continuar
              </h2>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                Esta recompensa está sujeta a los Términos y Condiciones del Programa de
                Recompensas de AVENTA.
              </p>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-[#1a1a1a] p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                He leído y acepto los Términos y Condiciones.
              </span>
            </label>

            <Link
              href={termsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              Ver términos y condiciones
            </Link>

            {error ? (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              disabled={!checked || submitting}
              onClick={onAcceptTerms}
              className="w-full rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Registrando…' : 'Continuar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
