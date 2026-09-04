'use client';

import { useMemo, useState } from 'react';
import type { CardOffer } from '@/lib/offers/transform';
import OfferCard from '@/app/components/OfferCard';
import type { VoteMap, VoteValueMap, FavoriteMap } from '@/lib/offers/batchUserData';

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
  positiveVotesTotal: number;
};

/**
 * Vista previa del perfil público en /me:
 * historial de hallazgos con activas / expiradas / rechazadas.
 * Sin datos privados de recompensas.
 */
export default function PublicHallazgosSection({
  offers,
  voteMap,
  voteValueMap,
  favoriteMap,
  onVoteChange,
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Activas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {approvedCount}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Expiradas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {expiredCount}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rechazadas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {rejectedCount}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Votos recibidos</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
            {positiveVotesTotal}
          </p>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Sus hallazgos</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Historial público de contribución. Las expiradas siguen contando como reputación.
          </p>
        </div>
      </div>

      <div
        className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-1.5"
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
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                selected
                  ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1a1a1a]'
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

      <div className="space-y-4 md:space-y-6">
        {filtered.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-gray-600 dark:text-gray-300">
              {publicHistory.length === 0
                ? 'Todavía no hay hallazgos públicos.'
                : 'No hay ofertas en este estado.'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Las ofertas en revisión no aparecen aquí hasta ser moderadas.
            </p>
          </div>
        ) : (
          filtered.map((offer) => (
            <OfferCard
              key={offer.id}
              offerId={offer.id}
              title={offer.title}
              brand={offer.brand}
              originalPrice={offer.originalPrice}
              discountPrice={offer.discountPrice}
              discount={offer.discount}
              description={offer.description}
              image={offer.image}
              upvotes={offer.upvotes}
              downvotes={offer.downvotes}
              votes={offer.votes}
              offerUrl={offer.offerUrl}
              author={offer.author}
              onCardClick={
                offer.dealStatus === 'approved' ? () => onOfferClick(offer) : undefined
              }
              onVoteChange={onVoteChange}
              userVote={voteMap[offer.id] ?? null}
              userVoteStoredValue={voteValueMap[offer.id] ?? null}
              isLiked={!!favoriteMap[offer.id]}
              createdAt={offer.createdAt}
              msiMonths={offer.msiMonths}
              bankCoupon={offer.bankCoupon}
              coupons={offer.coupons}
              offerScope={offer.offerScope ?? null}
              dealStatus={offer.dealStatus}
              rejectionReason={offer.rejectionReason}
            />
          ))
        )}
      </div>
    </div>
  );
}
