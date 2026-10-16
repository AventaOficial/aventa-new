'use client';

import { useState, useEffect, useCallback, useRef, Suspense, Fragment } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Clock, ShoppingBasket, Star, User, Zap } from 'lucide-react';
import ClientLayout from './ClientLayout';
import Hero, { SearchField } from './components/Hero';
import OfferCard from './components/OfferCard';
import OfferCardSkeleton from './components/OfferCardSkeleton';
import FeaturedOfferCard from './components/FeaturedOfferCard';
import { HomeDesktopRail, SponsoredSlot } from './components/HomeSponsored';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useUI } from '@/app/providers/UIProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { useOffersRealtime } from '@/lib/hooks/useOffersRealtime';
import {
  fetchBatchUserData,
  type VoteMap,
  type VoteValueMap,
  type FavoriteMap,
} from '@/lib/offers/batchUserData';
import { ALL_CATEGORIES } from '@/lib/categories';
import { safeDecodeURIComponentOnce } from '@/lib/server/safeUriDecode';
import {
  mapOfferToCard,
  type CardOffer,
  type RankedOfferSource,
  type FeedApiItemShape,
} from '@/lib/offers/transform';
import { notifyUserError } from '@/lib/utils/handleError';
import { logEvent } from '@/lib/monitoring/clientLogger';
import { recordFeedLoadFailure, recordFeedLoadSuccess } from '@/lib/monitoring/feedConsecutiveErrors';
import {
  DEFAULT_TOP_PERIOD,
  excludeMachineOffers,
  fetchDespensaPreferredNeeds,
  fetchHomeFeedFromAPI,
  processHomeFeedList,
  resolveHomeFeedEmptyState,
} from '@/lib/offers/homeFeedClient';
import {
  HOME_FEED_PAGE_SIZE,
  HOME_TAB_PARAM,
  excludeFeaturedOffers,
  homeFeedHeading,
  homeFeedPageSize,
  homeTabDefinition,
  homeTabHref,
  hrefWithoutParams,
  parseHomeTab,
  vitalesApiLimit,
  vitalesHasMore,
  visibleHomeTabs,
  type HomeTab,
} from '@/lib/offers/homeFeedTabs';
import { DEFAULT_MAX_SAME_PRODUCT, resolveMaxSameProduct } from '@/lib/offers/feedDiversity';
import { appendOffersById, refreshFeedWithoutDroppingPages } from '@/lib/offers/feedList';
import { buildOfferPublicPath } from '@/lib/offerPath';
import { testersForTab } from '@/lib/offers/testerOffers';
import { DEFAULT_FEED_POLICY, planFeedPlacements, type SponsoredCampaign } from '@/lib/sponsored/placements';
import { SPONSORED_CAMPAIGNS } from '@/lib/sponsored/campaigns';
import { activeHuntersFromFeed } from '@/lib/community/feedHunters';
import { resolveActiveSeason, type SeasonDefinition } from '@/lib/seasons/resolve';
import SeasonLayer from './components/SeasonLayer';
import { PersonalInterestRail, type InterestRailOffer } from './components/feed/PersonalInterestRail';
import { DespensaBudgetCard } from './components/feed/DespensaBudgetCard';
import { useDespensaBudget } from './components/feed/useDespensaBudget';
import type { DespensaBudget } from '@/lib/despensa/budget';
import {
  shouldShowTopFeaturedCarousel,
  topFeaturedCarouselHeading,
} from '@/lib/offers/topFeaturedCarousel';

type TimeFilter = 'day' | 'week' | 'month';
type ViewMode = HomeTab;

const TAB_ICONS: Record<HomeTab, typeof Zap> = { vitales: Zap, top: Star, personalized: User, latest: Clock };

/** Búsqueda en el máximo del endpoint: no hay más páginas que pedir. */
const SEARCH_MAX_LIMIT = 50;

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

const DIA_A_DIA_FILTERS: Array<{ value: string; label: string }> = ALL_CATEGORIES.filter((c) => c.vital).map(
  (c) => ({ value: c.value, label: c.label })
);

let vitalesCapRequest: Promise<number> | null = null;

function readVitalesCap(): Promise<number> {
  if (vitalesCapRequest) return vitalesCapRequest;
  vitalesCapRequest = (async () => {
    try {
      const res = await fetch('/api/feed/presentation', { cache: 'no-store' });
      if (!res.ok) return DEFAULT_MAX_SAME_PRODUCT;
      const body = (await res.json()) as { maxSameProduct?: unknown };
      return resolveMaxSameProduct(body.maxSameProduct);
    } catch {
      return DEFAULT_MAX_SAME_PRODUCT;
    }
  })();
  return vitalesCapRequest;
}

const DESPENSA_PREFS_TTL_MS = 60_000;
let despensaPrefsRequest: { token: string; at: number; needs: Promise<Set<string>> } | null = null;

function readDespensaPreferences(token: string | null | undefined): Promise<Set<string>> {
  if (!token) return Promise.resolve(new Set());
  const now = Date.now();
  if (despensaPrefsRequest?.token === token && now - despensaPrefsRequest.at < DESPENSA_PREFS_TTL_MS) {
    return despensaPrefsRequest.needs;
  }
  despensaPrefsRequest = { token, at: now, needs: fetchDespensaPreferredNeeds(token) };
  return despensaPrefsRequest.needs;
}

function HomeContent() {
  useTheme();
  const { showToast, openUploadModal, openRegisterModal } = useUI();
  const { session, isLoading: authLoading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  /** La URL (`?tab=`) es la única fuente de la pestaña: sobrevive a abrir una oferta y volver. */
  const viewMode: ViewMode = parseHomeTab(searchParams.get(HOME_TAB_PARAM), Boolean(session) || authLoading);
  const setViewMode = useCallback(
    (tab: ViewMode) => {
      router.replace(homeTabHref(pathname, searchParams.toString(), tab), { scroll: false });
    },
    [router, pathname, searchParams],
  );
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [canModerate, setCanModerate] = useState(false);
  const offersCountRef = useRef(0);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [voteMap, setVoteMap] = useState<VoteMap>({});
  const [voteValueMap, setVoteValueMap] = useState<VoteValueMap>({});
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({});
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(DEFAULT_TOP_PERIOD);
  /** Vigencia de campañas patrocinadas: se evalúa una vez por visita, no en cada render. */
  const [sessionStartedAt] = useState(() => Date.now());
  const [season, setSeason] = useState<SeasonDefinition | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [storeList, setStoreList] = useState<string[]>([]);
  const [highlightOffers, setHighlightOffers] = useState<Offer[]>([]);
  const [topCarouselWeekMonth, setTopCarouselWeekMonth] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [limit, setLimit] = useState(HOME_FEED_PAGE_SIZE);
  const [hasMoreCursor, setHasMoreCursor] = useState(false);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [showTesterOffers, setShowTesterOffers] = useState(false);
  const [justPublished, setJustPublished] = useState<Offer[]>([]);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [interestRail, setInterestRail] = useState<InterestRailOffer[]>([]);
  const despensaBudget = useDespensaBudget('dia_a_dia');
  /** Solo «Día a día» se vuelve a ordenar cuando cambia el presupuesto. */
  const vitalesBudget: DespensaBudget | null = viewMode === 'vitales' ? despensaBudget.budget : null;
  const prevFiltersRef = useRef({ viewMode, timeFilter, debouncedQuery, storeFilter: null as string | null, categoryFilter: null as string | null });
  const fetchOffersRef = useRef<((overrideLimit?: number, opts?: { silent?: boolean }) => void) | null>(null);
  const debouncedQueryRef = useRef(debouncedQuery);
  const feedStaleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipLimitOnlyRefetchRef = useRef(false);

  useEffect(() => {
    debouncedQueryRef.current = debouncedQuery;
  }, [debouncedQuery]);

  const scheduleFeedRefetch = useCallback(() => {
    if (debouncedQueryRef.current.trim()) return;
    if (feedStaleTimerRef.current) clearTimeout(feedStaleTimerRef.current);
    feedStaleTimerRef.current = setTimeout(() => {
      feedStaleTimerRef.current = null;
      fetchOffersRef.current?.(undefined, { silent: true });
    }, 700);
  }, []);

  useEffect(() => {
    setSeason(resolveActiveSeason(new Date()));
  }, []);

  useEffect(() => {
    if (pathname !== '/') return;
    Promise.all([
      fetch('/api/app-config?key=show_tester_offers').then((r) => r.json()),
      fetch('/api/app-config?key=top_carousel_week_month').then((r) => r.json()),
    ])
      .then(([tester, carousel]) => {
        setShowTesterOffers(tester?.value === true);
        setTopCarouselWeekMonth(carousel?.value === true);
      })
      .catch(() => {
        setShowTesterOffers(false);
        setTopCarouselWeekMonth(false);
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

  // Mostrar error de OAuth si el callback redirigió con ?error=... y limpiar esos parámetros
  useEffect(() => {
    const err = searchParams.get('error');
    const msg = searchParams.get('message');
    const clean = () => router.replace(hrefWithoutParams(pathname, searchParams.toString(), ['error', 'message']), { scroll: false });
    if (err === 'missing_code') {
      showToast('No se recibió el código de Google. Vuelve a intentar iniciar sesión.');
      clean();
    } else if (err === 'auth' && msg) {
      showToast(`Error al iniciar sesión: ${safeDecodeURIComponentOnce(msg)}`);
      clean();
    } else if (err === 'config') {
      showToast('Error de configuración. Revisa las variables de entorno.');
      clean();
    }
  }, [searchParams, showToast, router, pathname]);

  // Abrir modal de subir oferta cuando se llega desde extensión o /subir (?upload=1&title=...&image=...&offer_url=...&store=...)
  useEffect(() => {
    if (pathname === '/' && searchParams.get('upload') === '1') {
      const hasOfferContext = ['title', 'image', 'offer_url', 'store'].some((key) => searchParams.get(key));
      openUploadModal(hasOfferContext ? { kind: 'offer' } : undefined);
    }
  }, [pathname, searchParams, openUploadModal]);

  useEffect(() => {
    offersCountRef.current = offers.length;
  }, [offers.length]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    fetch('/api/me/moderation-access', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setCanModerate(body?.canModerate === true);
      })
      .catch(() => {
        if (!cancelled) setCanModerate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const fetchOffers = useCallback((overrideLimit?: number, opts?: { silent?: boolean; append?: boolean }) => {
    const appendFromCount = opts?.append ? offersCountRef.current : 0;
    if (!opts?.silent && !opts?.append) setLoading(true);
    if (opts?.append) {
      setLoadingMore(true);
      setMoreError(false);
    }
    setFeedError(null);
    if (viewMode !== 'personalized') setInterestRail([]);
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
          const matches = Array.isArray(data?.interestMatches) ? (data.interestMatches as InterestRailOffer[]) : [];
          setInterestRail(matches.slice(0, 6).map((offer) => ({
            id: offer.id,
            title: offer.title,
            store: offer.store,
            price: offer.price,
            matchLabel: offer.matchLabel,
          })));
          setOffers(rows.map((r) => mapOfferToCard(r as RankedOfferSource)));
          setHasMoreCursor(data?.hasMore === true);
          recordFeedLoadSuccess();
          logEvent({
            type: 'view',
            source: 'feed:loaded',
            metadata: { count: rows.length, viewMode: 'personalized' },
          });
        })
        .catch((err) => {
          recordFeedLoadFailure({ branch: 'for-you' });
          notifyUserError(showToast, 'No cargó tu lista Para ti. Reintenta.', 'feed:for-you', err);
          setFeedError('load');
          setOffers([]);
        })
        .finally(() => setLoading(false));
      return;
    }
    // «Para ti» mientras la sesión se resuelve: esperar en lugar de cargar otra pestaña.
    if (viewMode === 'personalized') return;

    const homeView = viewMode;
    const apiLimit = homeView === 'vitales' ? vitalesApiLimit(effectiveLimit) : effectiveLimit;

    void Promise.all([
      fetchHomeFeedFromAPI({
        limit: apiLimit,
        viewMode: homeView,
        timeFilter,
        categoryFilter,
        storeFilter,
      }),
      homeView === 'vitales' ? readVitalesCap() : Promise.resolve(DEFAULT_MAX_SAME_PRODUCT),
      homeView === 'vitales' ? readDespensaPreferences(session?.access_token) : Promise.resolve(new Set<string>()),
    ])
      .then(([{ items, nextCursor }, maxSameProduct, preferredNeedIds]) => {
        const processed = processHomeFeedList(
          items.map((item) => mapOfferToCard(item as FeedApiItemShape)),
          homeView,
          homeView === 'vitales' ? effectiveLimit + 1 : effectiveLimit,
          maxSameProduct,
          preferredNeedIds,
          vitalesBudget,
        );
        const list = homeView === 'vitales' ? processed.slice(0, effectiveLimit) : processed;
        const keepPages = Boolean(opts?.silent) && offersCountRef.current > list.length;
        setOffers((prev) => {
          if (opts?.append) return appendOffersById(prev, list.slice(appendFromCount));
          return keepPages ? refreshFeedWithoutDroppingPages(prev, list) : list;
        });
        setJustPublished((prev) => prev.filter((p) => !list.some((o) => o.id === p.id)));
        setLoading(false);
        if (opts?.append) {
          setLoadingMore(false);
          skipLimitOnlyRefetchRef.current = true;
          setLimit(effectiveLimit);
        }
        setFeedError(null);
        if (!keepPages && !opts?.append) {
          setFeedCursor(nextCursor);
          setHasMoreCursor(
            homeView === 'vitales'
              ? vitalesHasMore({ rankedCount: processed.length, pageSize: effectiveLimit, serverHasMore: nextCursor != null })
              : nextCursor != null,
          );
        } else if (opts?.append) {
          setHasMoreCursor(
            homeView === 'vitales'
              ? vitalesHasMore({ rankedCount: processed.length, pageSize: effectiveLimit, serverHasMore: nextCursor != null })
              : nextCursor != null,
          );
        }
        recordFeedLoadSuccess();
        logEvent({
          type: 'view',
          source: 'feed:loaded',
          metadata: { count: list.length, viewMode: homeView, source: 'api/feed/home' },
        });
      })
      .catch((err) => {
        recordFeedLoadFailure({ branch: 'feed/home-api' });
        notifyUserError(showToast, 'No pudimos cargar las ofertas. Revisa tu conexión.', 'feed:home-api', err);
        setLoading(false);
        if (opts?.append) {
          setLoadingMore(false);
          setMoreError(true);
        }
        setFeedError('load');
        if (!opts?.append) setOffers([]);
      });
  }, [timeFilter, viewMode, limit, storeFilter, categoryFilter, session?.access_token, showToast, vitalesBudget]);

  useEffect(() => {
    if (viewMode !== 'top' || debouncedQuery.trim()) {
      setHighlightOffers([]);
      return;
    }
    if (!shouldShowTopFeaturedCarousel(timeFilter, topCarouselWeekMonth)) {
      setHighlightOffers([]);
      return;
    }
    let cancelled = false;
    const loadHighlights = async () => {
      const toCards = (items: FeedApiItemShape[]) =>
        processHomeFeedList(
          items.map((item) => mapOfferToCard(item as FeedApiItemShape)),
          'top',
          12,
        ).sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0));

      try {
        const feed = await fetchHomeFeedFromAPI({
          limit: 12,
          viewMode: 'top',
          timeFilter,
          categoryFilter: null,
          storeFilter,
        });
        if (cancelled) return;
        setHighlightOffers(toCards(feed.items).slice(0, 10));
      } catch {
        if (!cancelled) setHighlightOffers([]);
      }
    };
    void loadHighlights();
    return () => {
      cancelled = true;
    };
  }, [viewMode, debouncedQuery, storeFilter, timeFilter, topCarouselWeekMonth]);

  useEffect(() => {
    fetchOffersRef.current = fetchOffers;
  }, [fetchOffers]);

  useOffersRealtime(setOffers, { onFeedMaybeStale: scheduleFeedRefetch });

  useEffect(() => {
    const onOfferPublished = (event: Event) => {
      const detail = (event as CustomEvent<{ status?: string; offer?: Offer | null }>).detail;
      if (detail?.status === 'approved' && detail.offer?.id) {
        const published = detail.offer;
        setJustPublished((prev) => [published, ...prev.filter((o) => o.id !== published.id)]);
        setOffers((prev) => [published, ...prev.filter((o) => o.id !== published.id)]);
      }
      fetchOffersRef.current?.(undefined, { silent: true });
    };
    window.addEventListener('aventa:offer-published', onOfferPublished);
    return () => window.removeEventListener('aventa:offer-published', onOfferPublished);
  }, []);

  /** Recientes: refresco periódico (realtime global desactivado por carga). */
  useEffect(() => {
    if (viewMode !== 'latest' || debouncedQuery.trim()) return;
    const intervalId = setInterval(() => {
      fetchOffersRef.current?.(undefined, { silent: true });
    }, 45_000);
    return () => clearInterval(intervalId);
  }, [viewMode, debouncedQuery]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && viewMode === 'latest' && !debouncedQuery.trim()) {
        scheduleFeedRefetch();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [viewMode, debouncedQuery, scheduleFeedRefetch]);

  const fetchNextPage = useCallback(() => {
    if (viewMode !== 'latest' || loadingMore || !feedCursor) return;
    setLoadingMore(true);
    setMoreError(false);
    void fetchHomeFeedFromAPI({
      limit: 12,
      viewMode: 'latest',
      timeFilter,
      categoryFilter,
      storeFilter,
      cursor: feedCursor,
    })
      .then(({ items, nextCursor }) => {
        const rows = excludeMachineOffers(items.map((item) => mapOfferToCard(item as FeedApiItemShape)));
        setOffers((prev) => appendOffersById(prev, rows));
        setFeedCursor(nextCursor);
        setHasMoreCursor(nextCursor != null);
        recordFeedLoadSuccess();
      })
      .catch((err) => {
        setMoreError(true);
        recordFeedLoadFailure({ branch: 'next-page' });
        notifyUserError(showToast, 'No pudimos cargar más ofertas.', 'feed:next-page', err);
      })
      .finally(() => setLoadingMore(false));
  }, [viewMode, timeFilter, storeFilter, categoryFilter, feedCursor, loadingMore, showToast]);

  const loadMoreFeed = useCallback(() => {
    if (loadingMore) return;
    if (debouncedQuery.trim()) {
      setLimit((prev) => prev + homeFeedPageSize(viewMode));
      return;
    }
    if (viewMode === 'latest') {
      fetchNextPage();
      return;
    }
    if (viewMode === 'personalized') return;
    fetchOffers(limit + homeFeedPageSize(viewMode), { append: true, silent: true });
  }, [debouncedQuery, viewMode, loadingMore, limit, fetchOffers, fetchNextPage]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (pathname !== '/') return;
    if (skipLimitOnlyRefetchRef.current) {
      skipLimitOnlyRefetchRef.current = false;
      return;
    }

    const filtersChanged =
      prevFiltersRef.current.viewMode !== viewMode ||
      prevFiltersRef.current.timeFilter !== timeFilter ||
      prevFiltersRef.current.debouncedQuery !== debouncedQuery ||
      prevFiltersRef.current.storeFilter !== storeFilter ||
      prevFiltersRef.current.categoryFilter !== categoryFilter;
    const effectiveLimit = filtersChanged ? homeFeedPageSize(viewMode) : limit;
    if (filtersChanged) {
      prevFiltersRef.current = { viewMode, timeFilter, debouncedQuery, storeFilter, categoryFilter };
      setLimit(homeFeedPageSize(viewMode));
      setHasMoreCursor(false);
      setSearchHasMore(false);
    }

    if (filtersChanged || offersCountRef.current === 0) setLoading(true);
    if (debouncedQuery.trim()) {
      const params = new URLSearchParams({
        q: debouncedQuery.trim(),
        limit: String(effectiveLimit),
        view: viewMode,
      });
      if (storeFilter?.trim()) params.set('store', storeFilter.trim());
      if (categoryFilter?.trim()) params.set('category', categoryFilter.trim());
      fetch(`/api/search/offers?${params.toString()}`)
        .then(async (res) => {
          setLoading(false);
          if (!res.ok) {
            recordFeedLoadFailure({ branch: 'search' });
            notifyUserError(showToast, 'No pudimos cargar la búsqueda. Revisa tu conexión.', 'feed:search');
            setFeedError('load');
            setOffers([]);
            setSearchHasMore(false);
            return;
          }
          const json = (await res.json()) as { offers?: RankedOfferSource[] };
          setFeedError(null);
          const searchRows = json.offers ?? [];
          setOffers(searchRows.map((r) => mapOfferToCard(r)));
          setSearchHasMore(searchRows.length >= effectiveLimit && effectiveLimit < SEARCH_MAX_LIMIT);
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

  const testerOffers =
    !debouncedQuery.trim() && showTesterOffers ? testersForTab(viewMode) : [];
  const publishedNow = !debouncedQuery.trim() ? justPublished : [];
  const showTopFeaturedCarousel =
    viewMode === 'top' &&
    !debouncedQuery.trim() &&
    shouldShowTopFeaturedCarousel(timeFilter, topCarouselWeekMonth);

  const featuredOffers = (() => {
    if (!showTopFeaturedCarousel) return [];
    const testers = showTesterOffers ? testersForTab('top') : [];
    const merged = [
      ...highlightOffers,
      ...testers.filter((t) => !highlightOffers.some((o) => o.id === t.id)),
    ];
    return merged
      .sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0))
      .slice(0, 10);
  })();
  const mergedOffers = [...publishedNow, ...offers.filter((o) => !publishedNow.some((p) => p.id === o.id))];
  /** Top: la lista no repite ofertas del carrusel. */
  const displayOffers = excludeFeaturedOffers(
    testerOffers.length > 0 ? [...mergedOffers, ...testerOffers] : mergedOffers,
    featuredOffers,
  );
  const sponsoredAfter = debouncedQuery.trim()
    ? new Map<number, SponsoredCampaign>()
    : planFeedPlacements(displayOffers.length, SPONSORED_CAMPAIGNS, DEFAULT_FEED_POLICY, sessionStartedAt);
  const feedHunters = activeHuntersFromFeed(displayOffers);
  const emptyState = resolveHomeFeedEmptyState({
    viewMode,
    listCount: displayOffers.length,
    featuredCount: featuredOffers.length,
    searching: Boolean(debouncedQuery.trim()),
  });

  useEffect(() => {
    if (!session?.user?.id || (offers.length === 0 && highlightOffers.length === 0)) {
      if (!session) {
        setVoteMap({});
        setVoteValueMap({});
        setFavoriteMap({});
      }
      return;
    }
    fetchBatchUserData(
      session.user.id,
      [...offers, ...highlightOffers]
        .filter((o) => !o.id.startsWith('tester-'))
        .map((o) => o.id),
    ).then(({ voteMap: vm, voteValueMap: vvm, favoriteMap: fm }) => {
      setVoteMap(vm);
      setVoteValueMap(vvm);
      setFavoriteMap(fm);
    });
  }, [session, offers, highlightOffers]);

  const handleFavoriteChange = (offerId: string, isFavorite: boolean) => {
    setFavoriteMap((prev) => ({ ...prev, [offerId]: isFavorite }));
    if (isFavorite) {
      setFavoriteCount((c) => c + 1);
      if (typeof window !== 'undefined' && !localStorage.getItem('favorite_onboarding_seen')) {
        showToast('Listo — no la pierdas de vista.');
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
        <div className="hidden md:block sticky top-0 z-40 border-b border-[#e5e5e7] bg-[#F5F5F7]/90 backdrop-blur-md dark:border-[#262626] dark:bg-[#0a0a0a]/90">
          <div className="mx-auto max-w-[1400px] px-8 py-2.5 pr-56 lg:px-10 lg:pr-72">
            <SearchField searchQuery={searchQuery} onChange={setSearchQuery} placeholder="Buscar ofertas…" />
          </div>
        </div>

        <div className="hero-section">
          <Hero
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            season={season?.modules.includes('hero') ? season.hero : null}
          />
        </div>
        <SeasonLayer season={season} onSearch={setSearchQuery} />

        <section className="mx-auto max-w-[1400px] px-4 max-[400px]:px-3 md:px-8 lg:px-10 pt-1 pb-32 md:pb-12">
        <div className="mb-3 max-[400px]:mb-2 md:mb-4">
          <div className="mb-3 max-[400px]:mb-2">
            <div
              role="group"
              aria-label="Secciones de ofertas"
              className="md:hidden flex rounded-2xl max-[400px]:rounded-xl bg-[#e8e8ed] dark:bg-[#1a1a1a] p-1.5 max-[400px]:p-1 border border-[#e5e5e7] dark:border-[#262626]"
            >
              {visibleHomeTabs(Boolean(session)).map(({ id, label }) => {
                const active = viewMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setViewMode(id)}
                    aria-pressed={active}
                    aria-describedby={active ? 'feed-tab-description' : undefined}
                    className={`flex-1 rounded-xl max-[400px]:rounded-lg py-2.5 max-[400px]:py-2 md:py-2.5 text-sm max-[400px]:text-xs font-semibold transition-all duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] ${
                      active
                        ? 'bg-white dark:bg-[#141414] text-[#1d1d1f] dark:text-[#fafafa] shadow-sm border border-[#e5e5e7] dark:border-[#262626]'
                        : 'text-[#6e6e73] dark:text-[#a3a3a3]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div role="group" aria-label="Secciones de ofertas" className="hidden md:flex flex-wrap items-center gap-2">
              {visibleHomeTabs(Boolean(session)).map(({ id, label }) => {
                const active = viewMode === id;
                const Icon = TAB_ICONS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setViewMode(id)}
                    aria-pressed={active}
                    aria-describedby={active ? 'feed-tab-description' : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-violet-600 text-white'
                        : 'bg-white text-[#6e6e73] border border-[#e5e5e7] hover:border-violet-300 dark:bg-[#141414] dark:text-[#a3a3a3] dark:border-[#262626]'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>
            <p
              id="feed-tab-description"
              aria-live="polite"
              className="mt-1.5 md:mt-2 text-xs text-[#6e6e73] dark:text-[#a3a3a3]"
            >
              {homeTabDefinition(viewMode).description}
            </p>
            {viewMode === 'vitales' && (
              <Link
                href="/despensa"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
              >
                <ShoppingBasket className="h-4 w-4" aria-hidden />
                Mi despensa: compara precios por unidad y arma tu lista
              </Link>
            )}

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
            {viewMode === 'vitales' && despensaBudget.ready && (
              <DespensaBudgetCard
                budget={despensaBudget.budget}
                dismissed={despensaBudget.dismissed}
                saving={despensaBudget.saving}
                onSave={despensaBudget.save}
                onDismiss={despensaBudget.dismiss}
                onReopen={despensaBudget.reopen}
              />
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

        <div className="xl:flex xl:gap-6 xl:items-start">
        <div className="min-w-0 flex-1">
        {viewMode === 'personalized' ? (
          <PersonalInterestRail offers={interestRail} token={session?.access_token ?? null} />
        ) : null}
        {showTopFeaturedCarousel && !loading && !feedError && featuredOffers.length > 0 ? (
          <div className="mb-5">
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-[#1d1d1f] dark:text-[#fafafa]">
              {topFeaturedCarouselHeading(timeFilter)}
            </h2>
            <div className="relative">
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory md:gap-4">
                {featuredOffers.map((offer) => (
                  <div
                    key={`featured-${offer.id}`}
                    className="w-[220px] max-[400px]:w-[200px] md:w-[240px] shrink-0 snap-start"
                  >
                    <FeaturedOfferCard
                      offerId={offer.id}
                      title={offer.title}
                      brand={offer.brand}
                      image={offer.image ?? undefined}
                      imageUrls={offer.imageUrls}
                      originalPrice={offer.originalPrice}
                      discountPrice={offer.discountPrice}
                      sourceCurrency={offer.sourceCurrency}
                      discount={offer.discount}
                      isLiked={!!favoriteMap[offer.id]}
                      isTesterOffer={offer.id.startsWith('tester-')}
                      onCardClick={() => router.push(buildOfferPublicPath(offer.id, offer.title))}
                      onFavoriteChange={(fav) => handleFavoriteChange(offer.id, fav)}
                    />
                  </div>
                ))}
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#F5F5F7] to-transparent dark:from-[#0a0a0a]" />
            </div>
          </div>
        ) : null}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="mt-3 max-[400px]:mt-2 md:mt-0 space-y-4 max-[400px]:space-y-3 md:space-y-5"
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
                No cargó el listado. Reintenta: puede haber algo nuevo.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFeedError(null);
                  fetchOffers(12);
                }}
                className="rounded-xl border-2 border-violet-600 dark:border-violet-500 bg-white dark:bg-[#141414] px-6 py-2.5 text-sm font-semibold text-violet-600 dark:text-violet-400 transition-all duration-200 hover:bg-violet-50 dark:hover:bg-violet-900/20"
              >
                Reintentar
              </button>
            </div>
          ) : emptyState === 'top_period' ? (
            <div className="py-8 px-4 text-center max-w-md mx-auto" data-empty-state="top-period">
              <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3]">
                {timeFilter === 'day'
                  ? 'Hoy todavía no hay ofertas votadas. Mira las destacadas o cambia el período.'
                  : 'No hay más ofertas votadas en este período. Prueba otro período.'}
              </p>
            </div>
          ) : emptyState === 'no_offers' ? (
            <div className="py-12 px-4 text-center max-w-md mx-auto">
              <h2 className="text-xl font-semibold text-[#1d1d1f] dark:text-[#fafafa] mb-2">
                Aún no hay ofertas
              </h2>
              <p className="text-[#6e6e73] dark:text-[#a3a3a3] text-sm mb-6">
                Publica la primera o vuelve en un rato.
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
                Publicar oferta
              </button>
            </div>
          ) : debouncedQuery.trim() && offers.length === 0 ? (
            <div className="py-12 text-center text-[#6e6e73] dark:text-[#a3a3a3]">
              Ningún resultado. Prueba otra marca o palabra.
            </div>
          ) : (
            <>
              <h2 className="hidden md:block text-lg font-semibold tracking-tight text-[#1d1d1f] dark:text-[#fafafa]">
                {homeFeedHeading(viewMode, timeFilter)}
              </h2>
              {displayOffers.map((offer, index) => (
                <Fragment key={offer.id}>
                <motion.div
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
                    sourceCurrency={offer.sourceCurrency}
                    discount={offer.discount}
                    description={offer.description}
                    hunterComment={offer.hunterComment}
                    image={offer.image ?? undefined}
                    imageUrls={offer.imageUrls}
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
                    coupons={offer.coupons}
                    dailyNeed={offer.dailyNeed}
                    isTesterOffer={offer.id.startsWith('tester-')}
                    offerScope={offer.offerScope ?? null}
                    searchPriceAlternate={debouncedQuery.trim() ? offer.searchPriceAlternate : null}
                    canModerate={Boolean(session?.access_token) && canModerate && !offer.id.startsWith('tester-')}
                    onModerated={(id) => {
                      setOffers((prev) => prev.filter((row) => row.id !== id));
                      setJustPublished((prev) => prev.filter((row) => row.id !== id));
                      setHighlightOffers((prev) => prev.filter((row) => row.id !== id));
                    }}
                  />
                </motion.div>
                {sponsoredAfter.has(index) ? (
                  <SponsoredSlot
                    campaign={sponsoredAfter.get(index) as SponsoredCampaign}
                    surface="feed"
                    position={index}
                    stores={storeList}
                    onSearch={setSearchQuery}
                  />
                ) : null}
                </Fragment>
              ))}
              {(debouncedQuery.trim() ? searchHasMore : hasMoreCursor) && (
                <div className="flex justify-center pt-4 md:pt-6">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={loadMoreFeed}
                    className="rounded-xl border-2 border-violet-600 dark:border-violet-500 bg-white dark:bg-[#141414] px-6 py-2.5 text-sm font-semibold text-violet-600 dark:text-violet-400 transition-all duration-200 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-60"
                  >
                    {loadingMore ? 'Cargando…' : moreError ? 'Reintentar' : 'Cargar más'}
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>
        </div>
        <HomeDesktopRail
          stores={storeList}
          storeFilter={storeFilter}
          onStoreFilter={setStoreFilter}
          onSearch={setSearchQuery}
          hunters={feedHunters}
          hunterNote={season?.modules.includes('hunter') ? season.hunterNote : null}
          now={sessionStartedAt}
        />
        </div>
      </section>

        <div className="h-20 md:h-0" />

      <div className="luna-chat">
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
