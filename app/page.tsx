'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import ClientLayout from './ClientLayout';
import Hero from './components/Hero';
import OfferCard from './components/OfferCard';
import OfferCardSkeleton from './components/OfferCardSkeleton';
import ChatBubble from './components/ChatBubble';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useUI } from '@/app/providers/UIProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { useOffersRealtime } from '@/lib/hooks/useOffersRealtime';
import {
  fetchBatchUserData,
  type VoteMap,
  type VoteValueMap,
  type FavoriteMap,
} from '@/lib/offers/batchUserData';
import { getSearchTerms } from '@/lib/searchGroups';
import {
  mapOfferToCard,
  type CardOffer,
  type RankedOfferSource,
  type FeedApiItemShape,
} from '@/lib/offers/transform';
import { logClientError, notifyUserError } from '@/lib/utils/handleError';
import { logEvent } from '@/lib/monitoring/clientLogger';
import { recordFeedLoadFailure, recordFeedLoadSuccess } from '@/lib/monitoring/feedConsecutiveErrors';
import { homeFeedCategoryInList, homeFeedCreatedAtIsoMin, homeSearchCategoryInList } from '@/lib/offers/homeFeedFilters';
import { buildOfferPublicPath } from '@/lib/offerPath';

/** When true, home feed uses /api/feed/home first; on failure falls back to existing Supabase fetch. */
const USE_NEW_FEED = true;

type TimeFilter = 'day' | 'week' | 'month';
type ViewMode = 'vitales' | 'top' | 'personalized' | 'latest';

/** Ofertas con score >= este valor solo aparecen en Top, no en Día a día. */
const DIA_A_DIA_SCORE_CAP = 90;

type Offer = CardOffer;

interface OfferRow {
  id: string;
  title: string;
  price: number;
  original_price: number;
  image_url?: string | null;
  image_urls?: string[] | null;
  msi_months?: number | null;
  bank_coupon?: string | null;
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
  ranking_blend?: number | null;
  profiles?:
    | { display_name: string | null; avatar_url: string | null; leader_badge?: string | null; ml_tracking_tag?: string | null }
    | { display_name: string | null; avatar_url: string | null; leader_badge?: string | null; ml_tracking_tag?: string | null }[]
    | null;
}

/** Umbral mínimo de ranking_blend para mostrar badge "Destacada" (calidad + votos ponderados). */
const DESTACADA_RANKING_BLEND_MIN = 15;

/** Imágenes placeholder por oferta tester: texto acorde al producto (placehold.co) para no romper diseño/confianza. */
const MOCK_TESTER_IMAGES: Record<string, string> = {
  'tester-1': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=iPhone+16+Pro',
  'tester-2': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=PC+Gamer',
  'tester-3': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Nike+Air+Max',
  'tester-4': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Lavasecadora',
  'tester-5': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Sartenes',
  'tester-6': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=MacBook+Air',
  'tester-7': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Audifonos+Sony',
  'tester-8': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Silla+Gamer',
  'tester-9': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=TV+Samsung',
  'tester-10': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Cafetera',
  'tester-11': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Mochila',
  'tester-12': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Tablet+Galaxy',
  'tester-13': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Aspiradora',
  'tester-14': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Reloj+Smart',
  'tester-15': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Bici+Electrica',
};

/** Ofertas de ejemplo: solo en desarrollo; en producción el array queda vacío aunque el flag esté activo. */
const MOCK_TESTER_OFFERS: CardOffer[] =
  process.env.NODE_ENV === 'development'
    ? [
        { id: 'tester-1', title: 'iPhone 16 Pro Max 256 GB Liberado', brand: 'Apple', originalPrice: 32999, discountPrice: 27999, discount: 15, upvotes: 24, downvotes: 2, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-1'], votes: { up: 24, down: 2, score: 44 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-2', title: 'PC Gamer AMD Ryzen 5 5600 RTX 4060 16GB', brand: 'Armada', originalPrice: 18999, discountPrice: 15999, discount: 16, upvotes: 18, downvotes: 1, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-2'], votes: { up: 18, down: 1, score: 34 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-3', title: 'Tenis Nike Air Max 270 Hombre', brand: 'Nike', originalPrice: 2499, discountPrice: 1799, discount: 28, upvotes: 12, downvotes: 0, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-3'], votes: { up: 12, down: 0, score: 24 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-4', title: 'Lavasecadora Midea 12kg Titanium', brand: 'Midea', originalPrice: 8999, discountPrice: 6999, discount: 22, upvotes: 8, downvotes: 1, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-4'], votes: { up: 8, down: 1, score: 14 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-5', title: 'Juego 3 Sartenes Deleite Vasconia Negro', brand: 'Vasconia', originalPrice: 899, discountPrice: 599, discount: 33, upvotes: 6, downvotes: 0, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-5'], votes: { up: 6, down: 0, score: 12 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-6', title: 'MacBook Air M3 13" 8GB 256GB', brand: 'Apple', originalPrice: 24999, discountPrice: 21999, discount: 12, upvotes: 15, downvotes: 2, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-6'], votes: { up: 15, down: 2, score: 26 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-7', title: 'Audífonos Sony WH-1000XM5', brand: 'Sony', originalPrice: 6999, discountPrice: 5499, discount: 21, upvotes: 10, downvotes: 0, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-7'], votes: { up: 10, down: 0, score: 20 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-8', title: 'Silla Gamer Ergonómica Reclinable', brand: 'ProGear', originalPrice: 4499, discountPrice: 3499, discount: 22, upvotes: 7, downvotes: 1, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-8'], votes: { up: 7, down: 1, score: 12 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-9', title: 'Smart TV Samsung 55" 4K Crystal UHD', brand: 'Samsung', originalPrice: 12999, discountPrice: 9999, discount: 23, upvotes: 14, downvotes: 2, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-9'], votes: { up: 14, down: 2, score: 24 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-10', title: 'Cafetera Nespresso Vertuo Next', brand: 'Nespresso', originalPrice: 2499, discountPrice: 1999, discount: 20, upvotes: 9, downvotes: 0, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-10'], votes: { up: 9, down: 0, score: 18 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-11', title: 'Mochila Antirrobo USB Portátil', brand: 'Vagabond', originalPrice: 699, discountPrice: 449, discount: 36, upvotes: 5, downvotes: 0, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-11'], votes: { up: 5, down: 0, score: 10 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-12', title: 'Tablet Galaxy Tab S9 128GB', brand: 'Samsung', originalPrice: 9999, discountPrice: 7999, discount: 20, upvotes: 11, downvotes: 1, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-12'], votes: { up: 11, down: 1, score: 20 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-13', title: 'Aspiradora Inalámbrica Dyson V12', brand: 'Dyson', originalPrice: 11999, discountPrice: 9499, discount: 21, upvotes: 13, downvotes: 2, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-13'], votes: { up: 13, down: 2, score: 22 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-14', title: 'Reloj Inteligente Amazfit GTR 4', brand: 'Amazfit', originalPrice: 3999, discountPrice: 2999, discount: 25, upvotes: 8, downvotes: 0, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-14'], votes: { up: 8, down: 0, score: 16 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
        { id: 'tester-15', title: 'Bicicleta Eléctrica Plegable 250W', brand: 'E-Motion', originalPrice: 14999, discountPrice: 11999, discount: 20, upvotes: 16, downvotes: 1, offerUrl: '', image: MOCK_TESTER_IMAGES['tester-15'], votes: { up: 16, down: 1, score: 30 }, author: { username: 'Tester' }, ranking_momentum: 0, createdAt: new Date().toISOString() },
      ]
    : [];

const DIA_A_DIA_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'moda', label: 'Ropa' },
  { value: 'supermercado', label: 'Comida' },
  { value: 'hogar', label: 'Hogar' },
  { value: 'belleza', label: 'Belleza' },
  { value: 'viajes', label: 'Viajes' },
  { value: 'servicios', label: 'Servicios' },
];

async function fetchFeedFromAPI(opts: {
  limit: number;
  viewMode: ViewMode;
  timeFilter: TimeFilter;
  categoryFilter: string | null;
  storeFilter: string | null;
}): Promise<FeedApiItemShape[] | null> {
  try {
    const type = opts.viewMode === 'latest' ? 'recent' : 'trending';
    const params = new URLSearchParams({
      limit: String(opts.limit),
      type,
      period: opts.timeFilter,
    });
    if (opts.viewMode === 'vitales' || opts.viewMode === 'top' || opts.viewMode === 'latest') {
      params.set('view', opts.viewMode);
    }
    if (opts.categoryFilter?.trim()) params.set('category', opts.categoryFilter.trim());
    if (opts.storeFilter?.trim()) params.set('store', opts.storeFilter.trim());
    const res = await fetch(`/api/feed/home?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('API response failed');
    const data = await res.json();
    if (!data.success) throw new Error(data.error ?? 'API error');
    return data.data ?? null;
  } catch (error) {
    console.error('[FEED API FALLBACK]', error);
    return null;
  }
}

function HomeContent() {
  useTheme();
  const { showToast, openUploadModal, openRegisterModal } = useUI();
  const { session } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [voteMap, setVoteMap] = useState<VoteMap>({});
  const [voteValueMap, setVoteValueMap] = useState<VoteValueMap>({});
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({});
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('day');
  const [viewMode, setViewMode] = useState<ViewMode>('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [storeList, setStoreList] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [limit, setLimit] = useState(12);
  const [hasMoreCursor, setHasMoreCursor] = useState(true);
  const [showTesterOffers, setShowTesterOffers] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const prevFiltersRef = useRef({ viewMode, timeFilter, debouncedQuery, storeFilter: null as string | null, categoryFilter: null as string | null });
  const fetchOffersRef = useRef<((overrideLimit?: number) => void) | null>(null);
  const debouncedQueryRef = useRef(debouncedQuery);
  const feedStaleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    debouncedQueryRef.current = debouncedQuery;
  }, [debouncedQuery]);

  const scheduleFeedRefetch = useCallback(() => {
    if (debouncedQueryRef.current.trim()) return;
    if (feedStaleTimerRef.current) clearTimeout(feedStaleTimerRef.current);
    feedStaleTimerRef.current = setTimeout(() => {
      feedStaleTimerRef.current = null;
      fetchOffersRef.current?.(undefined);
    }, 700);
  }, []);

  useEffect(() => {
    if (pathname !== '/') return;
    fetch('/api/app-config?key=show_tester_offers')
      .then((r) => r.json())
      .then((data) => setShowTesterOffers(data?.value === true))
      .catch(() => {
        setShowTesterOffers(false);
        showToast?.('No se pudo cargar la configuración. Usa la app con normalidad.');
      });
  }, [pathname, showToast]);

  useEffect(() => {
    fetch('/api/stores')
      .then((r) => r.json())
      .then((body) => (Array.isArray(body?.stores) ? setStoreList(body.stores) : null))
      .catch(() => {
        showToast?.('No se pudieron cargar las tiendas. Revisa tu conexión.');
      });
  }, [showToast]);

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

  // Abrir modal de subir oferta cuando se llega desde extensión o /subir (?upload=1&title=...&image=...&offer_url=...&store=...)
  useEffect(() => {
    if (pathname === '/' && searchParams.get('upload') === '1') {
      openUploadModal();
    }
  }, [pathname, searchParams, openUploadModal]);

  const fetchOffers = useCallback((overrideLimit?: number) => {
    setLoading(true);
    setFeedError(null);
    const effectiveLimit = overrideLimit ?? limit;

    // "Para ti": feed por afinidad (favoritos y votos) — API dedicada
    if (viewMode === 'personalized' && session?.access_token) {
      const params = new URLSearchParams({ limit: String(effectiveLimit) });
      if (storeFilter?.trim()) params.set('store', storeFilter.trim());
      if (categoryFilter?.trim()) params.set('category', categoryFilter.trim());
      fetch(`/api/feed/for-you?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Error'))))
        .then((data) => {
          const rows = (data?.offers ?? []) as OfferRow[];
          setOffers(rows.map((r) => mapOfferToCard(r as RankedOfferSource)));
          setHasMoreCursor(false);
          recordFeedLoadSuccess();
          logEvent({
            type: 'view',
            source: 'feed:loaded',
            metadata: { count: rows.length, viewMode: 'personalized' },
          });
        })
        .catch((err) => {
          recordFeedLoadFailure({ branch: 'for-you' });
          notifyUserError(showToast, 'No pudimos cargar tu feed personalizado. Revisa tu conexión.', 'feed:for-you', err);
          setFeedError('load');
          setOffers([]);
        })
        .finally(() => setLoading(false));
      return;
    }

    const runSupabaseFetch = () => {
      const supabase = createClient();
      const now = new Date();
      const nowISO = now.toISOString();
      const fechaLimiteISO = homeFeedCreatedAtIsoMin(timeFilter);

      let query = supabase
        .from('ofertas_ranked_general')
        .select('id, title, price, original_price, image_url, image_urls, msi_months, bank_coupon, store, offer_url, description, steps, conditions, coupons, created_at, created_by, up_votes, down_votes, score, score_final, ranking_momentum, ranking_blend, profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag, slug)')
        .order('ranking_blend', { ascending: false })
        .or('status.eq.approved,status.eq.published')
        .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
        .gte('created_at', fechaLimiteISO);

      if (storeFilter?.trim()) {
        query = query.eq('store', storeFilter.trim());
      }
      if (viewMode === 'vitales' || viewMode === 'top' || viewMode === 'latest') {
        const catIn = homeFeedCategoryInList(viewMode, categoryFilter);
        if (catIn != null && catIn.length > 0) {
          query = catIn.length === 1 ? query.eq('category', catIn[0]) : query.in('category', catIn);
        }
      }
      if (viewMode === 'top') {
        query = query.gte('up_votes', 1);
      }
      if (viewMode === 'top') {
        query = query.order('score_final', { ascending: false });
      } else if (viewMode === 'latest') {
        query = query.order('created_at', { ascending: false });
      }

      const fetchLimit = viewMode === 'vitales' ? 60 : effectiveLimit;
      Promise.resolve(query.limit(fetchLimit))
        .then(({ data, error }) => {
          setLoading(false);
          if (error) {
            recordFeedLoadFailure({ branch: 'ofertas_ranked' });
            notifyUserError(
              showToast,
              'No pudimos cargar las ofertas. Revisa tu conexión.',
              'feed:ofertas_ranked',
              error
            );
            setFeedError('load');
            setOffers([]);
            return;
          }
          setFeedError(null);
          const rows = data ?? [];
          let list = rows.map((r) => mapOfferToCard(r as RankedOfferSource));
          if (viewMode === 'vitales') {
            list = list.filter((o) => (o.votes?.score ?? 0) < DIA_A_DIA_SCORE_CAP);
            list.sort((a, b) => (b.votes?.score ?? 0) - (a.votes?.score ?? 0));
            const half = Math.ceil(list.length / 2);
            const high = list.slice(0, half);
            const low = list.slice(half);
            const interleaved: typeof list = [];
            for (let i = 0; i < Math.max(high.length, low.length); i++) {
              if (high[i]) interleaved.push(high[i]);
              if (low[i]) interleaved.push(low[i]);
            }
            list = interleaved.slice(0, effectiveLimit);
          }
          setOffers(list);
          setHasMoreCursor(viewMode === 'vitales' ? false : rows.length >= effectiveLimit);
          recordFeedLoadSuccess();
          logEvent({
            type: 'view',
            source: 'feed:loaded',
            metadata: { count: list.length, viewMode, source: 'supabase' },
          });
        })
        .catch((err) => {
          recordFeedLoadFailure({ branch: 'ofertas_ranked' });
          notifyUserError(showToast, 'No pudimos cargar las ofertas. Revisa tu conexión.', 'feed:ofertas_ranked', err);
          setLoading(false);
          setFeedError('load');
          setOffers([]);
        });
    };

    if (viewMode === 'personalized' && !session?.access_token) {
      runSupabaseFetch();
      return;
    }

    if (USE_NEW_FEED) {
      const apiLimit = viewMode === 'vitales' ? Math.max(effectiveLimit, 60) : effectiveLimit;
      fetchFeedFromAPI({
        limit: apiLimit,
        viewMode,
        timeFilter,
        categoryFilter,
        storeFilter,
      })
        .then((data) => {
          if (data != null && Array.isArray(data)) {
            let list = data.map((item) => mapOfferToCard(item as FeedApiItemShape));
            if (viewMode === 'top') {
              list = list.filter((o) => (o.upvotes ?? 0) >= 1);
            }
            setOffers(list);
            setLoading(false);
            setFeedError(null);
            setHasMoreCursor(false);
            recordFeedLoadSuccess();
            logEvent({
              type: 'view',
              source: 'feed:loaded',
              metadata: { count: list.length, viewMode, source: 'api/feed/home' },
            });
            return;
          }
          runSupabaseFetch();
        })
        .catch((err) => {
          logClientError('feed:home-api', err);
          runSupabaseFetch();
        });
      return;
    }

    runSupabaseFetch();
  }, [timeFilter, viewMode, limit, storeFilter, categoryFilter, session?.access_token, showToast]);

  useEffect(() => {
    fetchOffersRef.current = fetchOffers;
  }, [fetchOffers]);

  useOffersRealtime(setOffers, { onFeedMaybeStale: scheduleFeedRefetch });

  const fetchNextPage = useCallback(() => {
    if (viewMode !== 'latest') return;
    if (offers.length === 0) return;
    const lastCreatedAt = offers[offers.length - 1]?.createdAt;
    if (!lastCreatedAt) return;
    setLoading(true);
    const supabase = createClient();
    const nowISO = new Date().toISOString();
    const fechaLimiteISO = homeFeedCreatedAtIsoMin(timeFilter);
    let nextQuery = supabase
      .from('ofertas_ranked_general')
      .select('id, title, price, original_price, image_url, image_urls, msi_months, bank_coupon, store, offer_url, description, steps, conditions, coupons, created_at, created_by, up_votes, down_votes, score, score_final, ranking_momentum, ranking_blend, profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag, slug)')
      .or('status.eq.approved,status.eq.published')
      .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
      .gte('created_at', fechaLimiteISO)
      .lt('created_at', lastCreatedAt)
      .order('created_at', { ascending: false })
      .limit(13);
    if (storeFilter?.trim()) {
      nextQuery = nextQuery.eq('store', storeFilter.trim());
    }
    const nextCatIn = homeFeedCategoryInList('latest', categoryFilter);
    if (nextCatIn != null && nextCatIn.length > 0) {
      nextQuery =
        nextCatIn.length === 1 ? nextQuery.eq('category', nextCatIn[0]) : nextQuery.in('category', nextCatIn);
    }
    Promise.resolve(nextQuery)
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          recordFeedLoadFailure({ branch: 'next-page' });
          notifyUserError(showToast, 'No pudimos cargar más ofertas.', 'feed:next-page', error);
          return;
        }
        const rows = (data ?? []).map((r) => mapOfferToCard(r as RankedOfferSource));
        setHasMoreCursor(rows.length >= 12);
        setOffers((prev) => [...prev, ...rows.slice(0, 12)]);
        recordFeedLoadSuccess();
      })
      .catch((err) => {
        setLoading(false);
        recordFeedLoadFailure({ branch: 'next-page' });
        notifyUserError(showToast, 'No pudimos cargar más ofertas.', 'feed:next-page', err);
      });
  }, [viewMode, timeFilter, storeFilter, categoryFilter, offers, showToast]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (pathname !== '/') return;

    const filtersChanged =
      prevFiltersRef.current.viewMode !== viewMode ||
      prevFiltersRef.current.timeFilter !== timeFilter ||
      prevFiltersRef.current.debouncedQuery !== debouncedQuery ||
      prevFiltersRef.current.storeFilter !== storeFilter ||
      prevFiltersRef.current.categoryFilter !== categoryFilter;
    const effectiveLimit = filtersChanged ? 12 : limit;
    if (filtersChanged) {
      prevFiltersRef.current = { viewMode, timeFilter, debouncedQuery, storeFilter, categoryFilter };
      setLimit(12);
      setHasMoreCursor(true);
    }

    setLoading(true);
    if (debouncedQuery.trim()) {
      const supabase = createClient();
      const nowISO = new Date().toISOString();
      const terms = getSearchTerms(debouncedQuery.trim());
      const escape = (s: string) => s.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const searchConditions = terms.length > 0
        ? terms.flatMap((t) => {
            const safe = escape(t);
            return [`title.ilike.%${safe}%`, `store.ilike.%${safe}%`, `description.ilike.%${safe}%`];
          }).join(',')
        : `title.ilike.%${escape(debouncedQuery.trim())}%,store.ilike.%${escape(debouncedQuery.trim())}%,description.ilike.%${escape(debouncedQuery.trim())}%`;
      // Búsqueda en título, tienda y descripción; grupos (ej. apple → iphone, mac) en lib/searchGroups
      let searchQueryBuilder = supabase
        .from('ofertas_ranked_general')
        .select(
          'id, title, price, original_price, image_url, image_urls, msi_months, bank_coupon, store, offer_url, description, steps, conditions, coupons, created_at, created_by, up_votes, down_votes, score, ranking_momentum, ranking_blend, profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag, slug)'
        )
        .or('status.eq.approved,status.eq.published')
        .or(`expires_at.is.null,expires_at.gte.${nowISO}`)
        .or(searchConditions)
        .order('ranking_blend', { ascending: false })
        .limit(effectiveLimit);
      if (storeFilter?.trim()) {
        searchQueryBuilder = searchQueryBuilder.eq('store', storeFilter.trim());
      }
      const searchCatIn = homeSearchCategoryInList(viewMode, categoryFilter);
      if (searchCatIn != null && searchCatIn.length > 0) {
        searchQueryBuilder =
          searchCatIn.length === 1
            ? searchQueryBuilder.eq('category', searchCatIn[0])
            : searchQueryBuilder.in('category', searchCatIn);
      }
      Promise.resolve(searchQueryBuilder)
        .then(({ data, error }) => {
          setLoading(false);
          if (error) {
            recordFeedLoadFailure({ branch: 'search' });
            notifyUserError(showToast, 'No pudimos cargar la búsqueda. Revisa tu conexión.', 'feed:search', error);
            setFeedError('load');
            setOffers([]);
            return;
          }
          setFeedError(null);
          const searchRows = data ?? [];
          setOffers(searchRows.map((r) => mapOfferToCard(r as RankedOfferSource)));
          recordFeedLoadSuccess();
          logEvent({
            type: 'view',
            source: 'feed:loaded',
            metadata: { count: searchRows.length, search: true },
          });
        })
        .catch((err) => {
          recordFeedLoadFailure({ branch: 'search' });
          notifyUserError(showToast, 'No pudimos cargar la búsqueda. Revisa tu conexión.', 'feed:search', err);
          setLoading(false);
          setFeedError('load');
          setOffers([]);
        });
    } else {
      fetchOffers(filtersChanged ? 12 : undefined);
      const onVisible = () => {
        if (document.visibilityState === 'visible') fetchOffers(undefined);
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    }
  }, [pathname, viewMode, timeFilter, debouncedQuery, storeFilter, categoryFilter, limit, fetchOffers, showToast]);

  useEffect(() => {
    if (!session && viewMode === 'personalized') {
      setViewMode('latest');
    }
  }, [session, viewMode]);

  const displayOffers = showTesterOffers && !debouncedQuery.trim() ? [...offers, ...MOCK_TESTER_OFFERS] : offers;

  useEffect(() => {
    if (!session?.user?.id || offers.length === 0) {
      if (!session) {
        setVoteMap({});
        setVoteValueMap({});
        setFavoriteMap({});
      }
      return;
    }
    fetchBatchUserData(session.user.id, offers.filter((o) => !o.id.startsWith('tester-')).map((o) => o.id)).then(({ voteMap: vm, voteValueMap: vvm, favoriteMap: fm }) => {
      setVoteMap(vm);
      setVoteValueMap(vvm);
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
      <div id="ayuda" className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a] text-[#1d1d1f] dark:text-[#fafafa]">
        <div className="hero-section">
          <Hero searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        </div>

        <section className="max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 max-[400px]:px-3 md:px-8 pt-2 md:pt-4 pb-32 md:pb-12">
        <div className="mb-4 max-[400px]:mb-3 md:mb-8">
          <div className="mb-3 max-[400px]:mb-2 md:mb-5">
            <div className="flex rounded-2xl max-[400px]:rounded-xl bg-[#e8e8ed] dark:bg-[#1a1a1a] p-1.5 max-[400px]:p-1 md:p-2 border border-[#e5e5e7] dark:border-[#262626] transition-all duration-200">
              <button
                onClick={() => setViewMode('vitales')}
                className={`flex-1 rounded-xl max-[400px]:rounded-lg py-2.5 max-[400px]:py-2 md:py-2.5 text-sm max-[400px]:text-xs font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
                  viewMode === 'vitales'
                    ? 'bg-white dark:bg-[#141414] text-[#1d1d1f] dark:text-[#fafafa] shadow-sm border border-[#e5e5e7] dark:border-[#262626]'
                    : 'text-[#6e6e73] dark:text-[#a3a3a3]'
                }`}
                title="Lo esencial, nosotros lo cazamos por ti"
              >
                Día a día
              </button>
              <button
                onClick={() => setViewMode('top')}
                className={`flex-1 rounded-xl max-[400px]:rounded-lg py-2.5 max-[400px]:py-2 md:py-2.5 text-sm max-[400px]:text-xs font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
                  viewMode === 'top'
                    ? 'bg-white dark:bg-[#141414] text-[#1d1d1f] dark:text-[#fafafa] shadow-sm border border-[#e5e5e7] dark:border-[#262626]'
                    : 'text-[#6e6e73] dark:text-[#a3a3a3]'
                }`}
                title="Mejor puntuadas en el período (hoy, semana, mes)"
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
                title="Solo lo más nuevo, ordenado por fecha"
              >
                Recientes
              </button>
            </div>
            <p className="mt-1.5 text-xs text-[#6e6e73] dark:text-[#a3a3a3] hidden sm:block">
              {viewMode === 'vitales' && 'Lo esencial, nosotros lo cazamos por ti.'}
              {viewMode === 'top' && 'Mejor puntuadas en el período elegido.'}
              {viewMode === 'personalized' &&
                'Prioriza tus categorías en Configuración y lo que guardas o votas (misma categoría o tienda; ofertas recientes).'}
              {viewMode === 'latest' && 'Solo lo más nuevo, por fecha de publicación.'}
            </p>

            {viewMode === 'vitales' && (
              <div className="mt-3 max-[400px]:mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide md:overflow-visible md:flex-wrap">
                <button
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all shrink-0 ${
                    !categoryFilter
                      ? 'bg-[#1d1d1f] dark:bg-[#fafafa] text-white dark:text-[#1d1d1f]'
                      : 'bg-[#e8e8ed] dark:bg-[#2c2c2e] text-[#6e6e73] dark:text-[#a3a3a3] hover:bg-[#d2d2d7] dark:hover:bg-[#3a3a3c]'
                  }`}
                >
                  Todas
                </button>
                {DIA_A_DIA_FILTERS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategoryFilter(categoryFilter === c.value ? null : c.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all shrink-0 ${
                      categoryFilter === c.value
                        ? 'bg-[#1d1d1f] dark:bg-[#fafafa] text-white dark:text-[#1d1d1f]'
                        : 'bg-[#e8e8ed] dark:bg-[#2c2c2e] text-[#6e6e73] dark:text-[#a3a3a3] hover:bg-[#d2d2d7] dark:hover:bg-[#3a3a3c]'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
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
          ) : feedError ? (
            <div className="py-12 px-4 text-center">
              <p className="text-[#1d1d1f] dark:text-[#fafafa] font-medium mb-2">
                No pudimos cargar las ofertas. Revisa tu conexión e intenta de nuevo.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFeedError(null);
                  fetchOffers(12);
                }}
                className="rounded-xl border-2 border-violet-600 dark:border-violet-500 bg-white dark:bg-gray-900 px-6 py-2.5 text-sm font-semibold text-violet-600 dark:text-violet-400 transition-all duration-200 hover:bg-violet-50 dark:hover:bg-violet-900/20"
              >
                Reintentar
              </button>
            </div>
          ) : !debouncedQuery.trim() && offers.length === 0 ? (
            <div className="py-12 px-4 text-center max-w-md mx-auto">
              <h2 className="text-xl font-semibold text-[#1d1d1f] dark:text-[#fafafa] mb-2">
                Aún no hay ofertas
              </h2>
              <p className="text-[#6e6e73] dark:text-[#a3a3a3] text-sm mb-6">
                Sé el primero en subir una buena oferta a la comunidad.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (session) {
                    openUploadModal();
                  } else {
                    openRegisterModal('signup');
                  }
                }}
                className="rounded-xl bg-violet-600 dark:bg-violet-500 text-white px-6 py-3 text-sm font-semibold transition-all duration-200 hover:bg-violet-700 dark:hover:bg-violet-600"
              >
                Subir oferta
              </button>
            </div>
          ) : debouncedQuery.trim() && offers.length === 0 ? (
            <div className="py-12 text-center text-[#6e6e73] dark:text-[#a3a3a3]">
              No se encontraron resultados
            </div>
          ) : (
            <>
              {displayOffers.map((offer, index) => (
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
                    onCardClick={() => {
                    router.push(buildOfferPublicPath(offer.id, offer.title));
                  }}
                    onFavoriteChange={(fav) => handleFavoriteChange(offer.id, fav)}
                    onVoteChange={handleVoteChange}
                    userVote={voteMap[offer.id] ?? null}
                    userVoteStoredValue={voteValueMap[offer.id] ?? null}
                    isLiked={!!favoriteMap[offer.id]}
                    createdAt={offer.createdAt}
                    msiMonths={offer.msiMonths}
                    bankCoupon={offer.bankCoupon}
                    isDestacada={offer.ranking_blend != null && offer.ranking_blend >= DESTACADA_RANKING_BLEND_MIN}
                    isTesterOffer={offer.id.startsWith('tester-')}
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
