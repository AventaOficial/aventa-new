'use client';

import { useState } from 'react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { cn } from '@/app/components/panel/utils';

type Props = {
  mode: ModerationHubMode;
  acting: boolean;
  open: boolean;
  onClose: () => void;
  onSave: (pastedUrl: string) => Promise<{ ok: boolean; error?: string }>;
};

/**
 * Flujo humano para pegar el enlace afiliado de Aventa.
 * No inventa original_offer_url; el backend aplica la política existente.
 */
export default function FocusAffiliatePrepare({ mode, acting, open, onClose, onSave }: Props) {
  const ui = moderationUi(mode);
  const [paste, setPaste] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const busy = acting || saving;

  return (
    <div
      className={cn(
        'mb-3 rounded-2xl border px-4 py-3 text-left',
        ui.border,
        ui.ws ? 'bg-amber-50/90 dark:bg-amber-950/35' : 'bg-amber-500/10'
      )}
      data-focus-affiliate-prepare
    >
      <p className={cn('text-sm font-semibold', ui.body)}>Preparar enlace de Aventa</p>
      <p className={cn('mt-1 text-xs leading-relaxed', ui.muted)}>
        Esta tienda tiene programa afiliado. Pega el enlace con el tag de Aventa y guárdalo antes de
        aprobar.
      </p>
      <label className="mt-3 block">
        <span className={cn('sr-only')}>Enlace afiliado</span>
        <textarea
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setLocalError(null);
          }}
          rows={2}
          disabled={busy}
          placeholder="https://…"
          className={cn(
            'w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2',
            ui.ws
              ? 'border-black/10 bg-white text-gray-900 focus:ring-emerald-500/30 dark:border-white/15 dark:bg-[#121816] dark:text-gray-100'
              : 'border-white/15 bg-black/30 text-white focus:ring-violet-400/40'
          )}
        />
      </label>
      {localError ? (
        <p className={cn('mt-2 text-xs', ui.ws ? 'text-rose-700 dark:text-rose-300' : 'text-rose-300')}>
          {localError}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !paste.trim()}
          onClick={() => {
            void (async () => {
              setSaving(true);
              setLocalError(null);
              const result = await onSave(paste.trim());
              setSaving(false);
              if (!result.ok) {
                setLocalError(result.error ?? 'No se pudo guardar el enlace');
                return;
              }
              setPaste('');
            })();
          }}
          className={cn(
            'rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50',
            ui.ws ? 'bg-emerald-600' : 'bg-violet-500'
          )}
        >
          {saving ? 'Guardando…' : 'Guardar enlace'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className={cn('rounded-full px-3 py-2 text-sm', ui.btnGhost)}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
