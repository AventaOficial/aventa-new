'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import type { FocusSourceTab } from '@/lib/moderation/focusTypes';
import { useModerationFocusQueue } from '@/lib/hooks/useModerationFocusQueue';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { formatModerationRelativeTime } from '@/lib/moderation/relativeTime';
import { computeMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';
import { cn } from '@/app/components/panel/utils';
import FocusOfferStage from './FocusOfferStage';
import FocusActionsBar from './FocusActionsBar';
import FocusRejectSheet from './FocusRejectSheet';
import FocusDetailsDrawer from './FocusDetailsDrawer';
import FocusShortcutsHint from './FocusShortcutsHint';
import FocusAffiliatePrepare from './FocusAffiliatePrepare';

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
  const [userPrepare, setUserPrepare] = useState(false);
  const [seenOfferId, setSeenOfferId] = useState<string | null>(null);
  const currentOfferId = queue.offer?.id ?? null;
  if (currentOfferId !== seenOfferId) {
    setSeenOfferId(currentOfferId);
    setUserPrepare(false);
  }
  const prepareOpen = Boolean(queue.offer) && (userPrepare || queue.needsAffiliateConfirm);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === 'Escape') {
        setRejectOpen(false);
        setWhyOpen(false);
        setUserPrepare(false);
        queue.dismissAffiliateGate();
        return;
      }
      if (e.key === 'o' || e.key === 'O') {
        const href = queue.offer?.offer_url?.trim();
        if (href) {
          e.preventDefault();
          window.open(href, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      if (rejectOpen || whyOpen || prepareOpen || queue.acting || queue.loading) return;

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
  }, [queue, rejectOpen, whyOpen, prepareOpen]);

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

  const monetization = queue.offer
    ? computeMonetizationReadiness({
        offerUrl: queue.offer.offer_url,
        originalOfferUrl: queue.offer.original_offer_url,
        linkModOk: queue.offer.link_mod_ok,
      })
    : null;

  return (
    <div
      className={cn(
        'relative mx-auto flex w-full max-w-2xl flex-col px-4 pt-1',
        // Espacio fijo para la action bar + safe-area (también en desktop: la barra es fixed).
        prepareOpen
          ? 'pb-[calc(14rem+env(safe-area-inset-bottom,0px))]'
          : 'pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]'
      )}
      data-focus-workspace
    >
      <header className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className={cn('text-lg font-semibold tracking-tight md:text-xl', ui.title)}>
            Moderación
          </h1>
          <p className={cn('mt-0.5 text-xs md:text-sm', ui.soft)}>
            {queue.stats.globalPending > 0
              ? `${queue.stats.globalPending} por revisar`
              : queue.loading
                ? 'Cargando…'
                : 'Nada pendiente'}
            {oldestLabel ? (
              <span className={cn('ml-2', ui.faint)}>· más antigua: {oldestLabel}</span>
            ) : null}
          </p>
        </div>
        <FocusShortcutsHint mode={mode} />
      </header>

      {mode === 'workspace' ? (
        <div className="mb-3 flex flex-wrap gap-2">
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
            'mb-2 rounded-xl px-3 py-2 text-sm',
            ui.ws
              ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
              : 'bg-amber-500/15 text-amber-100'
          )}
          role="status"
        >
          {queue.error}
        </p>
      ) : null}

      <FocusAffiliatePrepare
        mode={mode}
        acting={queue.acting}
        open={prepareOpen}
        variant={monetization?.status === 'needs_attention' ? 'prepare' : 'replace'}
        onClose={() => {
          setUserPrepare(false);
          queue.dismissAffiliateGate();
        }}
        onSave={async (pasted) => {
          const result = await queue.prepareAffiliateLink(pasted);
          if (result.ok) setUserPrepare(false);
          return result;
        }}
      />

      <div className="flex flex-col">
        {queue.loading && !queue.offer ? (
          <div className={cn('flex items-center justify-center py-16 text-sm', ui.muted)}>
            Buscando la siguiente oferta…
          </div>
        ) : !queue.offer ? (
          <div className={cn('flex flex-col items-center justify-center py-16', ui.emptyDash)}>
            <p className={cn('text-base font-medium', ui.title)}>Todo al día</p>
            <p className={cn('mt-1 text-sm', ui.muted)}>No hay ofertas por revisar ahora.</p>
          </div>
        ) : (
          <>
            <p className={cn('mb-2 text-center text-[11px] tabular-nums', ui.faint)}>
              Oferta {queue.position} de {queue.total}
              {monetization ? ` · ${monetization.label}` : ''}
            </p>
            <FocusOfferStage
              offer={queue.offer}
              mode={mode}
              onOpenWhy={() => setWhyOpen(true)}
              onPrepareLink={() => setUserPrepare(true)}
            />
          </>
        )}
      </div>

      {queue.offer ? (
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-30 border-t px-4 pt-3 backdrop-blur-md',
            'pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]',
            ui.ws
              ? 'border-black/[0.06] bg-white/90 dark:border-white/10 dark:bg-[#0a0f0c]/90'
              : 'border-white/10 bg-[#0c0a12]/92'
          )}
          data-focus-actions-bar
        >
          <div className="mx-auto w-full max-w-lg">
            <FocusActionsBar
              mode={mode}
              acting={queue.acting}
              onReject={() => setRejectOpen(true)}
              onApprove={() => void queue.approve()}
              onSnooze={(m) => void queue.snooze(m)}
            />
            <div className="mt-2 flex items-center justify-center gap-6">
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
