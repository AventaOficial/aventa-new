'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BarChart3 } from 'lucide-react';
import OfferAdvancedMetricsModal from '@/app/components/OfferAdvancedMetricsModal';
import OfferMedia from '@/app/components/offers/OfferMedia';
import { buildOfferPublicPath } from '@/lib/offerPath';
import { presentOfferPrice } from '@/lib/formatPrice';
import { offerDiscountPercent } from '@/lib/me/offerPresentation';

type PreviewOffer = {
  id: string;
  title: string;
  dealStatus: 'pending' | 'approved' | 'rejected' | 'expired';
  discountPrice?: number | null;
  originalPrice?: number | null;
  image?: string | null;
  store?: string | null;
  sourceCurrency?: string | null;
  createdAt?: string | null;
  upvotes?: number | null;
};

const STATUS_LABEL: Record<PreviewOffer['dealStatus'], string> = {
  approved: 'Aprobada',
  pending: 'En revisión',
  rejected: 'Rechazada',
  expired: 'Expirada',
};

const quietLink =
  'rounded-md text-[13px] font-medium text-violet-600 transition-colors duration-150 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400 dark:hover:text-violet-300';

function listDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function offerMeta(offer: PreviewOffer): { price: string | null; discount: number | null } {
  const price = offer.discountPrice;
  if (price == null || !Number.isFinite(price) || price <= 0) return { price: null, discount: null };
  return {
    price: presentOfferPrice(price, offer.sourceCurrency),
    discount: offerDiscountPercent(price, offer.originalPrice ?? null),
  };
}

/** La página pública solo carga ofertas aprobadas (incluidas las expiradas). */
function hasPublicPage(status: PreviewOffer['dealStatus']): boolean {
  return status === 'approved' || status === 'expired';
}

type HunterOffersPreviewProps = {
  offers: PreviewOffer[];
  published: number;
  approved: number;
  limit?: number;
  onPublish?: () => void;
};

export default function HunterOffersPreview({ offers, limit = 3, onPublish }: HunterOffersPreviewProps) {
  const preview = offers.slice(0, limit);
  const [metricsOfferId, setMetricsOfferId] = useState<string | null>(null);

  return (
    <section aria-label="Tus ofertas" className="rounded-2xl border border-black/[0.04] bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#141414] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Mis ofertas</h2>
          <p className="mt-0.5 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
            {preview.length === 0 ? 'Tus ofertas más recientes' : 'Toca una oferta para ver sus métricas'}
          </p>
        </div>
        <Link href="/me/ofertas" className={`${quietLink} shrink-0 ${preview.length === 0 ? 'hidden sm:inline' : 'inline-flex min-h-11 items-center sm:inline sm:min-h-0'}`}>
          Ver todas
        </Link>
      </div>
      {preview.length === 0 ? (
        <>
          <div className="mt-3 sm:hidden">
            <p className="text-[15px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">Nada publicado aún.</p>
            <p className="mt-1 text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">¿Cazamos una oferta?</p>
            {onPublish ? (
              <button
                type="button"
                onClick={onPublish}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-5 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-violet-700 active:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#141414]"
              >
                Subir mi primera oferta
              </button>
            ) : null}
          </div>
          <div className="mt-4 hidden items-center justify-between gap-3 sm:flex">
            <p className="text-[15px] text-[#6e6e73] dark:text-[#a3a3a3]">Nada publicado. ¿Cazamos una oferta?</p>
            {onPublish ? (
              <button
                type="button"
                onClick={onPublish}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-violet-700 active:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#141414]"
              >
                Subir oferta
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <ul className="-mx-1.5 mt-2">
          {preview.map((offer) => {
            const meta = offerMeta(offer);
            const when = listDate(offer.createdAt);
            const statusClass =
              offer.dealStatus === 'approved'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : offer.dealStatus === 'pending'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                  : 'bg-black/5 text-[#6e6e73] dark:bg-white/10 dark:text-[#a3a3a3]';
            return (
              <li key={offer.id} className="flex items-center gap-1 border-b border-black/5 last:border-0 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setMetricsOfferId(offer.id)}
                  aria-haspopup="dialog"
                  aria-label={`Ver métricas de ${offer.title}`}
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-3 text-left transition-colors duration-150 hover:bg-black/[0.025] active:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 dark:hover:bg-white/[0.04] dark:active:bg-white/[0.06]"
                >
                  <OfferMedia
                    src={offer.image}
                    alt=""
                    sizes="48px"
                    ratioClass="aspect-square"
                    compact
                    className="h-12 w-12 shrink-0 rounded-xl"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium leading-tight text-[#1d1d1f] dark:text-[#fafafa]">{offer.title}</span>
                    {offer.store || meta.price ? (
                      <span className="mt-1 block truncate text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
                        {offer.store || 'Tienda'}
                        {meta.price ? ` · ${meta.price}` : ''}
                      </span>
                    ) : null}
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {meta.discount != null ? (
                        <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">-{meta.discount}%</span>
                      ) : null}
                      <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none ${statusClass}`}>{STATUS_LABEL[offer.dealStatus]}</span>
                      {offer.upvotes != null ? <span className="text-[11px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">{offer.upvotes} votos</span> : null}
                    </span>
                  </span>
                  {when ? <span className="hidden shrink-0 text-[12px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3] md:block">{when}</span> : null}
                  <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#6e6e73] transition-colors duration-150 group-hover:text-violet-600 dark:text-[#a3a3a3] dark:group-hover:text-violet-400">
                    <BarChart3 className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Métricas</span>
                  </span>
                </button>
                {hasPublicPage(offer.dealStatus) ? (
                  <Link
                    href={buildOfferPublicPath(offer.id, offer.title)}
                    aria-label={`Ver publicación de ${offer.title}`}
                    title="Ver publicación"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#6e6e73] transition-colors duration-150 hover:bg-black/[0.04] hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-[#a3a3a3] dark:hover:bg-white/[0.06] dark:hover:text-[#fafafa]"
                  >
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </Link>
                ) : (
                  <span className="h-11 w-11 shrink-0" aria-hidden />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {metricsOfferId ? (
        <OfferAdvancedMetricsModal offerId={metricsOfferId} onClose={() => setMetricsOfferId(null)} />
      ) : null}
    </section>
  );
}
