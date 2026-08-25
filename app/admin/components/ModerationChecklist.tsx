'use client';

import { AlertTriangle, Check, X } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '../moderation/moderationUi';
import type { ChecklistState, ModerationChecklistItem } from '@/lib/moderation/botFacts';

type Props = {
  mode?: ModerationHubMode;
  items: ModerationChecklistItem[];
  /** Si se pasa, las filas con problema se vuelven botones para arreglarlas. */
  onFix?: (id: ModerationChecklistItem['id']) => void;
  disabled?: boolean;
};

const STATE_STYLE: Record<ChecklistState, { icon: typeof Check; wrap: string; text: string }> = {
  ok: {
    icon: Check,
    wrap: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    text: '',
  },
  missing: {
    icon: X,
    wrap: 'bg-red-500/15 text-red-700 dark:text-red-300',
    text: 'text-red-700 dark:text-red-300',
  },
  warn: {
    icon: AlertTriangle,
    wrap: 'bg-amber-500/15 text-amber-700 dark:text-amber-200',
    text: 'text-amber-700 dark:text-amber-200',
  },
};

/**
 * «Qué falta»: la única lista que el moderador necesita leer antes de decidir.
 */
export default function ModerationChecklist({ mode = 'admin', items, onFix, disabled }: Props) {
  const ui = moderationUi(mode);

  return (
    <ul className={`divide-y overflow-hidden rounded-xl border ${ui.border} ${ui.hairline}`}>
      {items.map((item) => {
        const style = STATE_STYLE[item.state];
        const Icon = style.icon;
        const actionable = Boolean(onFix) && item.state !== 'ok' && !disabled;

        const row = (
          <span className="flex w-full items-center gap-2.5 px-3 py-2 text-left">
            <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${style.wrap}`}>
              <Icon className="h-3 w-3" aria-hidden />
            </span>
            <span className={`w-[74px] shrink-0 text-xs font-medium ${ui.body}`}>{item.label}</span>
            <span className={`min-w-0 flex-1 truncate text-xs ${style.text || ui.muted}`}>
              {item.detail}
            </span>
            {actionable ? (
              <span className="shrink-0 text-[11px] font-semibold text-emerald-700 dark:text-violet-300">
                Arreglar
              </span>
            ) : null}
          </span>
        );

        return (
          <li key={item.id}>
            {actionable ? (
              <button
                type="button"
                onClick={() => onFix?.(item.id)}
                className={`flex w-full ${ui.rowHover}`}
              >
                {row}
              </button>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
