'use client';

import { Clock, ShieldAlert, FileWarning } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '../moderation/moderationUi';
import { hasModerationSummaryActivity } from '@/lib/moderation/moderationSessionSummary';

export type ModerationSessionSummary = {
  since: string;
  newOffers: number;
  lowTrustOffers: number;
  newReports: number;
  lockedNow: number;
};

type Props = {
  mode?: ModerationHubMode;
  summary: ModerationSessionSummary;
  onDismiss: () => void;
};

function formatSince(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'tu última visita';
  return d.toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ModerationTurnSummaryModal({
  mode = 'admin',
  summary,
  onDismiss,
}: Props) {
  const ui = moderationUi(mode);
  const hasActivity = hasModerationSummaryActivity(summary);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        className={`w-full max-w-md ${ui.modal} p-5`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="moderation-turn-summary-title"
      >
        <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${ui.label}`}>
          Resumen de turno
        </p>
        <h2 id="moderation-turn-summary-title" className={`mt-1 text-xl font-semibold ${ui.title}`}>
          Desde {formatSince(summary.since)}
        </h2>
        <p className={`mt-2 text-sm ${ui.subtitle}`}>
          {hasActivity
            ? 'Novedades en la cola desde tu última sesión.'
            : 'Sin novedades relevantes desde tu última sesión.'}
        </p>

        <ul className="mt-4 space-y-2">
          <li className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${ui.border} ${ui.thumbBg}`}>
            <span className={`flex items-center gap-2 text-sm ${ui.body}`}>
              <Clock className={`h-4 w-4 ${ui.iconMuted}`} aria-hidden />
              Nuevas en cola
            </span>
            <span className={`text-lg font-semibold tabular-nums ${ui.title}`}>{summary.newOffers}</span>
          </li>
          <li className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${ui.border} ${ui.thumbBg}`}>
            <span className={`flex items-center gap-2 text-sm ${ui.body}`}>
              <ShieldAlert className={`h-4 w-4 text-amber-500`} aria-hidden />
              Confianza baja
            </span>
            <span className={`text-lg font-semibold tabular-nums ${ui.title}`}>
              {summary.lowTrustOffers}
            </span>
          </li>
          <li className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${ui.border} ${ui.thumbBg}`}>
            <span className={`flex items-center gap-2 text-sm ${ui.body}`}>
              <FileWarning className={`h-4 w-4 text-red-500`} aria-hidden />
              Reportes nuevos
            </span>
            <span className={`text-lg font-semibold tabular-nums ${ui.title}`}>{summary.newReports}</span>
          </li>
        </ul>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className={`rounded-full px-4 py-2 text-sm font-semibold text-white ${
              ui.ws ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-violet-600 hover:bg-violet-500'
            }`}
          >
            Empezar moderación
          </button>
        </div>
      </div>
    </div>
  );
}
