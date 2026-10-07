'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Eye, Heart, MessageCircle, ThumbsUp, X } from 'lucide-react';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';
import { ALL_CATEGORIES } from '@/lib/categories';
import { presentOfferPrice } from '@/lib/formatPrice';
import { offerDiscountPercent } from '@/lib/me/offerPresentation';
import { buildOfferPublicPath } from '@/lib/offerPath';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type OfferDrawerModel = {
  id: string;
  title: string;
  store: string | null;
  price: number | null;
  originalPrice: number | null;
  image: string | null;
  offerUrl: string | null;
  sourceCurrency?: string | null;
  category: string | null;
  hunterComment: string | null;
  upvotes: number | null;
  comments: number | null;
  favorites: number | null;
  createdAt: string | null;
  dealStatus: DealStatus;
  rejectionReason?: string | null;
  views?: number | null;
};

const STATUS_LABEL: Record<DealStatus, string> = {
  approved: 'Aprobada',
  pending: 'En revisión',
  rejected: 'Rechazada',
  expired: 'Expirada',
};

const STATUS_TONE: Record<DealStatus, string> = {
  approved: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
  pending: 'bg-amber-50 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100',
  rejected: 'bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-100',
  expired: 'bg-[#f4f2fb] text-[#3a3550] dark:bg-white/10 dark:text-white/80',
};

function categoryLabel(value: string | null): string | null {
  if (!value) return null;
  return ALL_CATEGORIES.find((item) => item.value === value)?.label ?? null;
}

function when(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OfferDetailDrawer({
  offer,
  onClose,
}: {
  offer: OfferDrawerModel;
  onClose: () => void;
}) {
  useBodyScrollLock(true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const discount = offerDiscountPercent(offer.price, offer.originalPrice);
  const previous = offer.originalPrice != null && offer.price != null && offer.originalPrice > offer.price ? offer.originalPrice : null;
  const category = categoryLabel(offer.category);
  const date = when(offer.createdAt);
  const publicPage = offer.dealStatus === 'approved' || offer.dealStatus === 'expired';
  const reason = offer.rejectionReason?.trim() || null;
  const statusNote =
    offer.dealStatus === 'approved'
      ? 'Ya está publicada. Esto es lo que ha generado.'
      : offer.dealStatus === 'pending'
        ? 'Tu oferta está en proceso de revisión.'
        : offer.dealStatus === 'expired'
          ? 'Esta oferta ya no está vigente.'
          : reason;
  const metrics = [
    ...(typeof offer.views === 'number' ? [{ icon: Eye, label: 'Vistas', value: offer.views as number | null }] : []),
    { icon: ThumbsUp, label: 'Votos', value: offer.upvotes },
    { icon: MessageCircle, label: 'Comentarios', value: offer.comments },
    { icon: Heart, label: 'Favoritos', value: offer.favorites },
  ];

  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" aria-label="Cerrar detalle" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-drawer-title"
        className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-3xl bg-white shadow-2xl dark:bg-[#141414] md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-none md:w-[min(100%,32rem)] md:rounded-none"
      >
        <div className="flex items-center justify-end px-4 pt-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:px-6">
          {offer.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={offer.image} alt="" className="aspect-[4/3] w-full rounded-3xl object-cover" />
          ) : (
            <div className="aspect-[4/3] w-full rounded-3xl bg-[#f5f5f7] dark:bg-white/5" />
          )}
          {offer.store ? <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.14em] text-[#6e6e73] dark:text-[#a3a3a3]">{offer.store}</p> : null}
          <h2 id="offer-drawer-title" className="mt-1 text-[26px] font-semibold leading-snug tracking-tight">
            {offer.title}
          </h2>
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
            {offer.price != null ? <p className="text-[32px] font-semibold tabular-nums leading-none">{presentOfferPrice(offer.price, offer.sourceCurrency)}</p> : null}
            {previous != null ? <p className="pb-0.5 text-[15px] tabular-nums text-[#6e6e73] line-through dark:text-[#a3a3a3]">{presentOfferPrice(previous, offer.sourceCurrency)}</p> : null}
            {discount != null ? <p className="mb-0.5 rounded-full bg-violet-600 px-2 py-0.5 text-[13px] font-semibold text-white">−{discount}%</p> : null}
          </div>
          <div className={`mt-4 rounded-2xl px-4 py-3 ${STATUS_TONE[offer.dealStatus]}`}>
            <p className="text-[13px] font-semibold">{STATUS_LABEL[offer.dealStatus]}</p>
            {statusNote ? <p className="mt-1 text-[14px] leading-relaxed">{statusNote}</p> : null}
          </div>
          <dl className={`mt-4 grid gap-2 ${metrics.length > 3 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {metrics.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl bg-[#f5f5f7] px-3 py-3 dark:bg-white/5">
                  <Icon className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden />
                  <dt className="mt-2 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">{item.label}</dt>
                  <dd className="text-[22px] font-semibold tabular-nums leading-none">{item.value == null ? '—' : item.value}</dd>
                </div>
              );
            })}
          </dl>
          {offer.hunterComment || category || date ? (
            <dl className="mt-4 space-y-3 rounded-2xl border border-black/[0.06] px-4 py-3 text-[14px] dark:border-white/10">
              {offer.hunterComment ? (
                <div>
                  <dt className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">Comentario</dt>
                  <dd className="mt-1 leading-relaxed">{offer.hunterComment}</dd>
                </div>
              ) : null}
              {category ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[#6e6e73] dark:text-[#a3a3a3]">Categoría</dt>
                  <dd className="text-right">{category}</dd>
                </div>
              ) : null}
              {date ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[#6e6e73] dark:text-[#a3a3a3]">Fecha</dt>
                  <dd className="text-right">{date}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <div className="mt-6 flex flex-col gap-2">
            {publicPage ? (
              <Link
                href={buildOfferPublicPath(offer.id, offer.title)}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-4 text-[14px] font-semibold text-white hover:bg-violet-500"
              >
                Ver oferta
              </Link>
            ) : null}
            {offer.offerUrl ? (
              <a
                href={offer.offerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-black/10 px-4 text-[14px] font-semibold dark:border-white/15"
              >
                Comprobar oferta
              </a>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
