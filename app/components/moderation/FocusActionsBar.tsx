'use client';

import { useState } from 'react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { cn } from '@/app/components/panel/utils';

type Props = {
  mode: ModerationHubMode;
  acting: boolean;
  disabled?: boolean;
  onReject: () => void;
  onApprove: () => void;
  onSnooze: (minutes: 15 | 60 | 240) => void;
};

export default function FocusActionsBar({
  mode,
  acting,
  disabled,
  onReject,
  onApprove,
  onSnooze,
}: Props) {
  const ui = moderationUi(mode);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const busy = acting || disabled;

  return (
    <div className="mx-auto w-full max-w-lg">
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
