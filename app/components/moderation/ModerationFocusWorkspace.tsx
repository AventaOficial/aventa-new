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
import FocusDesktopContext from './FocusDesktopContext';
import ModerationWorkspaceStats from '@/app/admin/moderation/ModerationWorkspaceStats';
import ModerationFixSheet from '@/app/admin/components/ModerationFixSheet';
import StoreBrandMark from '@/app/components/StoreBrandMark';

export type ModerationFocusWorkspaceProps = {
  mode?: ModerationHubMode;
  /** all | bot | users (cazadores) */
  sourceTab?: FocusSourceTab;
  /** Si está presente, los filtros de origen se quedan en esta ruta. */
  queueBasePath?: string;
};

export default function ModerationFocusWorkspace({
  mode = 'admin',
  sourceTab = 'all',
  queueBasePath,
}: ModerationFocusWorkspaceProps) {
  const ui = moderationUi(mode);
  // ?focus=<offerId> desde Pending health. Solo reordena la cola; el claim sigue igual.
  // Se lee de window para no forzar un Suspense boundary en páginas prerenderizadas.
  const [preferOfferId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('focus')
  );
  const queue = useModerationFocusQueue({ sourceTab, preferOfferId });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [userPrepare, setUserPrepare] = useState(false);
  const [seenOfferId, setSeenOfferId] = useState<string | null>(null);
  const currentOfferId = queue.offer?.id ?? null;
  if (currentOfferId !== seenOfferId) {
    setSeenOfferId(currentOfferId);
    setUserPrepare(false);
    setEditOpen(false);
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
        setEditOpen(false);
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

      if (rejectOpen || whyOpen || editOpen || prepareOpen || queue.acting || queue.loading) return;

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
  }, [queue, rejectOpen, whyOpen, editOpen, prepareOpen]);

  const oldestLabel = queue.oldestCreatedAt
    ? formatModerationRelativeTime(queue.oldestCreatedAt).replace(/^Hace /, '')
    : null;

  const filterHref = (tab: FocusSourceTab) => {
    if (queueBasePath) {
      const base = queueBasePath.replace(/\/$/, '');
      if (tab === 'bot') return `${base}?cola=bot`;
      if (tab === 'users') return `${base}?cola=users`;
      return base;
    }
    if (mode === 'workspace') {
      if (tab === 'bot') return '/equipo/moderacion/bot';
      if (tab === 'users') return '/equipo/moderacion/cazadores';
      return '/equipo/moderacion';
    }
    if (tab === 'bot') return '/admin/moderation/bot';
    if (tab === 'users') return '/admin/moderation/users';
    return '/admin/moderation';
  };

  const monetization = queue.offer
    ? computeMonetizationReadiness({
        offerUrl: queue.offer.offer_url,
        originalOfferUrl: queue.offer.original_offer_url,
        linkModOk: queue.offer.link_mod_ok,
      })
    : null;

  // Historial = snapshot de navegación; no es oferta editable. Lease/ownership siguen en servidor.
  const canEdit = !queue.viewingHistory;

  if (queue.viewingHistory && editOpen) {
    setEditOpen(false);
  }

  return (
    <div
      className="relative mx-auto flex w-full max-w-[1400px] flex-col px-1 pt-1 pb-8"
      data-focus-workspace
    >
      <header className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className={cn('text-2xl font-semibold tracking-tight', ui.title)}>
            Moderación
          </h1>
          <p className={cn('mt-0.5 text-sm', ui.soft)}>Revisa ofertas, comentarios y reportes.</p>
        </div>
        <FocusShortcutsHint mode={mode} />
      </header>

      <ModerationWorkspaceStats />

      <div className="mb-3 flex flex-wrap gap-2" data-moderation-origin-filter>
        {(
          [
            { id: 'all' as const, label: 'TODAS', href: filterHref('all') },
            { id: 'users' as const, label: 'USUARIOS', href: filterHref('users') },
            { id: 'bot' as const, label: 'BOT', href: filterHref('bot') },
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
            {queue.started ? 'Buscando la siguiente oferta…' : 'Cargando la cola…'}
          </div>
        ) : !queue.offer && !queue.started && queue.stats.availableEstimate > 0 ? (
          <div className={cn('flex flex-col items-center justify-center py-16', ui.emptyDash)}>
            <p className={cn('text-base font-medium', ui.title)}>
              {queue.stats.availableEstimate} disponibles para revisar
            </p>
            <p className={cn('mt-1 text-sm', ui.muted)}>
              Al empezar se te asigna la siguiente oferta y nadie más la toma mientras la revisas.
            </p>
            <button
              type="button"
              onClick={() => void queue.start()}
              disabled={queue.acting}
              className={cn('mt-4 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-40', ui.chipActive)}
            >
              Empezar a moderar
            </button>
          </div>
        ) : !queue.offer ? (
          <div className={cn('flex flex-col items-center justify-center py-16', ui.emptyDash)}>
            <p className={cn('text-base font-medium', ui.title)}>Todo al día</p>
            <p className={cn('mt-1 text-sm', ui.muted)}>No hay ofertas por revisar ahora.</p>
          </div>
        ) : (
          <>
            <p className={cn('mb-2 text-center text-[11px] tabular-nums md:text-left', ui.faint)}>
              {queue.sessionCounterLabel}
              {queue.viewingHistory ? (
                <span className={cn('ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', ui.chipActive)}>
                  Historial
                </span>
              ) : null}
              {queue.lastClaimKind === 'stale_reclaim' && !queue.viewingHistory ? (
                <span className={cn('ml-2', ui.faint)}>· recuperada</span>
              ) : null}
              {monetization ? ` · ${monetization.label}` : ''}
            </p>
            <div className="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
              <aside
                className={cn('hidden rounded-2xl border p-2 xl:block', ui.border, ui.heroBg)}
                aria-label="Oferta en revisión"
              >
                <div className={cn('rounded-xl border p-2', ui.rowActive)}>
                  <p className={cn('line-clamp-2 text-sm font-semibold', ui.title)}>{queue.offer.title}</p>
                  <p className={cn('mt-1 text-sm tabular-nums', ui.soft)}>
                    ${Number(queue.offer.price).toLocaleString('es-MX')}
                  </p>
                  {queue.offer.store?.trim() ? <StoreBrandMark store={queue.offer.store} className="mt-1 text-xs" /> : null}
                  <p className={cn('mt-1 text-[11px]', ui.faint)}>
                    {queue.offer.is_bot ? 'Bot' : 'Usuario'}
                    {oldestLabel ? ` · más antigua ${oldestLabel}` : ''}
                  </p>
                </div>
              </aside>
              <div className={cn('min-w-0 rounded-2xl border p-4', ui.border, ui.heroBg)}>
                <FocusOfferStage
                  key={queue.offer.id}
                  offer={queue.offer}
                  mode={mode}
                  onOpenWhy={() => setWhyOpen(true)}
                />
                <div className="mt-4" data-focus-actions-bar>
                  <FocusActionsBar
                    mode={mode}
                    acting={queue.acting}
                    disabled={queue.viewingHistory}
                    offerHref={queue.offer.offer_url}
                    changeLabel={
                      monetization?.status === 'needs_attention' ? 'Preparar enlace' : 'Cambiar enlace'
                    }
                    onChangeLink={() => setUserPrepare(true)}
                    onReject={() => setRejectOpen(true)}
                    onApprove={() => void queue.approve()}
                    onSnooze={(m) => void queue.snooze(m)}
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={queue.goPrev}
                      disabled={queue.acting}
                      className={cn('inline-flex items-center gap-1 text-sm disabled:opacity-40', ui.soft)}
                    >
                      <ChevronLeft className="h-4 w-4" /> Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => void queue.goNext()}
                      disabled={queue.acting}
                      className={cn('inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-white disabled:opacity-40', ui.ws ? 'bg-emerald-600' : 'bg-violet-500')}
                    >
                      Siguiente <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <FocusDesktopContext
                offer={queue.offer}
                mode={mode}
                canEdit={canEdit}
                onEdit={() => setEditOpen(true)}
                onOpenWhy={() => setWhyOpen(true)}
              />
            </div>
          </>
        )}
      </div>

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
          canEdit={canEdit}
          onClose={() => setWhyOpen(false)}
          onEdit={() => setEditOpen(true)}
        />
      ) : null}

      {queue.offer && editOpen && canEdit ? (
        <ModerationFixSheet
          mode={mode}
          offer={{
            id: queue.offer.id,
            title: queue.offer.title,
            price: queue.offer.price,
            original_price: queue.offer.original_price,
            description: queue.offer.description,
            coupons: queue.offer.coupons,
            bank_coupon: queue.offer.bank_coupon,
            msi_months: queue.offer.msi_months,
            image_url: queue.offer.image_url,
            image_urls: queue.offer.image_urls,
            offer_url: queue.offer.offer_url,
            category: queue.offer.category,
          }}
          onClose={() => setEditOpen(false)}
          onSaved={(result) => {
            setEditOpen(false);
            queue.applyOfferEditResult(result);
          }}
        />
      ) : null}
    </div>
  );
}
