'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import ClientLayout from '@/app/ClientLayout';
import OfferCard from '@/app/components/OfferCard';
import OfferCardSkeleton from '@/app/components/OfferCardSkeleton';
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
import { buildOfferPublicPath } from '@/lib/offerPath';

type DealStatus = 'approved' | 'expired';

type ProfileOffer = {
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
  expiresAt?: string | null;
  dealStatus?: DealStatus;
  msiMonths?: number | null;
  bankCoupon?: string | null;
  coupons?: string | null;
  steps?: string;
  conditions?: string;
  offerScope?: 'online' | 'in_store' | null;
  imageUrls?: string[];
  votes: { up: number; down: number; score: number };
  author: { username: string; avatar_url?: string | null; userId?: string | null; slug?: string | null };
};

type ProfileData = {
  profile: {
    username: string;
    avatar_url: string | null;
    reputation_level?: number;
    reputation_score?: number;
  };
  offersCount: number;
  activeCount?: number;
  expiredCount?: number;
  totalScore: number;
  offers: ProfileOffer[];
};

const FILTERS: Array<{ value: 'all' | DealStatus; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'approved', label: 'Activas' },
  { value: 'expired', label: 'Expiradas' },
];

export default function ProfilePage() {
  useTheme();
  const params = useParams();
  const router = useRouter();
  const { session } = useAuth();
  const username = typeof params?.username === 'string' ? params.username : '';

  const [loading, setLoading] = useState(true);
  const [voteMap, setVoteMap] = useState<VoteMap>({});
  const [voteValueMap, setVoteValueMap] = useState<VoteValueMap>({});
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({});
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<ProfileData | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | DealStatus>('all');

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
        // Si no hay activas pero sí historial, abrir en Expiradas.
        if ((json.activeCount ?? 0) === 0 && (json.expiredCount ?? 0) > 0) {
          setStatusFilter('expired');
        } else {
          setStatusFilter('all');
        }
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

  const filteredOffers = useMemo(() => {
    if (!data?.offers) return [];
    if (statusFilter === 'all') return data.offers;
    return data.offers.filter((o) => (o.dealStatus ?? 'approved') === statusFilter);
  }, [data?.offers, statusFilter]);

  if (loading) {
    return (
      <ClientLayout>
        <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100">
          <section className="container mx-auto px-4 md:px-8 py-12 max-w-5xl">
            <div className="rounded-3xl bg-white dark:bg-[#141414] p-6 shadow-lg mb-10 opacity-70 animate-pulse">
              <div className="flex flex-col items-center sm:flex-row sm:items-center gap-4">
                <div className="h-20 w-20 shrink-0 rounded-xl bg-gray-200 dark:bg-gray-700" />
                <div className="h-8 w-32 rounded-xl bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
            <div className="mb-8">
              <div className="h-6 w-40 rounded-xl bg-gray-100 dark:bg-[#1a1a1a] mb-4 opacity-70 animate-pulse" />
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

  const { profile, offersCount, totalScore, offers, activeCount = 0, expiredCount = 0 } = data;

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
            className="rounded-3xl bg-white dark:bg-[#141414] p-6 shadow-lg mb-10"
          >
            <div className="flex flex-col items-center sm:flex-row sm:items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 overflow-hidden">
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
                  <span>{offersCount} hallazgos</span>
                  <span>{activeCount} activas</span>
                  <span>Puntos: {totalScore}</span>
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

          <div className="mb-8 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                Sus hallazgos
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Historial público. Las expiradas siguen contando como contribución.
              </p>
            </div>

            <div
              className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-1.5"
              role="tablist"
              aria-label="Filtrar hallazgos"
            >
              {FILTERS.map((f) => {
                const selected = statusFilter === f.value;
                const count =
                  f.value === 'all'
                    ? offersCount
                    : f.value === 'approved'
                      ? activeCount
                      : expiredCount;
                return (
                  <button
                    key={f.value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setStatusFilter(f.value)}
                    className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1a1a1a]'
                    }`}
                  >
                    {f.label}
                    <span className={`ml-1.5 tabular-nums ${selected ? 'opacity-75' : 'text-gray-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
              className="space-y-4 md:space-y-6"
            >
              {filteredOffers.length === 0 ? (
                <p className="py-6 text-center text-gray-500 dark:text-gray-400">
                  {offers.length === 0
                    ? 'Sin hallazgos publicados aún.'
                    : 'No hay ofertas en este filtro.'}
                </p>
              ) : (
                filteredOffers.map((offer, index) => {
                  const dealStatus = offer.dealStatus ?? 'approved';
                  return (
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
                        onCardClick={
                          dealStatus === 'approved'
                            ? () => router.push(buildOfferPublicPath(offer.id, offer.title))
                            : undefined
                        }
                        onVoteChange={handleVoteChange}
                        userVote={voteMap[offer.id] ?? null}
                        userVoteStoredValue={voteValueMap[offer.id] ?? null}
                        isLiked={!!favoriteMap[offer.id]}
                        createdAt={offer.createdAt}
                        expiresAt={offer.expiresAt}
                        msiMonths={offer.msiMonths}
                        bankCoupon={offer.bankCoupon}
                        coupons={offer.coupons}
                        offerScope={offer.offerScope ?? null}
                        dealStatus={dealStatus}
                      />
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          </div>

          <div className="h-24 md:h-0" />
        </section>
      </div>
    </ClientLayout>
  );
}
