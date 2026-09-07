'use client';

import { ExternalLink, X } from 'lucide-react';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { computeModerationTrust } from '@/lib/moderation/confidenceBadge';
import { parseBotIngestScore } from '@/lib/moderation/confidenceBadge';
import ModerationBotFactsCard from '@/app/admin/components/ModerationBotFactsCard';
import type { FocusModerationOffer } from '@/lib/moderation/focusTypes';
import { computeMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';
import { cn } from '@/app/components/panel/utils';

type Props = {
  open: boolean;
  offer: FocusModerationOffer;
  mode: ModerationHubMode;
  canEdit?: boolean;
  onClose: () => void;
};

export default function FocusDetailsDrawer({ open, offer, mode, canEdit, onClose }: Props) {
  const ui = moderationUi(mode);
  if (!open) return null;

  const trust = computeModerationTrust({
    risk_score: offer.risk_score,
    moderator_comment: offer.moderator_comment,
    image_url: offer.image_url,
    category: offer.category,
    original_price: offer.original_price,
    price: offer.price,
    is_bot: offer.is_bot,
  });
  const ingest = parseBotIngestScore(offer.moderator_comment);
  const monetization = computeMonetizationReadiness({
    offerUrl: offer.offer_url,
    originalOfferUrl: offer.original_offer_url,
    linkModOk: offer.link_mod_ok,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Cerrar" onClick={onClose} />
      <aside
        className={cn(
          'relative z-10 flex h-full w-full max-w-md flex-col shadow-2xl',
          ui.ws ? 'bg-white dark:bg-[#0f1411]' : 'bg-[#121018]'
        )}
        role="dialog"
        aria-modal
        aria-labelledby="focus-why-title"
      >
        <div className={cn('flex items-center justify-between border-b px-4 py-4', ui.border)}>
          <h3 id="focus-why-title" className={cn('text-lg font-semibold', ui.title)}>
            Ver por qué
          </h3>
          <button type="button" onClick={onClose} className={cn('rounded-full p-2', ui.btnGhost)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <section>
            <p className={cn('text-xs font-semibold uppercase tracking-wider', ui.label)}>Resumen</p>
            <p className={cn('mt-1 text-sm', ui.body)}>{trust.label}</p>
            {ingest != null ? (
              <p className={cn('mt-1 text-sm tabular-nums', ui.muted)}>Score del bot: {ingest}/100</p>
            ) : null}
            {trust.riskScore != null ? (
              <p className={cn('text-sm tabular-nums', ui.muted)}>Riesgo: {trust.riskScore}/100</p>
            ) : null}
          </section>

          <section>
            <p className={cn('text-xs font-semibold uppercase tracking-wider', ui.label)}>
              Monetización
            </p>
            <p className={cn('mt-1 text-sm font-medium', ui.body)}>{monetization.label}</p>
            <p className={cn('mt-0.5 text-sm', ui.muted)}>{monetization.detail}</p>
          </section>

          <section>
            <p className={cn('mb-2 text-xs font-semibold uppercase tracking-wider', ui.label)}>
              Señales
            </p>
            <ModerationBotFactsCard
              mode={mode}
              store={offer.store}
              botMeta={offer.bot_meta}
              moderatorComment={offer.moderator_comment}
              variant="inline"
            />
          </section>

          <section className="space-y-2">
            <p className={cn('text-xs font-semibold uppercase tracking-wider', ui.label)}>Datos</p>
            {offer.category ? (
              <p className={cn('text-sm', ui.body)}>Categoría: {offer.category}</p>
            ) : (
              <p className={cn('text-sm', ui.muted)}>Sin categoría</p>
            )}
            {offer.offer_url ? (
              <a
                href={offer.offer_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('inline-flex items-center gap-1.5 text-sm font-medium', ui.soft)}
              >
                Abrir enlace <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <p className={cn('text-sm', ui.muted)}>Sin URL</p>
            )}
            {offer.original_offer_url?.trim() ? (
              <p className={cn('break-all text-[11px]', ui.faint)}>
                Original guardado (auditoría)
              </p>
            ) : (
              <p className={cn('text-[11px]', ui.faint)}>Original no disponible (histórico)</p>
            )}
            {canEdit ? (
              <p className={cn('text-xs', ui.faint)}>
                Edición avanzada: usa el panel de actualización de oferta desde Admin si necesitas
                corregir foto o categoría.
              </p>
            ) : null}
          </section>

          {offer.moderator_comment?.trim() ? (
            <section>
              <p className={cn('text-xs font-semibold uppercase tracking-wider', ui.label)}>
                Nota del sistema
              </p>
              <p className={cn('mt-1 break-words font-mono text-[11px] leading-relaxed', ui.faint)}>
                {offer.moderator_comment}
              </p>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
