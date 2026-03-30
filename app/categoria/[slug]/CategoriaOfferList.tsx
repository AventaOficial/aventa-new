'use client';

import { useRouter } from 'next/navigation';
import OfferCard from '@/app/components/OfferCard';
import { buildOfferPublicPath } from '@/lib/offerPath';
import type { CardOffer } from '@/lib/offers/transform';

export default function CategoriaOfferList({ offers }: { offers: CardOffer[] }) {
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
          coupons={offer.coupons}
          onCardClick={() => router.push(buildOfferPublicPath(offer.id, offer.title))}
        />
      ))}
    </div>
  );
}
