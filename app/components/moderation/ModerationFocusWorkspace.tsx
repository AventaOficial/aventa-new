'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import type { FocusSourceTab } from '@/lib/moderation/focusTypes';
import { useModerationFocusQueue } from '@/lib/hooks/useModerationFocusQueue';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { formatModerationRelativeTime } from '@/lib/moderation/relativeTime';
import { cn } from '@/app/components/panel/utils';
import FocusOfferStage from './FocusOfferStage';
import FocusActionsBar from './FocusActionsBar';
import FocusRejectSheet from './FocusRejectSheet';
import FocusDetailsDrawer from './FocusDetailsDrawer';
import FocusShortcutsHint from './FocusShortcutsHint';

export type ModerationFocusWorkspaceProps = {
  mode?: ModerationHubMode;
  /** all | bot | users (cazadores) */
  sourceTab?: FocusSourceTab;
};

export default function ModerationFocusWorkspace({
  mode = 'admin',
  sourceTab = 'all',
}: ModerationFocusWorkspaceProps) {
  const ui = moderationUi(mode);
  const queue = useModerationFocusQueue({ sourceTab });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === 'Escape') {
        setRejectOpen(false);
        setWhyOpen(false);
        return;
      }
      if (rejectOpen || whyOpen || queue.acting || queue.loading) return;

      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        void queue.approve();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setRejectOpen(true);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        void queue.snooze(60);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        queue.goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        void queue.goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queue, rejectOpen, whyOpen]);

  const oldestLabel = queue.oldestCreatedAt
    ? formatModerationRelativeTime(queue.oldestCreatedAt).replace(/^Hace /, '')
    : null;

  const filterHref = (tab: FocusSourceTab) => {
    if (mode === 'workspace') {
      if (tab === 'bot') return '/equipo/moderacion/bot';
      if (tab === 'users') return '/equipo/moderacion/cazadores';
      return '/equipo/moderacion';
    }
    return '/admin/moderation';
  };

  return (
    <div className="relative mx-auto flex min-h-[min(100dvh-8rem,900px)] w-full max-w-2xl flex-col px-4 pb-28 pt-2 md:pb-8">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className={cn('text-xl font-semibold tracking-tight md:text-2xl', ui.title)}>
            Moderación
          </h1>
          <p className={cn('mt-1 text-sm', ui.soft)}>
            {queue.stats.globalPending > 0
              ? `${queue.stats.globalPending} por revisar`
              : queue.loading
                ? 'Cargando…'
                : 'Nada pendiente'}
            {oldestLabel ? (
              <span className={cn('ml-2', ui.faint)}>· la más antigua: {oldestLabel}</span>
            ) : null}
          </p>
        </div>
        <FocusShortcutsHint mode={mode} />
      </header>

      {mode === 'workspace' ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {(
            [
              { id: 'all' as const, label: 'Por revisar', href: filterHref('all') },
              { id: 'bot' as const, label: 'Bot', href: filterHref('bot') },
              { id: 'users' as const, label: 'Cazadores', href: filterHref('users') },
            ] as const
          ).map((f) => (
            <a
              key={f.id}
              href={f.href}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                sourceTab === f.id ? ui.chipActive : cn(ui.btnGhost, 'border')
              )}
            >
              {f.label}
            </a>
          ))}
        </div>
      ) : null}

      {queue.error ? (
        <p
          className={cn(
            'mb-3 rounded-xl px-3 py-2 text-sm',
            ui.ws
              ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
              : 'bg-amber-500/15 text-amber-100'
          )}
          role="status"
        >
          {queue.error}
        </p>
      ) : null}

      {queue.needsAffiliateConfirm && queue.offer ? (
        <div
          className={cn(
            'mb-4 rounded-2xl border px-4 py-3 text-left',
            ui.border,
            ui.ws ? 'bg-amber-50/80 dark:bg-amber-950/30' : 'bg-amber-500/10'
          )}
        >
          <p className={cn('text-sm font-medium', ui.body)}>Falta confirmar el enlace</p>
          <p className={cn('mt-1 text-xs', ui.muted)}>
            Esta tienda requiere validar el enlace afiliado antes de publicar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={queue.acting}
              onClick={() => void queue.confirmAffiliateAndApprove()}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50',
                ui.ws ? 'bg-emerald-600' : 'bg-violet-500'
              )}
            >
              Confirmar y aprobar
            </button>
            <button
              type="button"
              onClick={queue.dismissAffiliateGate}
              className={cn('rounded-full px-3 py-2 text-sm', ui.btnGhost)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col">
        {queue.loading && !queue.offer ? (
          <div className={cn('flex flex-1 items-center justify-center py-24 text-sm', ui.muted)}>
            Buscando la siguiente oferta…
          </div>
        ) : !queue.offer ? (
          <div className={cn('flex flex-1 flex-col items-center justify-center py-24', ui.emptyDash)}>
            <p className={cn('text-base font-medium', ui.title)}>Todo al día</p>
            <p className={cn('mt-1 text-sm', ui.muted)}>No hay ofertas por revisar ahora.</p>
          </div>
        ) : (
          <>
            <p className={cn('mb-4 text-center text-xs tabular-nums', ui.faint)}>
              Oferta {queue.position} de {queue.total}
            </p>
            <FocusOfferStage
              offer={queue.offer}
              mode={mode}
              onOpenWhy={() => setWhyOpen(true)}
            />
          </>
        )}
      </div>

      {queue.offer ? (
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 backdrop-blur-md md:static md:mt-8 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none',
            ui.ws
              ? 'border-black/[0.06] bg-white/90 dark:border-white/10 dark:bg-[#0a0f0c]/90'
              : 'border-white/10 bg-[#0c0a12]/92'
          )}
        >
          <FocusActionsBar
            mode={mode}
            acting={queue.acting}
            onReject={() => setRejectOpen(true)}
            onApprove={() => void queue.approve()}
            onSnooze={(m) => void queue.snooze(m)}
          />
          <div className="mt-3 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={queue.goPrev}
              disabled={queue.acting}
              className={cn('inline-flex items-center gap-1 text-sm disabled:opacity-40', ui.soft)}
            >
              <ChevronLeft className="h-4 w-4" /> anterior
            </button>
            <button
              type="button"
              onClick={() => void queue.goNext()}
              disabled={queue.acting}
              className={cn('inline-flex items-center gap-1 text-sm disabled:opacity-40', ui.soft)}
            >
              siguiente <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <FocusRejectSheet
        open={rejectOpen}
        mode={mode}
        acting={queue.acting}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => {
          setRejectOpen(false);
          void queue.reject(reason);
        }}
      />

      {queue.offer ? (
        <FocusDetailsDrawer
          open={whyOpen}
          offer={queue.offer}
          mode={mode}
          canEdit={queue.canAdvanced}
          onClose={() => setWhyOpen(false)}
        />
      ) : null}
    </div>
  );
}
