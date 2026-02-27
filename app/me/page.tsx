'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from 'lucide-react';
import ClientLayout from '@/app/ClientLayout';
import OfferCard from '@/app/components/OfferCard';
import OfferCardSkeleton from '@/app/components/OfferCardSkeleton';
import OfferModal from '@/app/components/OfferModal';
import { createClient } from '@/lib/supabase/client';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useOffersRealtime } from '@/lib/hooks/useOffersRealtime';
import { fetchBatchUserData, type VoteMap, type FavoriteMap } from '@/lib/offers/batchUserData';

type OfferRow = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  image_url: string | null;
  store: string | null;
  offer_url: string | null;
  description: string | null;
  created_at?: string | null;
  upvotes_count?: number | null;
  downvotes_count?: number | null;
};

type MappedOffer = {
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
  votes: { up: number; down: number; score: number };
  author: { username: string; avatar_url?: string | null };
};

export default function MePage() {
  useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [voteMap, setVoteMap] = useState<VoteMap>({});
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({});
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null } | null>(null);
  const [offers, setOffers] = useState<MappedOffer[]>([]);
  const [metrics, setMetrics] = useState({
    totalOffers: 0,
    upVotes: 0,
    downVotes: 0,
    score: 0,
  });
  const [selectedOffer, setSelectedOffer] = useState<MappedOffer | null>(null);

  useOffersRealtime(setOffers);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (!profileData) {
        setLoading(false);
        return;
      }

      setProfile({
        display_name: profileData.display_name,
        avatar_url: profileData.avatar_url,
      });

      const { data: rows } = await supabase
        .from('offers')
        .select('id, title, price, original_price, image_url, store, offer_url, description, created_at, upvotes_count, downvotes_count')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      const author = {
        username: profileData.display_name?.trim() || 'Usuario',
        avatar_url: profileData.avatar_url ?? null,
      };

      let totalUp = 0;
      let totalDown = 0;
      let totalScore = 0;

      const mapped: MappedOffer[] = (rows ?? []).map((row: OfferRow) => {
        const up = row.upvotes_count ?? 0;
        const down = row.downvotes_count ?? 0;
        const score = up - down;
        totalUp += up;
        totalDown += down;
        totalScore += score;

        const originalPrice = Number(row.original_price) || 0;
        const discountPrice = Number(row.price) || 0;
        const discount =
          originalPrice > 0 ? Math.round((1 - discountPrice / originalPrice) * 100) : 0;

        return {
          id: row.id,
          title: row.title,
          brand: row.store ?? '',
          originalPrice,
          discountPrice,
          discount,
          upvotes: up,
          downvotes: down,
          offerUrl: row.offer_url?.trim() ?? '',
          image: row.image_url ? row.image_url : undefined,
          description: row.description?.trim() || undefined,
          votes: { up, down, score },
          author,
        };
      });

      setMetrics({
        totalOffers: mapped.length,
        upVotes: totalUp,
        downVotes: totalDown,
        score: totalScore,
      });
      setOffers(mapped);
      setLoading(false);

      if (mapped.length > 0 && user.id) {
        fetchBatchUserData(user.id, mapped.map((o) => o.id)).then(({ voteMap: vm, favoriteMap: fm }) => {
          setVoteMap(vm);
          setFavoriteMap(fm);
        });
      }
    };

    load();
  }, [router]);

  if (loading) {
    return (
      <ClientLayout>
        <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100">
          <section className="mx-auto max-w-5xl px-4 md:px-8 py-12">
            <div className="h-20 rounded-3xl bg-gray-100 dark:bg-gray-800/50 mb-8 opacity-70 animate-pulse" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800/50 opacity-70 animate-pulse" />
              ))}
            </div>
            <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">Tus ofertas</h2>
            <div className="space-y-4 md:space-y-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <OfferCardSkeleton key={i} />
              ))}
            </div>
          </section>
        </div>
      </ClientLayout>
    );
  }

  const displayName = profile?.display_name?.trim() || 'Usuario';

  return (
    <ClientLayout>
      <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100">
        <section className="mx-auto max-w-5xl px-4 md:px-8 py-12">
          <div className="rounded-3xl bg-white dark:bg-gray-900 p-6 shadow-lg mb-8">
            <div className="flex flex-col items-center sm:flex-row sm:items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-pink-400 dark:from-purple-400 dark:to-pink-400 overflow-hidden">
                {profile?.avatar_url ? (
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
                  {displayName}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Tu panel</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Ofertas publicadas
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {metrics.totalOffers}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Votos positivos
              </p>
              <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
                {metrics.upVotes}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Votos negativos
              </p>
              <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
                {metrics.downVotes}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Score total
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {metrics.score}
              </p>
            </div>
          </div>

          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Tus ofertas
          </h2>
          <div className="space-y-4 md:space-y-6">
            {offers.length === 0 ? (
              <p className="py-6 text-center text-gray-500 dark:text-gray-400">
                Aún no tienes ofertas publicadas.
              </p>
            ) : (
              offers.map((offer) => (
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
                  onCardClick={() => setSelectedOffer(offer)}
                  userVote={voteMap[offer.id] ?? null}
                  isLiked={!!favoriteMap[offer.id]}
                />
              ))
            )}
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
            offerId={selectedOffer.id}
            author={selectedOffer.author}
            image={selectedOffer.image}
            isLiked={!!favoriteMap[selectedOffer.id]}
            userVote={voteMap[selectedOffer.id] ?? 0}
            onFavoriteChange={(fav) => {
              if (selectedOffer.id) {
                setFavoriteMap((prev) => (fav ? { ...prev, [selectedOffer.id]: true } : { ...prev, [selectedOffer.id]: false }));
              }
            }}
          />
        )}
      </div>
    </ClientLayout>
  );
}
