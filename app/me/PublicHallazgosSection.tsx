'use client';

import PublicProfileView, { type PublicProfileOffer } from '@/app/components/profile/PublicProfileView';
import type { CardOffer } from '@/lib/offers/transform';
import type { VoteMap, VoteValueMap, FavoriteMap } from '@/lib/offers/batchUserData';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type MappedOffer = CardOffer & { dealStatus: DealStatus; rejectionReason: string | null };

type PublicHallazgosSectionProps = {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  level: number;
  score: number;
  sharePath: string | null;
  comments: number | null;
  offers: MappedOffer[];
  voteMap: VoteMap;
  voteValueMap: VoteValueMap;
  favoriteMap: FavoriteMap;
  onVoteChange: (offerId: string, value: 1 | -1 | 0, storedWeight?: number) => void;
  onFavoriteChange?: (offerId: string, isFavorite: boolean) => void;
  onOfferClick: (offer: MappedOffer) => void;
  approvedCount: number;
  expiredCount: number;
  rejectedCount: number;
  positiveVotesTotal: number | null;
};

/**
 * Vista previa del perfil público en /me.
 * Sin datos privados de recompensas.
 */
export default function PublicHallazgosSection({
  displayName,
  handle,
  avatarUrl,
  level,
  score,
  sharePath,
  comments,
  offers,
  favoriteMap,
  onFavoriteChange,
  onOfferClick,
  positiveVotesTotal,
}: PublicHallazgosSectionProps) {
  const publicOffers: PublicProfileOffer[] = offers.map((offer) => ({
    id: offer.id,
    title: offer.title,
    store: offer.brand || null,
    image: offer.image ?? null,
    discountPrice: offer.discountPrice,
    originalPrice: offer.originalPrice,
    createdAt: offer.createdAt ?? null,
    dealStatus: offer.dealStatus,
    upvotes: offer.upvotes,
    isFavorite: Boolean(favoriteMap[offer.id]),
  }));

  return (
    <PublicProfileView
      displayName={displayName}
      handle={handle}
      avatarUrl={avatarUrl}
      level={level}
      score={score}
      offers={publicOffers}
      votesReceived={positiveVotesTotal}
      comments={comments}
      sharePath={sharePath}
      levelHref="/me/nivel"
      onFavoriteChange={onFavoriteChange}
      onOpenOffer={(offer) => {
        const source = offers.find((item) => item.id === offer.id);
        if (!source) return;
        const openable = source.dealStatus === 'approved' || source.dealStatus === 'expired';
        if (openable) onOfferClick(source);
      }}
    />
  );
}
