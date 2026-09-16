'use client';

import { ExternalLink } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { computeMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';
import { formatModerationRelativeTime } from '@/lib/moderation/relativeTime';
import { getOfferDiscountPercent } from '@/lib/moderation/relativeTime';
import { parseBotMeta } from '@/lib/moderation/botFacts';
import type { FocusModerationOffer } from '@/lib/moderation/focusTypes';
import { cn } from '@/app/components/panel/utils';

type Props = {
  offer: FocusModerationOffer;
  mode: ModerationHubMode;
  onEdit: () => void;
  onOpenWhy: () => void;
};

/**
 * Contexto de decisión solo desktop/tablet (≥ md).
 * Mobile no lo renderiza — el Focus móvil permanece minimal.
 */
export default function FocusDesktopContext({ offer, mode, onEdit, onOpenWhy }: Props) {
  const ui = moderationUi(mode);
  const monetization = computeMonetizationReadiness({
    offerUrl: offer.offer_url,
    originalOfferUrl: offer.original_offer_url,
    linkModOk: offer.link_mod_ok,
  });
  const pct = getOfferDiscountPercent(offer.price, offer.original_price);
  const meta = parseBotMeta(offer.bot_meta);
  const age = formatModerationRelativeTime(offer.created_at);
  const desc = offer.description?.trim() || null;

  return (
    <aside
      className={cn(
        'hidden md:flex md:w-[280px] lg:w-[320px] shrink-0 flex-col gap-4 rounded-2xl border p-4 text-left',
        ui.border,
        ui.ws ? 'bg-white/70 dark:bg-white/[0.03]' : 'bg-white/[0.04]'
      )}
      data-focus-desktop-context
    >
      <section>
        <p className={cn('text-[10px] font-semibold uppercase tracking-wider', ui.label)}>
          Decisión
        </p>
        <dl className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className={ui.muted}>Precio</dt>
            <dd className={cn('tabular-nums font-semibold', ui.title)}>
              ${Number(offer.price).toLocaleString('es-MX')}
            </dd>
          </div>
          {offer.original_price != null && Number(offer.original_price) > Number(offer.price) ? (
            <div className="flex justify-between gap-2">
              <dt className={ui.muted}>Referencia</dt>
              <dd className={cn('tabular-nums', ui.soft)}>
                ${Number(offer.original_price).toLocaleString('es-MX')}
                {pct > 0 ? ` · ${pct}%` : ''}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-2">
            <dt className={ui.muted}>Monetización</dt>
            <dd className={cn('font-medium', ui.body)}>{monetization.label}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className={ui.muted}>Categoría</dt>
            <dd className={ui.body}>{offer.category?.trim() || '—'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className={ui.muted}>Edad</dt>
            <dd className={ui.soft}>{age}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className={ui.muted}>Claim</dt>
            <dd className={cn('font-medium', ui.body)} data-focus-claim-ownership>
              {offer.locked_by
                ? offer.locked_by_name?.trim() || 'Activo'
                : 'Sin claim'}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <p className={cn('text-[10px] font-semibold uppercase tracking-wider', ui.label)}>
          Contexto
        </p>
        <ul className={cn('mt-2 space-y-1 text-xs leading-relaxed', ui.muted)}>
          <li>Fuente: {offer.is_bot ? 'Bot' : 'Cazador'}</li>
          {offer.store?.trim() ? <li>Tienda: {offer.store.trim()}</li> : null}
          {offer.coupons?.trim() ? <li>Cupón: {offer.coupons.trim()}</li> : null}
          {meta?.decision ? <li>Decisión bot: {meta.decision}</li> : null}
          {meta?.signals?.effectiveDiscountPercent != null ? (
            <li>Dto. efectivo: {Number(meta.signals.effectiveDiscountPercent)}%</li>
          ) : null}
          {meta?.signals?.suspectedArtificialListPrice === true ? (
            <li>Precio lista sospechoso</li>
          ) : null}
        </ul>
        {desc ? (
          <p className={cn('mt-2 line-clamp-4 text-xs leading-relaxed', ui.soft)}>{desc}</p>
        ) : (
          <p className={cn('mt-2 text-xs', ui.faint)}>Sin descripción</p>
        )}
      </section>

      <section className={cn('mt-auto space-y-2 border-t pt-3', ui.border)}>
        <p className={cn('text-[10px] font-semibold uppercase tracking-wider', ui.label)}>
          Acciones
        </p>
        <button
          type="button"
          onClick={onEdit}
          className={cn(
            'w-full rounded-xl px-3 py-2 text-sm font-semibold',
            ui.ws
              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
              : 'bg-violet-500 text-white hover:bg-violet-400'
          )}
          data-focus-edit-offer
        >
          Editar oferta
        </button>
        <button
          type="button"
          onClick={onOpenWhy}
          className={cn('w-full rounded-xl px-3 py-2 text-sm font-medium', ui.btnGhost)}
        >
          Ver detalle técnico
        </button>
        {offer.offer_url?.trim() ? (
          <a
            href={offer.offer_url.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm',
              ui.soft
            )}
          >
            Abrir URL <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </section>
    </aside>
  );
}
