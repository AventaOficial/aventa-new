'use client';

import { useRouter } from 'next/navigation';
import OfferCard from '@/app/components/OfferCard';

type Offer = {
  id: string;
  title: string;
  brand: string;
  originalPrice: number;
  discountPrice: number;
  discount: number;
  description?: string;
  upvotes: number;
  downvotes: number;
  offerUrl: string;
  image?: string;
  imageUrls?: string[];
  msiMonths?: number;
  bankCoupon?: string | null;
  votes: { up: number; down: number; score: number };
  author: { username: string; avatar_url?: string | null; leaderBadge?: string | null; creatorMlTag?: string | null };
  createdAt: string | null;
};

export default function TiendaOfferList({ offers }: { offers: Offer[] }) {
  const router = useRouter();
  return (
    <div className="space-y-4 md:space-y-6">
      {offers.map((offer) => (
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
          createdAt={offer.createdAt}
          msiMonths={offer.msiMonths}
          bankCoupon={offer.bankCoupon}
          onCardClick={() => router.push(`/oferta/${offer.id}`)}
        />
      ))}
    </div>
  );
}
