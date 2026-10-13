'use client';

import { useState } from 'react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import type { PrepareAffiliateLinkResult } from '@/lib/hooks/useModerationFocusQueue';
import type { MeliLaPasteVerification } from '@/lib/affiliate/verifyMeliLaPaste';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { cn } from '@/app/components/panel/utils';
import AffiliateLinkTrace from './AffiliateLinkTrace';

type Props = {
  mode: ModerationHubMode;
  acting: boolean;
  open: boolean;
  /** prepare = falta enlace afiliado de Aventa; replace = cambio de URL de producto. */
  variant?: 'prepare' | 'replace';
  /** Enlace que subió el usuario; se muestra junto al que se va a publicar. */
  originalUrl?: string | null;
  onClose: () => void;
  onSave: (pastedUrl: string, opts?: { manualReview?: boolean }) => Promise<PrepareAffiliateLinkResult>;
};

/**
 * Flujo humano para pegar/reemplazar el enlace operativo.
 * No inventa original_offer_url; el backend aplica la política existente.
 */
export default function FocusAffiliatePrepare({
  mode,
  acting,
  open,
  variant = 'prepare',
  originalUrl,
  onClose,
  onSave,
}: Props) {
  const ui = moderationUi(mode);
  const [paste, setPaste] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [verification, setVerification] = useState<MeliLaPasteVerification | null>(null);
  const [manualPending, setManualPending] = useState(false);
  const [manualConfirmed, setManualConfirmed] = useState(false);

  if (!open) return null;

  const busy = acting || saving;

  const resetCheck = () => {
    setVerification(null);
    setManualPending(false);
    setManualConfirmed(false);
  };

  const save = async (manualReview: boolean) => {
    setSaving(true);
    setLocalError(null);
    const result = await onSave(paste.trim(), manualReview ? { manualReview: true } : undefined);
    setSaving(false);
    setVerification(result.verification ?? null);
    if (!result.ok) {
      setManualPending(result.manualReviewRequired === true);
      setManualConfirmed(false);
      setLocalError(result.error ?? 'No se pudo guardar el enlace');
      return;
    }
    setPaste('');
    setManualPending(false);
    setManualConfirmed(false);
  };

  return (
    <div
      className={cn(
        'mb-3 rounded-2xl border px-4 py-3 text-left',
        ui.border,
        ui.ws ? 'bg-amber-50/90 dark:bg-amber-950/35' : 'bg-amber-500/10'
      )}
      data-focus-affiliate-prepare
    >
      <p className={cn('text-sm font-semibold', ui.body)}>
        {variant === 'prepare' ? 'Preparar enlace de Aventa' : 'Cambiar enlace'}
      </p>
      <p className={cn('mt-1 text-xs leading-relaxed', ui.muted)}>
        {variant === 'prepare'
          ? 'Mercado Libre: pega el meli.la generado en la cuenta de afiliados de Aventa. Se comprueba la cuenta y el producto antes de guardarlo.'
          : 'Pega el enlace del producto. El original guardado no se inventa ni se reemplaza.'}
      </p>
      <label className="mt-3 block">
        <span className={cn('sr-only')}>Enlace afiliado</span>
        <textarea
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setLocalError(null);
            resetCheck();
          }}
          rows={2}
          disabled={busy}
          placeholder="https://meli.la/…"
          className={cn(
            'w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2',
            ui.ws
              ? 'border-black/10 bg-white text-gray-900 focus:ring-emerald-500/30 dark:border-white/15 dark:bg-[#121816] dark:text-gray-100'
              : 'border-white/15 bg-black/30 text-white focus:ring-violet-400/40'
          )}
        />
      </label>
      {verification ? (
        <div className={cn('mt-2', ui.body)}>
          <AffiliateLinkTrace
            originalUrl={originalUrl}
            publishedUrl={paste.trim() || null}
            verification={verification}
          />
        </div>
      ) : localError ? (
        <p className={cn('mt-2 text-xs', ui.ws ? 'text-rose-700 dark:text-rose-300' : 'text-rose-300')}>
          {localError}
        </p>
      ) : null}
      {manualPending ? (
        <label className={cn('mt-2 flex items-start gap-2 text-xs', ui.body)}>
          <input
            type="checkbox"
            checked={manualConfirmed}
            onChange={(e) => setManualConfirmed(e.target.checked)}
            disabled={busy}
            className="mt-0.5"
          />
          <span>
            Abrí el meli.la y confirmo que es este producto y la cuenta de afiliados de Aventa.
            Quedará registrado como revisión manual, no como verificación automática.
          </span>
        </label>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {manualPending ? (
          <button
            type="button"
            disabled={busy || !manualConfirmed || !paste.trim()}
            onClick={() => void save(true)}
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar con revisión manual'}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !paste.trim()}
            onClick={() => void save(false)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50',
              ui.ws ? 'bg-emerald-600' : 'bg-violet-500'
            )}
          >
            {saving ? 'Verificando…' : 'Guardar enlace'}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            resetCheck();
            onClose();
          }}
          className={cn('rounded-full px-3 py-2 text-sm', ui.btnGhost)}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
