'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { FOCUS_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';
import { cn } from '@/app/components/panel/utils';

type Props = {
  open: boolean;
  mode: ModerationHubMode;
  acting: boolean;
  onClose: () => void;
  onConfirm: (reasonFull: string) => void;
};

export default function FocusRejectSheet({ open, mode, acting, onClose, onConfirm }: Props) {
  const ui = moderationUi(mode);
  const [otherText, setOtherText] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  if (!open) return null;

  const submit = () => {
    if (picked === 'Otro') {
      const t = otherText.trim();
      onConfirm(t || 'Rechazada por el moderador.');
      return;
    }
    const preset = FOCUS_REJECTION_PRESETS.find((p) => p.short === picked);
    if (!preset) return;
    onConfirm(preset.full);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Cerrar" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl',
          ui.modal
        )}
        role="dialog"
        aria-modal
        aria-labelledby="focus-reject-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="focus-reject-title" className={cn('text-lg font-semibold', ui.title)}>
            ¿Por qué?
          </h3>
          <button type="button" onClick={onClose} className={cn('rounded-full p-2', ui.btnGhost)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2">
          {FOCUS_REJECTION_PRESETS.map((p) => (
            <li key={p.short}>
              <button
                type="button"
                onClick={() => setPicked(p.short)}
                className={cn(
                  'w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition',
                  picked === p.short
                    ? ui.ws
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-100'
                      : 'border-violet-400 bg-violet-500/20 text-white'
                    : cn(ui.border, ui.body, 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]')
                )}
              >
                {p.short}
              </button>
            </li>
          ))}
        </ul>
        {picked === 'Otro' ? (
          <textarea
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Cuéntanos brevemente…"
            rows={3}
            className={cn('mt-3 w-full px-3 py-2 text-sm', ui.input)}
          />
        ) : null}
        <button
          type="button"
          disabled={!picked || acting}
          onClick={submit}
          className={cn(
            'mt-4 w-full rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-50',
            ui.ws ? 'bg-rose-600 hover:bg-rose-500' : 'bg-rose-500 hover:bg-rose-400'
          )}
        >
          Confirmar rechazo
        </button>
      </div>
    </div>
  );
}
