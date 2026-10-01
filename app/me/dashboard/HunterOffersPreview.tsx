'use client';

import Link from 'next/link';
import { buildOfferPublicPath } from '@/lib/offerPath';
import { formatPriceMXN } from '@/lib/formatPrice';
import { offerDiscountPercent } from '@/lib/me/offerPresentation';

type PreviewOffer = {
  id: string;
  title: string;
  dealStatus: 'pending' | 'approved' | 'rejected' | 'expired';
  discountPrice?: number | null;
  originalPrice?: number | null;
  image?: string | null;
  store?: string | null;
  createdAt?: string | null;
};

const STATUS_LABEL: Record<PreviewOffer['dealStatus'], string> = {
  approved: 'Aprobada',
  pending: 'En revisión',
  rejected: 'Rechazada',
  expired: 'Expirada',
};

const quietLink =
  'rounded-md text-[13px] font-medium text-violet-600 transition-colors duration-150 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400';

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
    price: formatPriceMXN(price),
    discount: offerDiscountPercent(price, offer.originalPrice ?? null),
  };
}

type HunterOffersPreviewProps = {
  offers: PreviewOffer[];
  published: number;
  approved: number;
  limit?: number;
};

export default function HunterOffersPreview({ offers, limit = 3 }: HunterOffersPreviewProps) {
  const preview = offers.slice(0, limit);

  return (
    <section aria-label="Tus ofertas" className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Mis ofertas</h2>
          <p className="mt-0.5 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Tus ofertas más recientes</p>
        </div>
        <Link href="/me/ofertas" className={quietLink}>
          Ver todas
        </Link>
      </div>
      {preview.length === 0 ? (
        <p className="mt-4 text-[15px] text-[#6e6e73] dark:text-[#a3a3a3]">Nada publicado. ¿Cazamos una oferta?</p>
      ) : (
        <ul className="mt-2">
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
              <li key={offer.id} className="border-b border-black/5 last:border-0 dark:border-white/10">
                <Link
                  href={buildOfferPublicPath(offer.id, offer.title)}
                  className="flex items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  {offer.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={offer.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="h-12 w-12 shrink-0 rounded-xl bg-black/5 dark:bg-white/10" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">{offer.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2">
                      {offer.store ? <span className="text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{offer.store}</span> : null}
                      {meta.price ? <span className="text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{meta.price}</span> : null}
                      {meta.discount != null ? (
                        <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[12px] font-medium text-white">-{meta.discount}%</span>
                      ) : null}
                      <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${statusClass}`}>{STATUS_LABEL[offer.dealStatus]}</span>
                    </span>
                  </span>
                  {when ? <span className="hidden shrink-0 text-[13px] text-[#6e6e73] sm:block dark:text-[#a3a3a3]">{when}</span> : null}
                  <span className="shrink-0 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]" aria-hidden>→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
