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
};

const STATUS_LABEL: Record<PreviewOffer['dealStatus'], string> = {
  approved: 'Activa',
  pending: 'En revisión',
  rejected: 'Rechazada',
  expired: 'Expirada',
};

const quietLink =
  'rounded-md text-[13px] text-[#6e6e73] transition-colors duration-150 hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1f] dark:text-[#a3a3a3] dark:hover:text-[#fafafa] dark:focus-visible:ring-[#fafafa]';

type HunterOffersPreviewProps = {
  offers: PreviewOffer[];
  published: number;
  approved: number;
};

function offerMeta(offer: PreviewOffer): string | null {
  const price = offer.discountPrice;
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const discount = offerDiscountPercent(price, offer.originalPrice ?? null);
  const formatted = formatPriceMXN(price);
  return discount == null ? formatted : `${formatted} · -${discount}%`;
}

export default function HunterOffersPreview({ offers, published, approved }: HunterOffersPreviewProps) {
  const preview = offers.slice(0, 3);

  return (
    <section aria-label="Tus ofertas" className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Mis ofertas</h2>
        <div className="flex items-center gap-4">
          <Link href="/me/favorites" className={quietLink}>
            Guardadas
          </Link>
          <Link href="/me/ofertas" className={quietLink}>
            Ver mis ofertas
          </Link>
        </div>
      </div>
      <div className="grid max-w-xs grid-cols-2 gap-8">
        <div>
          <p className="text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Publicadas</p>
          <p className="mt-1 text-[28px] font-semibold tabular-nums leading-none text-[#1d1d1f] dark:text-[#fafafa]">{published}</p>
        </div>
        <div>
          <p className="text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Activas</p>
          <p className="mt-1 text-[28px] font-semibold tabular-nums leading-none text-[#1d1d1f] dark:text-[#fafafa]">{approved}</p>
        </div>
      </div>
      {preview.length === 0 ? (
        <p className="text-[15px] text-[#6e6e73] dark:text-[#a3a3a3]">Nada publicado. ¿Cazamos una oferta?</p>
      ) : (
        <ul>
          {preview.map((offer) => {
            const meta = offerMeta(offer);
            return (
              <li key={offer.id} className="border-b border-black/5 last:border-0 dark:border-white/10">
                <Link
                  href={buildOfferPublicPath(offer.id, offer.title)}
                  className="flex items-center justify-between gap-4 py-3 transition-colors duration-150 hover:text-[#6e6e73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1f] dark:hover:text-[#a3a3a3] dark:focus-visible:ring-[#fafafa]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">{offer.title}</span>
                    {meta ? <span className="mt-0.5 block text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{meta}</span> : null}
                  </span>
                  <span className="shrink-0 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{STATUS_LABEL[offer.dealStatus]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
