'use client';

import { useState } from 'react';
import { Keyboard } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { cn } from '@/app/components/panel/utils';

type Props = {
  mode: ModerationHubMode;
};

const ROWS = [
  { key: 'A', label: 'Aprobar' },
  { key: 'O', label: 'Abrir enlace' },
  { key: 'R', label: 'Rechazar' },
  { key: 'S', label: 'Revisar después' },
  { key: '←', label: 'Anterior' },
  { key: '→', label: 'Siguiente' },
  { key: 'Esc', label: 'Cerrar' },
];

export default function FocusShortcutsHint({ mode }: Props) {
  const ui = moderationUi(mode);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn('inline-flex items-center gap-1.5 text-xs font-medium', ui.muted)}
      >
        <Keyboard className="h-3.5 w-3.5" />
        Atajos
      </button>
      {open ? (
        <div
          className={cn(
            'absolute right-0 z-20 mt-2 w-48 rounded-xl border p-3 shadow-lg',
            ui.border,
            ui.ws ? 'bg-white dark:bg-[#121816]' : 'bg-[#16141f]'
          )}
        >
          <ul className="space-y-1.5">
            {ROWS.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-2 text-xs">
                <span className={ui.soft}>{row.label}</span>
                <kbd className={cn('rounded px-1.5 py-0.5 font-mono', ui.thumbBg, ui.body)}>
                  {row.key}
                </kbd>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
