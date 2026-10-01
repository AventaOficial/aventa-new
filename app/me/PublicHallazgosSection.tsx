'use client';

import { useMemo, useState } from 'react';
import type { CardOffer } from '@/lib/offers/transform';
import type { VoteMap, VoteValueMap, FavoriteMap } from '@/lib/offers/batchUserData';
import { formatPriceMXN } from '@/lib/formatPrice';
import { offerDiscountPercent } from '@/lib/me/offerPresentation';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type PublicHallazgoFilter = 'approved' | 'expired' | 'rejected';

type MappedOffer = CardOffer & { dealStatus: DealStatus; rejectionReason: string | null };

const FILTERS: Array<{ value: PublicHallazgoFilter; label: string }> = [
  { value: 'approved', label: 'Activas' },
  { value: 'expired', label: 'Expiradas' },
  { value: 'rejected', label: 'Rechazadas' },
];

type PublicHallazgosSectionProps = {
  offers: MappedOffer[];
  voteMap: VoteMap;
  voteValueMap: VoteValueMap;
  favoriteMap: FavoriteMap;
  onVoteChange: (offerId: string, value: 1 | -1 | 0, storedWeight?: number) => void;
  onOfferClick: (offer: MappedOffer) => void;
  approvedCount: number;
  expiredCount: number;
  rejectedCount: number;
  positiveVotesTotal: number | null;
};

/**
 * Vista previa del perfil público en /me:
 * historial de hallazgos con activas / expiradas / rechazadas.
 * Sin datos privados de recompensas.
 */
export default function PublicHallazgosSection({
  offers,
  onOfferClick,
  approvedCount,
  expiredCount,
  rejectedCount,
  positiveVotesTotal,
}: PublicHallazgosSectionProps) {
  const [filter, setFilter] = useState<PublicHallazgoFilter>('approved');

  const publicHistory = useMemo(
    () => offers.filter((o) => o.dealStatus !== 'pending'),
    [offers],
  );

  const filtered = useMemo(
    () => publicHistory.filter((o) => o.dealStatus === filter),
    [publicHistory, filter],
  );

  const counts: Record<PublicHallazgoFilter, number> = {
    approved: approvedCount,
    expired: expiredCount,
    rejected: rejectedCount,
  };

  return (
    <div className="space-y-6">
      <p className="text-[15px] text-[#1d1d1f] dark:text-[#fafafa]">
        {approvedCount} activas · {expiredCount} expiradas · {rejectedCount} rechazadas ·{' '}
        {positiveVotesTotal == null ? '—' : positiveVotesTotal} votos
      </p>

      <div>
        <h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Hallazgos públicos</h2>
        <p className="mt-1 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
          Historial público de contribución. Las expiradas siguen contando como reputación.
        </p>
      </div>

      <div
        className="flex max-w-full gap-1 overflow-x-auto"
        role="tablist"
        aria-label="Filtrar hallazgos públicos"
      >
        {FILTERS.map((f) => {
          const selected = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setFilter(f.value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] transition-colors duration-150 ${
                selected
                  ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]'
                  : 'text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#a3a3a3] dark:hover:text-[#fafafa]'
              }`}
            >
              {f.label}
              <span
                className={`ml-1.5 tabular-nums ${selected ? 'opacity-75' : 'text-gray-400 dark:text-gray-500'}`}
              >
                {counts[f.value]}
              </span>
            </button>
          );
        })}
      </div>

      <div>
        {filtered.length === 0 ? (
          <div className="space-y-2 py-6">
            <p className="text-[15px] text-[#6e6e73] dark:text-[#a3a3a3]">
              {publicHistory.length === 0
                ? 'Todavía no hay hallazgos públicos.'
                : 'No hay ofertas en este estado.'}
            </p>
            <p className="text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
              Las ofertas en revisión no aparecen aquí hasta ser moderadas.
            </p>
          </div>
        ) : (
          <ul>
            {filtered.map((offer) => {
              const discount = offerDiscountPercent(offer.discountPrice, offer.originalPrice);
              const price = offer.discountPrice > 0 ? formatPriceMXN(offer.discountPrice) : null;
              const meta = price == null ? null : discount == null ? price : `${price} · -${discount}%`;
              const openable = offer.dealStatus === 'approved' || offer.dealStatus === 'expired';
              return (
                <li key={offer.id} className="border-b border-black/5 last:border-0 dark:border-white/10">
                  <button
                    type="button"
                    disabled={!openable}
                    onClick={openable ? () => onOfferClick(offer) : undefined}
                    className="flex w-full items-center gap-3 py-3 text-left transition-colors duration-150 enabled:hover:text-[#6e6e73] disabled:cursor-default dark:enabled:hover:text-[#a3a3a3]"
                  >
                    {offer.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={offer.image} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                    ) : (
                      <span className="h-12 w-12 shrink-0 rounded-2xl bg-black/5 dark:bg-white/10" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">{offer.title}</span>
                      {meta ? <span className="mt-0.5 block text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{meta}</span> : null}
                    </span>
                    <span className="shrink-0 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
                      {offer.dealStatus === 'approved' ? 'Activa' : offer.dealStatus === 'expired' ? 'Expirada' : 'Rechazada'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
