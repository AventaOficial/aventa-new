'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { cn } from '@/app/components/panel/utils';

type Props = {
  mode: ModerationHubMode;
  acting: boolean;
  disabled?: boolean;
  offerHref?: string | null;
  changeLabel?: string;
  onChangeLink?: () => void;
  onReject: () => void;
  onApprove: () => void;
  onSnooze: (minutes: 15 | 60 | 240) => void;
};

export default function FocusActionsBar({
  mode,
  acting,
  disabled,
  offerHref,
  changeLabel = 'Cambiar enlace',
  onChangeLink,
  onReject,
  onApprove,
  onSnooze,
}: Props) {
  const ui = moderationUi(mode);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const busy = acting || disabled;
  const href = offerHref?.trim() || '';

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-2.5 flex gap-2">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 text-sm font-semibold',
              ui.ws
                ? 'border-black/10 bg-white text-gray-900 hover:bg-black/[0.03] dark:border-white/15 dark:bg-white/[0.04] dark:text-gray-100'
                : 'border-white/15 bg-white/[0.06] text-white hover:bg-white/10'
            )}
          >
            Abrir
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
        {onChangeLink ? (
          <button
            type="button"
            disabled={busy}
            onClick={onChangeLink}
            className={cn(
              'flex-1 rounded-2xl border px-3 py-2.5 text-sm font-semibold disabled:opacity-50',
              changeLabel === 'Preparar enlace'
                ? ui.ws
                  ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200'
                  : 'border-amber-400/40 bg-amber-500/15 text-amber-100'
                : ui.ws
                  ? 'border-black/10 bg-white text-gray-900 dark:border-white/15 dark:bg-white/[0.04] dark:text-gray-100'
                  : 'border-white/15 bg-white/[0.06] text-white'
            )}
          >
            {changeLabel}
          </button>
        ) : null}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          className={cn(
            'flex-1 rounded-2xl border px-4 py-3.5 text-base font-semibold transition disabled:opacity-50',
            ui.ws
              ? 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-500/10'
              : 'border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
          )}
        >
          Rechazar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onApprove}
          className={cn(
            'flex-[1.35] rounded-2xl px-4 py-3.5 text-base font-semibold text-white transition disabled:opacity-50',
            ui.ws
              ? 'bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400'
              : 'bg-violet-500 hover:bg-violet-400'
          )}
        >
          Aprobar
        </button>
      </div>

      <div className="mt-3 text-center">
        {!snoozeOpen ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setSnoozeOpen(true)}
            className={cn('text-sm font-medium disabled:opacity-50', ui.muted)}
          >
            Revisar después
          </button>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {([15, 60, 240] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy}
                onClick={() => {
                  setSnoozeOpen(false);
                  onSnooze(m);
                }}
                className={cn('rounded-full px-3 py-1.5 text-xs font-medium', ui.btnGhost)}
              >
                {m === 15 ? '15 min' : m === 60 ? '1 h' : '4 h'}
              </button>
            ))}
            <button
              type="button"
              className={cn('text-xs', ui.faint)}
              onClick={() => setSnoozeOpen(false)}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
