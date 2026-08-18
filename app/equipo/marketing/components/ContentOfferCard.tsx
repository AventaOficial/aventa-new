'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Sparkles,
  Video,
} from 'lucide-react';
import StatusBadge from '@/app/components/panel/StatusBadge';
import { buildMarketingCopyText, type MarketingContentCard } from '@/lib/staff/marketingPipeline';
import type { MarketingContentStatus } from '@/lib/staff/marketingPipeline';
import { buildOfferPublicPath } from '@/lib/offerPath';

function formatMoney(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

const POTENTIAL_TONE = {
  alta: 'ok' as const,
  media: 'attention' as const,
  baja: 'neutral' as const,
};

const NEXT_STATUS: Partial<Record<MarketingContentStatus | 'null', MarketingContentStatus>> = {
  null: 'ideas',
  ideas: 'to_film',
  to_film: 'editing',
  editing: 'published',
};

export default function ContentOfferCard({
  card,
  acting,
  onSetStatus,
  onRemove,
}: {
  card: MarketingContentCard;
  acting: boolean;
  onSetStatus: (offerId: string, status: MarketingContentStatus, extra?: { videoUrl?: string; videoTitle?: string; videoNetwork?: string }) => void;
  onRemove: (offerId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [videoUrl, setVideoUrl] = useState(card.videoUrl ?? '');
  const [videoTitle, setVideoTitle] = useState(card.title.slice(0, 80));
  const [videoNetwork, setVideoNetwork] = useState<'tiktok' | 'instagram' | 'x' | ''>('tiktok');

  const copyInfo = async () => {
    await navigator.clipboard.writeText(buildMarketingCopyText(card));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentStatus = card.pipelineStatus;
  const next = NEXT_STATUS[currentStatus ?? 'null'];

  return (
    <article className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#141414]/90 overflow-hidden aventa-lift flex flex-col">
      <div className="relative">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageUrl} alt="" className="h-36 w-full object-cover bg-gray-100 dark:bg-gray-900" />
        ) : (
          <div className="h-36 bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
            <Video className="h-8 w-8 text-gray-300" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          <StatusBadge tone={POTENTIAL_TONE[card.potential]} className="!text-[10px]">
            <Sparkles className="h-3 w-3" />
            {card.potential === 'alta' ? 'Alto potencial' : card.potential === 'media' ? 'Medio' : 'Explorar'}
          </StatusBadge>
          {card.discountPercent != null ? (
            <StatusBadge tone="ok" className="!text-[10px]">-{card.discountPercent}%</StatusBadge>
          ) : null}
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-2">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{card.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{card.store}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {formatMoney(card.price)}
          </span>
          {card.originalPrice != null ? (
            <span className="text-xs text-gray-400 line-through tabular-nums">{formatMoney(card.originalPrice)}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] text-gray-500 dark:text-gray-400">
          {card.clicks7d != null ? <span>{card.clicks7d} clics / 7d</span> : <span>Sin clics aún</span>}
          {card.pipelineStatus ? (
            <span className="text-emerald-600 dark:text-emerald-400 capitalize">{card.pipelineStatus.replace('_', ' ')}</span>
          ) : null}
        </div>

        <div className="mt-auto pt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={acting}
            onClick={() => void copyInfo()}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copiado' : 'Copiar info'}
          </button>
          <Link
            href={buildOfferPublicPath(card.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Ver oferta
          </Link>
          {card.offerUrl ? (
            <a
              href={card.offerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            >
              <ExternalLink className="h-3 w-3" />
              Tienda
            </a>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          {!currentStatus ? (
            <button
              type="button"
              disabled={acting}
              onClick={() => onSetStatus(card.id, 'ideas')}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50"
            >
              Seleccionar
            </button>
          ) : null}
          {next && currentStatus !== 'published' ? (
            <button
              type="button"
              disabled={acting}
              onClick={() => {
                if (next === 'published') setShowPublish(true);
                else onSetStatus(card.id, next);
              }}
              className="rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50"
            >
              {next === 'to_film' ? 'Para grabar' : next === 'editing' ? 'En edición' : 'Marcar publicado'}
            </button>
          ) : null}
          {currentStatus ? (
            <button
              type="button"
              disabled={acting}
              onClick={() => onRemove(card.id)}
              className="rounded-lg text-[11px] text-gray-500 hover:text-red-600 px-2 py-1.5"
            >
              Quitar
            </button>
          ) : null}
        </div>
      </div>

      {showPublish ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowPublish(false)}>
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl p-5 max-w-md w-full border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Marcar como publicado</h3>
            <p className="text-xs text-gray-500 mt-1">Opcional: registra el enlace del video en AVENTA.</p>
            <label className="block mt-3 text-xs font-medium text-gray-700 dark:text-gray-300">
              URL del video
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.tiktok.com/..."
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] px-3 py-2 text-sm"
              />
            </label>
            <label className="block mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
              Título
              <input
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] px-3 py-2 text-sm"
              />
            </label>
            <label className="block mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
              Red
              <select
                value={videoNetwork}
                onChange={(e) => setVideoNetwork(e.target.value as typeof videoNetwork)}
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] px-3 py-2 text-sm"
              >
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
                <option value="x">X</option>
              </select>
            </label>
            <div className="mt-4 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowPublish(false)} className="text-sm text-gray-500 px-3 py-2">
                Cancelar
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => {
                  onSetStatus(card.id, 'published', {
                    videoUrl: videoUrl.trim() || undefined,
                    videoTitle: videoTitle.trim(),
                    videoNetwork,
                  });
                  setShowPublish(false);
                }}
                className="rounded-xl bg-emerald-600 text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
              >
                Publicado
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}