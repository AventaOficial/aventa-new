'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import ClientLayout from './ClientLayout';
import Hero from './components/Hero';
import OfferCard from './components/OfferCard';
import OfferCardSkeleton from './components/OfferCardSkeleton';
import OfferModal from './components/OfferModal';
import ChatBubble from './components/ChatBubble';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useUI } from '@/app/providers/UIProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { useOffersRealtime } from '@/lib/hooks/useOffersRealtime';
import { fetchBatchUserData, type VoteMap, type FavoriteMap } from '@/lib/offers/batchUserData';

type TimeFilter = 'day' | 'week' | 'month';
type ViewMode = 'general' | 'top' | 'personalized' | 'latest';

interface OfferAuthor {
  username: string;
  avatar_url?: string | null;
}

interface OfferRow {
  id: string;
  title: string;
  price: number;
  original_price: number;
  image_url?: string | null;
  image_urls?: string[] | null;
  msi_months?: number | null;
  store: string | null;
  offer_url: string | null;
  description: string | null;
  steps?: string | null;
  conditions?: string | null;
  coupons?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  up_votes?: number | null;
  down_votes?: number | null;
  score?: number | null;
  ranking_momentum?: number | null;
  profiles?:
    | { display_name: string | null; avatar_url: string | null }
    | { display_name: string | null; avatar_url: string | null }[]
    | null;
}

interface Offer {
  id: string;
  title: string;
  brand: string;
  originalPrice: number;
  discountPrice: number;
  discount: number;
  description?: string;
  steps?: string;
  conditions?: string;
  coupons?: string;
  upvotes: number;
  downvotes: number;
  offerUrl: string;
  image?: string;
  imageUrls?: string[];
  msiMonths?: number | null;
  votes: { up: number; down: number; score: number };
  author: OfferAuthor;
  ranking_momentum: number;
  createdAt?: string | null;
}

function rowToOffer(row: OfferRow): Offer {
  const originalPrice = Number(row.original_price) || 0;
  const discountPrice = Number(row.price) || 0;
  const discount =
    originalPrice > 0 ? Math.round((1 - discountPrice / originalPrice) * 100) : 0;
  const up = row.up_votes ?? 0;
  const down = row.down_votes ?? 0;
  const score = row.score ?? 0;
  const rawProf = row.profiles;
  const prof = Array.isArray(rawProf) ? rawProf[0] : rawProf;
  const author: OfferAuthor = {
    username: (prof?.display_name?.trim() && prof.display_name) || 'Usuario',
    avatar_url: prof?.avatar_url ?? null,
  };
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
    imageUrls: Array.isArray(row.image_urls) ? row.image_urls : undefined,
    msiMonths: typeof row.msi_months === 'number' ? row.msi_months : undefined,
    description: row.description?.trim() || undefined,
    steps: row.steps?.trim() || undefined,
    conditions: row.conditions?.trim() || undefined,
    coupons: row.coupons?.trim() || undefined,
    votes: { up, down, score },
    author,
    ranking_momentum: Number(row.ranking_momentum) || 0,
    createdAt: row.created_at ?? null,
  };
}

function HomeContent() {
  useTheme();
  const { showToast } = useUI();
  const { session } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [voteMap, setVoteMap] = useState<VoteMap>({});
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({});
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('day');
  const [viewMode, setViewMode] = useState<ViewMode>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [limit, setLimit] = useState(12);
  const [hasMoreCursor, setHasMoreCursor] = useState(true);
  const prevFiltersRef = useRef({ viewMode, timeFilter, debouncedQuery });

  useOffersRealtime(setOffers);

  // Mostrar error de OAuth si el callback redirigió con ?error=... y limpiar la URL
  const router = useRouter();
  useEffect(() => {
    const err = searchParams.get('error');
    const msg = searchParams.get('message');
    if (err === 'missing_code') {
      showToast('No se recibió el código de Google. Vuelve a intentar iniciar sesión.');
      router.replace(pathname, { scroll: false });
    } else if (err === 'auth' && msg) {
      showToast(`Error al iniciar sesión: ${decodeURIComponent(msg)}`);
      router.replace(pathname, { scroll: false });
    } else if (err === 'config') {
      showToast('Error de configuración. Revisa las variables de entorno.');
      router.replace(pathname, { scroll: false });
    }
  }, [searchParams, showToast, router, pathname]);

  const fetchOffers = useCallback((overrideLimit?: number) => {
    setLoading(true);
    const effectiveLimit = overrideLimit ?? limit;
    const supabase = createClient();
    const now = new Date();
    const nowISO = now.toISOString();
    const msPerDay = 24 * 60 * 60 * 1000;
    let fechaLimite: Date;
    if (timeFilter === 'day') {
      fechaLimite = new Date(now.getTime() - 1 * msPerDay);
    } else if (timeFilter === 'week') {
      fechaLimite = new Date(now.getTime() - 7 * msPerDay);
    } else {
      fechaLimite = new Date(now.getTime() - 30 * msPerDay);
    }
    const fechaLimiteISO = fechaLimite.toISOString();

    let query = supabase
      .from('ofertas_ranked_general')
      .select('id, title, price, original_price, image_url, image_urls, msi_months, store, offer_url, description, steps, conditions, coupons, created_at, created_by, up_votes, down_votes, score, score_final, ranking_momentum, profiles:public_profiles_view!created_by(display_name, avatar_url)')
      .order('ranking_momentum', { ascending: false })
      .or('status.eq.approved,status.eq.published')
      .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
      .gte('created_at', fechaLimiteISO);

    if (viewMode === 'top') {
      query = query.gt('score', 0);
    }
    if (viewMode === 'top') {
      query = query.order('score_final', { ascending: false });
    } else if (viewMode === 'latest' || viewMode === 'personalized') {
      query = query.order('created_at', { ascending: false });
    }

    query.limit(effectiveLimit)
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          return;
        }
        const rows = data ?? [];
        setOffers(rows.map(rowToOffer));
        setHasMoreCursor(rows.length >= effectiveLimit);
      });
  }, [timeFilter, viewMode, limit]);

  const fetchNextPage = useCallback(() => {
    if (viewMode !== 'latest' && viewMode !== 'personalized') return;
    if (offers.length === 0) return;
    const lastCreatedAt = offers[offers.length - 1]?.createdAt;
    if (!lastCreatedAt) return;
    setLoading(true);
    const supabase = createClient();
    const now = new Date();
    const nowISO = now.toISOString();
    const msPerDay = 24 * 60 * 60 * 1000;
    let fechaLimite: Date;
    if (timeFilter === 'day') {
      fechaLimite = new Date(now.getTime() - 1 * msPerDay);
    } else if (timeFilter === 'week') {
      fechaLimite = new Date(now.getTime() - 7 * msPerDay);
    } else {
      fechaLimite = new Date(now.getTime() - 30 * msPerDay);
    }
    const fechaLimiteISO = fechaLimite.toISOString();
    supabase
      .from('ofertas_ranked_general')
      .select('id, title, price, original_price, image_url, image_urls, msi_months, store, offer_url, description, steps, conditions, coupons, created_at, created_by, up_votes, down_votes, score, score_final, ranking_momentum, profiles:public_profiles_view!created_by(display_name, avatar_url)')
      .or('status.eq.approved,status.eq.published')
      .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
      .gte('created_at', fechaLimiteISO)
      .lt('created_at', lastCreatedAt)
      .order('created_at', { ascending: false })
      .limit(13)
      .then(({ data, error }) => {
        setLoading(false);
        if (error) return;
        const rows = (data ?? []).map(rowToOffer);
        setHasMoreCursor(rows.length >= 12);
        setOffers((prev) => [...prev, ...rows.slice(0, 12)]);
      });
  }, [viewMode, timeFilter, offers]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (pathname !== '/') return;

    const filtersChanged =
      prevFiltersRef.current.viewMode !== viewMode ||
      prevFiltersRef.current.timeFilter !== timeFilter ||
      prevFiltersRef.current.debouncedQuery !== debouncedQuery;
    const effectiveLimit = filtersChanged ? 12 : limit;
    if (filtersChanged) {
      prevFiltersRef.current = { viewMode, timeFilter, debouncedQuery };
      setLimit(12);
      setHasMoreCursor(true);
    }

    setLoading(true);
    if (debouncedQuery.trim()) {
      const supabase = createClient();
      const nowISO = new Date().toISOString();
      const q = debouncedQuery.trim().replace(/%/g, '\\%').replace(/_/g, '\\_');
      supabase
        .from('ofertas_ranked_general')
        .select(
          'id, title, price, original_price, image_url, image_urls, msi_months, store, offer_url, description, steps, conditions, coupons, created_at, created_by, up_votes, down_votes, score, ranking_momentum, profiles:public_profiles_view!created_by(display_name, avatar_url)'
        )
        .or('status.eq.approved,status.eq.published')
        .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
        .ilike('title', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(effectiveLimit)
        .then(({ data, error }) => {
          setLoading(false);
          if (error) {
            setOffers([]);
            return;
          }
          setOffers((data ?? []).map((r: OfferRow) => rowToOffer(r)));
        });
    } else {
      fetchOffers(filtersChanged ? 12 : undefined);
      const onVisible = () => {
        if (document.visibilityState === 'visible') fetchOffers(undefined);
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    }
  }, [pathname, viewMode, timeFilter, debouncedQuery, limit, fetchOffers]);

  useEffect(() => {
    if (!session && viewMode === 'personalized') {
      setViewMode('latest');
    }
  }, [session, viewMode]);

  useEffect(() => {
    document.title = selectedOffer?.title
      ? `${selectedOffer.title} | AVENTA - Comunidad de cazadores de ofertas`
      : 'AVENTA - Comunidad de cazadores de ofertas';
  }, [selectedOffer?.id, selectedOffer?.title]);

  useEffect(() => {
    const offerId = searchParams.get('o');
    if (!offerId?.trim()) return;
    const existing = offers.find((o) => o.id === offerId);
    if (existing) {
      setSelectedOffer(existing);
      return;
    }
    const supabase = createClient();
    supabase
      .from('offers')
      .select('id, title, price, original_price, image_url, store, offer_url, description, steps, conditions, coupons, created_at, created_by, upvotes_count, downvotes_count, profiles!created_by(display_name, avatar_url)')
      .eq('id', offerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const up = data.upvotes_count ?? 0;
          const down = data.downvotes_count ?? 0;
          const prof = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
          const offer: Offer = {
            id: data.id,
            title: data.title,
            brand: data.store ?? '',
            originalPrice: Number(data.original_price) || 0,
            discountPrice: Number(data.price) || 0,
            discount: data.original_price ? Math.round((1 - Number(data.price) / Number(data.original_price)) * 100) : 0,
            description: data.description?.trim() || undefined,
            steps: (data as { steps?: string }).steps?.trim() || undefined,
            conditions: (data as { conditions?: string }).conditions?.trim() || undefined,
            coupons: (data as { coupons?: string }).coupons?.trim() || undefined,
            upvotes: up,
            downvotes: down,
            offerUrl: data.offer_url?.trim() ?? '',
            image: data.image_url ?? undefined,
            votes: { up, down, score: up * 2 - down },
            author: {
              username: prof?.display_name?.trim() || 'Usuario',
              avatar_url: prof?.avatar_url ?? null,
            },
            ranking_momentum: 0,
            createdAt: data.created_at ?? null,
          };
          setSelectedOffer(offer);
          setOffers((prev) => (prev.some((o) => o.id === offer.id) ? prev : [...prev, offer]));
        }
      });
  }, [searchParams]);

  useEffect(() => {
    if (!session?.user?.id || offers.length === 0) {
      if (!session) {
        setVoteMap({});
        setFavoriteMap({});
      }
      return;
    }
    fetchBatchUserData(session.user.id, offers.map((o) => o.id)).then(({ voteMap: vm, favoriteMap: fm }) => {
      setVoteMap(vm);
      setFavoriteMap(fm);
    });
  }, [session, offers]);

  const handleFavoriteChange = (offerId: string, isFavorite: boolean) => {
    setFavoriteMap((prev) => ({ ...prev, [offerId]: isFavorite }));
    if (isFavorite) {
      setFavoriteCount((c) => c + 1);
      if (typeof window !== 'undefined' && !localStorage.getItem('favorite_onboarding_seen')) {
        showToast("Cada favorito ayuda a personalizar lo que ves. La comunidad encuentra las mejores ofertas.");
        localStorage.setItem('favorite_onboarding_seen', 'true');
      }
    } else {
      setFavoriteCount((c) => Math.max(0, c - 1));
    }
  };

  return (
    <ClientLayout>
      <div id="ayuda" className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa]">
        <div className="hero-section">
          <Hero searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        </div>

        <section className="max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 max-[400px]:px-3 md:px-8 pt-4 max-[400px]:pt-3 md:pt-8 pb-32 md:pb-12">
        <div className="mb-4 max-[400px]:mb-3 md:mb-8">
          <div className="mb-3 max-[400px]:mb-2 md:mb-5">
            <div className="flex rounded-2xl max-[400px]:rounded-xl bg-[#e8e8ed] dark:bg-[#1a1a1a] p-1.5 max-[400px]:p-1 md:p-2 border border-[#e5e5e7] dark:border-[#262626] transition-all duration-200">
              <button
                onClick={() => setViewMode('general')}
                className={`flex-1 rounded-xl max-[400px]:rounded-lg py-2.5 max-[400px]:py-2 md:py-2.5 text-sm max-[400px]:text-xs font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
                  viewMode === 'general'
                    ? 'bg-white dark:bg-[#141414] text-[#1d1d1f] dark:text-[#fafafa] shadow-sm border border-[#e5e5e7] dark:border-[#262626]'
                    : 'text-[#6e6e73] dark:text-[#a3a3a3]'
                }`}
              >
                General
              </button>
              <button
                onClick={() => setViewMode('top')}
                className={`flex-1 rounded-xl max-[400px]:rounded-lg py-2.5 max-[400px]:py-2 md:py-2.5 text-sm max-[400px]:text-xs font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
                  viewMode === 'top'
                    ? 'bg-white dark:bg-[#141414] text-[#1d1d1f] dark:text-[#fafafa] shadow-sm border border-[#e5e5e7] dark:border-[#262626]'
                    : 'text-[#6e6e73] dark:text-[#a3a3a3]'
                }`}
              >
                Top
              </button>
              {session && (
                <button
                  onClick={() => setViewMode('personalized')}
                  className={`flex-1 rounded-xl max-[400px]:rounded-lg py-2.5 max-[400px]:py-2 md:py-2.5 text-sm max-[400px]:text-xs font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
                    viewMode === 'personalized'
                      ? 'bg-white dark:bg-[#141414] text-[#1d1d1f] dark:text-[#fafafa] shadow-sm border border-[#e5e5e7] dark:border-[#262626]'
                      : 'text-[#6e6e73] dark:text-[#a3a3a3]'
                  }`}
                >
                  Para ti
                </button>
              )}
              <button
                onClick={() => setViewMode('latest')}
                className={`flex-1 rounded-xl max-[400px]:rounded-lg py-2.5 max-[400px]:py-2 md:py-2.5 text-sm max-[400px]:text-xs font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
                  viewMode === 'latest'
                    ? 'bg-white dark:bg-[#141414] text-[#1d1d1f] dark:text-[#fafafa] shadow-sm border border-[#e5e5e7] dark:border-[#262626]'
                    : 'text-[#6e6e73] dark:text-[#a3a3a3]'
                }`}
              >
                Recientes
              </button>
            </div>
          </div>

          {viewMode === 'top' && (
            <div className="flex items-center gap-2 max-[400px]:gap-1.5 pb-1">
              <span className="text-xs max-[400px]:text-[11px] font-medium text-[#6e6e73] dark:text-[#a3a3a3] shrink-0">Período:</span>
              <div className="flex gap-2 max-[400px]:gap-1 shrink-0">
                {(
                  [
                    { value: 'day' as const, label: 'Hoy' },
                    { value: 'week' as const, label: 'Semana' },
                    { value: 'month' as const, label: 'Mes' },
                  ] as const
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setTimeFilter(value)}
                    className={`rounded-xl max-[400px]:rounded-lg px-4 max-[400px]:px-3 py-2 max-[400px]:py-1.5 text-xs font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] active:scale-95 ${
                      timeFilter === value
                        ? 'bg-gradient-to-r from-violet-600 to-violet-700 dark:from-violet-500 dark:to-violet-600 text-white shadow-violet-500/25'
                        : 'bg-[#f5f5f7] dark:bg-[#1a1a1a] text-[#6e6e73] dark:text-[#a3a3a3] border border-[#e5e5e7] dark:border-[#262626]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="mt-3 max-[400px]:mt-2 md:mt-8 space-y-4 max-[400px]:space-y-3 md:space-y-8"
        >
          {loading ? (
            <>
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
            </>
          ) : debouncedQuery.trim() && offers.length === 0 ? (
            <div className="py-12 text-center text-[#6e6e73] dark:text-[#a3a3a3]">
              No se encontraron resultados
            </div>
          ) : (
            <>
              {offers.map((offer, index) => (
                <motion.div
                  key={offer.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.15), ease: [0.25, 0.1, 0.25, 1] }}
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
                    image={offer.image ?? undefined}
                    upvotes={offer.upvotes}
                    downvotes={offer.downvotes}
                    votes={offer.votes}
                    offerUrl={offer.offerUrl}
                    author={offer.author}
                    onCardClick={() => setSelectedOffer(offer)}
                    onFavoriteChange={(fav) => handleFavoriteChange(offer.id, fav)}
                    userVote={voteMap[offer.id] ?? null}
                    isLiked={!!favoriteMap[offer.id]}
                    createdAt={offer.createdAt}
                  />
                </motion.div>
              ))}
              {((viewMode === 'latest' || viewMode === 'personalized') && !debouncedQuery.trim()
                ? hasMoreCursor
                : true) && (
                <div className="flex justify-center pt-4 md:pt-6">
                  <button
                    type="button"
                    onClick={() => {
                      if ((viewMode === 'latest' || viewMode === 'personalized') && !debouncedQuery.trim()) {
                        fetchNextPage();
                      } else {
                        setLimit((prev) => prev + 12);
                      }
                    }}
                    className="rounded-xl border-2 border-violet-600 dark:border-violet-500 bg-white dark:bg-gray-900 px-6 py-2.5 text-sm font-semibold text-violet-600 dark:text-violet-400 transition-all duration-200 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                  >
                    Cargar más
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </section>

        <div className="h-20 md:h-0" />

      <div className="luna-chat">
        <ChatBubble />
      </div>

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
            steps={selectedOffer.steps}
            conditions={selectedOffer.conditions}
            coupons={selectedOffer.coupons}
            offerUrl={selectedOffer.offerUrl}
            upvotes={selectedOffer.upvotes}
            downvotes={selectedOffer.downvotes}
            offerId={selectedOffer.id}
            author={selectedOffer.author}
            image={selectedOffer.image}
            imageUrls={selectedOffer.imageUrls}
            msiMonths={selectedOffer.msiMonths}
            isLiked={!!favoriteMap[selectedOffer.id]}
            onFavoriteChange={(fav) => handleFavoriteChange(selectedOffer.id, fav)}
            userVote={voteMap[selectedOffer.id] ?? 0}
          />
        )}

      </div>
    </ClientLayout>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Cargando…</div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
