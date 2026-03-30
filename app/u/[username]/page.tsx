'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import ClientLayout from '@/app/ClientLayout';
import OfferCard from '@/app/components/OfferCard';
import OfferCardSkeleton from '@/app/components/OfferCardSkeleton';
import OfferModal from '@/app/components/OfferModal';
import ReputationBar from '@/app/components/ReputationBar';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { useOffersRealtime } from '@/lib/hooks/useOffersRealtime';
import {
  fetchBatchUserData,
  type VoteMap,
  type VoteValueMap,
  type FavoriteMap,
} from '@/lib/offers/batchUserData';

type ProfileData = {
  profile: {
    username: string;
    avatar_url: string | null;
    reputation_level?: number;
    reputation_score?: number;
  };
  offersCount: number;
  totalScore: number;
  offers: {
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
    createdAt?: string | null;
    msiMonths?: number | null;
    bankCoupon?: string | null;
    coupons?: string | null;
    votes: { up: number; down: number; score: number };
    author: { username: string; avatar_url?: string | null; userId?: string | null; slug?: string | null };
  }[];
};

export default function ProfilePage() {
  useTheme();
  const params = useParams();
  const { session } = useAuth();
  const username = typeof params?.username === 'string' ? params.username : '';

  const [loading, setLoading] = useState(true);
  const [voteMap, setVoteMap] = useState<VoteMap>({});
  const [voteValueMap, setVoteValueMap] = useState<VoteValueMap>({});
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({});
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<ProfileData | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<ProfileData['offers'][0] | null>(null);

  const setOffers = useCallback(
    (updater: React.SetStateAction<ProfileData['offers']>) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              offers: typeof updater === 'function' ? updater(prev.offers) : updater,
            }
          : prev
      );
    },
    []
  );
  useOffersRealtime(setOffers);

  useEffect(() => {
    if (!data?.offers?.length || !session?.user?.id) {
      setVoteMap({});
      setVoteValueMap({});
      setFavoriteMap({});
      return;
    }
    const offerIds = data.offers.map((o) => o.id);
    fetchBatchUserData(session.user.id, offerIds).then(({ voteMap: vm, voteValueMap: vvm, favoriteMap: fm }) => {
      setVoteMap(vm);
      setVoteValueMap(vvm);
      setFavoriteMap(fm);
    });
  }, [data?.offers, session?.user?.id]);

  useEffect(() => {
    let cancelled = false;

    if (!username) {
      setLoading(false);
      setNotFound(true);
      setLoadError(null);
      return;
    }

    const run = async () => {
      setLoading(true);
      setNotFound(false);
      setLoadError(null);
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(username)}`);
        if (cancelled) return;

        if (res.status === 404) {
          setNotFound(true);
          setData(null);
          return;
        }

        if (!res.ok) {
          throw new Error('Error loading profile');
        }

        const json = (await res.json()) as ProfileData;
        if (cancelled) return;
        setData(json);
        setNotFound(false);
      } catch {
        if (cancelled) return;
        setData(null);
        setNotFound(false);
        setLoadError('No se pudo cargar el perfil. Intenta de nuevo en unos segundos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading) {
    return (
      <ClientLayout>
        <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100">
          <section className="container mx-auto px-4 md:px-8 py-12 max-w-5xl">
            <div className="rounded-3xl bg-white dark:bg-gray-900 p-6 shadow-lg mb-10 opacity-70 animate-pulse">
              <div className="flex flex-col items-center sm:flex-row sm:items-center gap-4">
                <div className="h-20 w-20 shrink-0 rounded-xl bg-gray-200 dark:bg-gray-700" />
                <div className="h-8 w-32 rounded-xl bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
            <div className="mb-8">
              <div className="h-6 w-40 rounded-xl bg-gray-100 dark:bg-gray-800 mb-4 opacity-70 animate-pulse" />
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                    className="offer-card"
                  >
                    <OfferCardSkeleton />
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </ClientLayout>
    );
  }

  if (loadError) {
    return (
      <ClientLayout>
        <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100 flex items-center justify-center px-4">
          <p className="text-center text-gray-600 dark:text-gray-400">
            {loadError}
          </p>
        </div>
      </ClientLayout>
    );
  }

  if (notFound || !data) {
    return (
      <ClientLayout>
        <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100 flex items-center justify-center px-4">
          <p className="text-center text-gray-600 dark:text-gray-400">
            Usuario no encontrado.
          </p>
        </div>
      </ClientLayout>
    );
  }

  const { profile, offersCount, totalScore, offers } = data;

  const handleVoteChange = (offerId: string, value: 1 | -1 | 0, storedWeight?: number) => {
    setVoteMap((prev) => {
      const next = { ...prev };
      if (value === 0) delete next[offerId];
      else next[offerId] = value;
      return next;
    });
    setVoteValueMap((prev) => {
      const next = { ...prev };
      if (value === 0) delete next[offerId];
      else if (storedWeight !== undefined) next[offerId] = storedWeight;
      return next;
    });
  };

  return (
    <ClientLayout>
      <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100">
        <section className="container mx-auto px-4 md:px-8 py-12 max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-3xl bg-white dark:bg-gray-900 p-6 shadow-lg mb-10"
          >
            <div className="flex flex-col items-center sm:flex-row sm:items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-pink-400 dark:from-purple-400 dark:to-pink-400 overflow-hidden">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-10 w-10 text-white" />
                )}
              </div>
              <div className="text-center sm:text-left min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
                  @{profile.username}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span>{offersCount} ofertas cazadas</span>
                  <span>Contribución a la comunidad: {totalScore}</span>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <ReputationBar
                level={profile.reputation_level ?? 1}
                score={profile.reputation_score ?? 0}
              />
            </div>
          </motion.div>

          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">
              Ofertas aprobadas
            </h2>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
              className="space-y-4 md:space-y-6"
            >
              {offers.length === 0 ? (
                <p className="py-6 text-center text-gray-500 dark:text-gray-400">
                  Aún no hay ofertas cazadas.
                </p>
              ) : (
                offers.map((offer, index) => (
                  <motion.div
                    key={offer.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeInOut' }}
                    className="offer-card"
                  >
                    <OfferCard
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
                      onCardClick={() => setSelectedOffer(offer)}
                      onVoteChange={handleVoteChange}
                      userVote={voteMap[offer.id] ?? null}
                      userVoteStoredValue={voteValueMap[offer.id] ?? null}
                      isLiked={!!favoriteMap[offer.id]}
                      createdAt={offer.createdAt}
                      msiMonths={offer.msiMonths}
                      bankCoupon={offer.bankCoupon}
                      coupons={offer.coupons}
                    />
                  </motion.div>
                ))
              )}
            </motion.div>
          </div>

          <div className="h-24 md:h-0" />
        </section>

        {selectedOffer && (
          <OfferModal
            isOpen={!!selectedOffer}
            onClose={() => setSelectedOffer(null)}
            title={selectedOffer.title}
            brand={selectedOffer.brand}
            originalPrice={selectedOffer.originalPrice}
            discountPrice={selectedOffer.discountPrice}
            discount={selectedOffer.discount}
            description={selectedOffer.description}
            offerUrl={selectedOffer.offerUrl}
            upvotes={selectedOffer.upvotes}
            downvotes={selectedOffer.downvotes}
            votesScore={selectedOffer.votes.score}
            offerId={selectedOffer.id}
            author={selectedOffer.author}
            image={selectedOffer.image}
            isLiked={!!favoriteMap[selectedOffer.id]}
            onFavoriteChange={(fav) => setFavoriteMap((prev) => ({ ...prev, [selectedOffer.id]: fav }))}
            userVote={voteMap[selectedOffer.id] ?? 0}
            userVoteStoredValue={voteValueMap[selectedOffer.id] ?? null}
            onVoteChange={handleVoteChange}
            steps={selectedOffer.steps}
            conditions={selectedOffer.conditions}
            coupons={selectedOffer.coupons}
            msiMonths={selectedOffer.msiMonths}
            bankCoupon={selectedOffer.bankCoupon}
            imageUrls={selectedOffer.imageUrls}
          />
        )}
      </div>
    </ClientLayout>
  );
}
