'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';
import PublicProfileView from '@/app/components/profile/PublicProfileView';
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
  hunterComment?: string;
  upvotes: number;
  downvotes: number;
  offerUrl: string;
  image?: string;
  createdAt?: string | null;
  expiresAt?: string | null;
  dealStatus?: DealStatus;
  category?: string | null;
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
    bio?: string | null;
    location?: string | null;
    cover_url?: string | null;
    is_private?: boolean;
    activity_visible?: boolean;
    created_at?: string | null;
    is_trusted?: boolean;
  };
  offersCount: number;
  activeCount?: number;
  expiredCount?: number;
  totalScore: number;
  offers: ProfileOffer[];
  featuredAchievements?: Array<{ code?: string; name: string; icon: string }>;
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
  const [retryCount, setRetryCount] = useState(0);
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
        setLoadError('No se pudo cargar este perfil. Puedes volver a intentarlo o seguir viendo ofertas.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [username, retryCount]);

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
            <div className="h-44 animate-pulse rounded-2xl bg-white dark:bg-[#141414]" />
          </section>
        </div>
      </ClientLayout>
    );
  }

  if (loadError) {
    return (
      <ClientLayout>
        <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100 flex items-center justify-center px-4">
          <div className="max-w-sm text-center">
            <p className="text-gray-600 dark:text-gray-400">
              {loadError}
            </p>
            <div className="mt-4 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => setRetryCount((n) => n + 1)}
                className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
              >
                Reintentar
              </button>
              <Link href="/" className="text-sm font-medium text-violet-700 dark:text-violet-300 hover:underline">
                Ver ofertas
              </Link>
            </div>
          </div>
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

  const votesReceived = offers.reduce((sum, offer) => sum + (offer.upvotes ?? 0), 0);

  return (
    <ClientLayout>
      <div className="min-h-screen bg-[#07040f] text-white">
        <section className="mx-auto max-w-6xl px-4 pb-28 pt-24 md:px-8 md:pb-12 md:pt-12">
          <p className="sr-only">Así me ve Aventa.</p>
          <PublicProfileView
            displayName={profile.username}
            handle={username}
            avatarUrl={profile.avatar_url}
            bio={profile.bio}
            location={profile.location}
            coverUrl={profile.cover_url}
            activityVisible={profile.activity_visible !== false && !profile.is_private}
            level={profile.reputation_level ?? 1}
            score={profile.reputation_score ?? 0}
            joinedAt={profile.created_at}
            trusted={profile.is_trusted === true}
            showcase={data.featuredAchievements ?? []}
            votesReceived={votesReceived}
            comments={null}
            sharePath={`/u/${username}`}
            offers={filteredOffers.map((offer) => ({
              id: offer.id,
              title: offer.title,
              store: offer.brand || null,
              image: offer.image ?? null,
              discountPrice: offer.discountPrice,
              originalPrice: offer.originalPrice,
              createdAt: offer.createdAt ?? null,
              dealStatus: offer.dealStatus ?? 'approved',
              upvotes: offer.upvotes,
              isFavorite: Boolean(favoriteMap[offer.id]),
              category: offer.category ?? null,
            }))}
            onFavoriteChange={(offerId, isFavorite) => {
              setFavoriteMap((prev) => ({ ...prev, [offerId]: isFavorite }));
            }}
            onOpenOffer={(offer) => {
              const openable = offer.dealStatus === 'approved' || offer.dealStatus === 'expired';
              if (openable) router.push(buildOfferPublicPath(offer.id, offer.title));
            }}
          />
        </section>
      </div>
    </ClientLayout>
  );
}
