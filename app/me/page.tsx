 'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, Plus, Sparkles, User } from 'lucide-react';
import ClientLayout from '@/app/ClientLayout';
import OfferCard from '@/app/components/OfferCard';
import OfferCardSkeleton from '@/app/components/OfferCardSkeleton';
import ReputationBar from '@/app/components/ReputationBar';
import RewardsProgramPanel from '@/app/me/RewardsProgramPanel';
import HunterActivitySummary from '@/app/me/HunterActivitySummary';
import PublicHallazgosSection from '@/app/me/PublicHallazgosSection';
import MyRewardsHistory from '@/app/me/MyRewardsHistory';
import { createClient } from '@/lib/supabase/client';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useOffersRealtime } from '@/lib/hooks/useOffersRealtime';
import {
  fetchBatchUserData,
  type VoteMap,
  type VoteValueMap,
  type FavoriteMap,
} from '@/lib/offers/batchUserData';
import { mapOfferToCard, type CardOffer, type RankedOfferSource } from '@/lib/offers/transform';
import { notifyUserError } from '@/lib/utils/handleError';
import { useUI } from '@/app/providers/UIProvider';
import { buildOfferPublicPath } from '@/lib/offerPath';
import { publicProfilePath } from '@/lib/profileSlug';

type MeView = 'public' | 'hunter';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type DealStatusFilter = 'all' | DealStatus;

const OFFER_STATUS_FILTERS: Array<{ value: DealStatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'approved', label: 'Activas' },
  { value: 'pending', label: 'En revisión' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: 'expired', label: 'Expiradas' },
];

type MappedOffer = CardOffer & { dealStatus: DealStatus; rejectionReason: string | null };

type OfferOwnerMetrics = { storeClicks?: number; cazarClicks: number; views: number; shares: number };

function MePageInner() {
  useTheme();
  const { showToast, openUploadModal } = useUI();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [voteMap, setVoteMap] = useState<VoteMap>({});
  const [voteValueMap, setVoteValueMap] = useState<VoteValueMap>({});
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({});
  const [profile, setProfile] = useState<{
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    slug?: string | null;
    reputation_level?: number;
    reputation_score?: number;
  } | null>(null);
  const [offers, setOffers] = useState<MappedOffer[]>([]);
  const [meView, setMeView] = useState<MeView>('hunter');
  const [statusFilter, setStatusFilter] = useState<DealStatusFilter>('all');
  const [metrics, setMetrics] = useState({
    totalOffers: 0,
    positiveVotesTotal: 0,
    commentsCount: 0,
    cazadoresAyudados: 0,
  });
  const [ownerMetricsByOffer, setOwnerMetricsByOffer] = useState<Record<string, OfferOwnerMetrics> | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useOffersRealtime(setOffers);

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      notifyUserError(showToast, 'Inicia sesión de nuevo para cambiar la foto.', 'me:avatar-no-session');
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-profile-avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; avatar_url?: string };
      if (!res.ok) {
        notifyUserError(
          showToast,
          data.error ?? 'No se pudo subir la foto.',
          'me:upload-profile-avatar',
          new Error(data.error ?? res.statusText)
        );
        return;
      }
      if (typeof data.avatar_url === 'string') {
        setProfile((prev) => (prev ? { ...prev, avatar_url: data.avatar_url! } : prev));
        setOffers((prev) =>
          prev.map((o) => ({
            ...o,
            author: { ...o.author, avatar_url: data.avatar_url },
          }))
        );
        showToast('Foto de perfil actualizada.');
      }
    } catch (err) {
      notifyUserError(showToast, 'No se pudo subir la foto.', 'me:upload-profile-avatar', err);
    } finally {
      setAvatarUploading(false);
    }
  };

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
        .select('id, display_name, avatar_url, reputation_level, reputation_score, slug')
        .eq('id', user.id)
        .maybeSingle();

      if (!profileData) {
        setLoading(false);
        return;
      }

      setProfile({
        id: profileData.id,
        display_name: profileData.display_name,
        avatar_url: profileData.avatar_url,
        slug: (profileData as { slug?: string | null }).slug ?? null,
        reputation_level: (profileData as { reputation_level?: number }).reputation_level ?? 1,
        reputation_score: (profileData as { reputation_score?: number }).reputation_score ?? 0,
      });

      const { data: rows } = await supabase
        .from('offers')
        .select('id, title, price, original_price, image_url, store, offer_url, description, msi_months, bank_coupon, coupons, conditions, created_at, upvotes_count, downvotes_count, ranking_momentum, status, rejection_reason, expires_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      const profileForCard = {
        display_name: profileData.display_name,
        avatar_url: profileData.avatar_url,
        slug: (profileData as { slug?: string | null }).slug ?? null,
      };

      const now = new Date().toISOString();
      const mapped: MappedOffer[] = (rows ?? []).map((row) => {
        const r = row as RankedOfferSource & {
          status?: string | null;
          rejection_reason?: string | null;
          expires_at?: string | null;
        };
        const card = mapOfferToCard({
          ...r,
          profiles: profileForCard,
          created_by: user.id,
        } as RankedOfferSource);

        let dealStatus: DealStatus = 'pending';
        const status = (r.status ?? 'pending').toLowerCase();
        if (status === 'rejected') {
          dealStatus = 'rejected';
        } else if (status === 'approved' || status === 'published') {
          dealStatus = r.expires_at && r.expires_at < now ? 'expired' : 'approved';
        }

        return {
          ...card,
          dealStatus,
          rejectionReason: r.rejection_reason?.trim() || null,
        };
      });

      setMetrics({
        totalOffers: mapped.length,
        positiveVotesTotal: 0,
        commentsCount: 0,
        cazadoresAyudados: 0,
      });
      setOffers(mapped);
      setLoading(false);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        fetch('/api/me/offer-metrics', { headers: { Authorization: `Bearer ${token}` } })
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { metrics?: Record<string, OfferOwnerMetrics> } | null) => {
            if (data?.metrics && typeof data.metrics === 'object') {
              setOwnerMetricsByOffer(data.metrics);
            } else {
              setOwnerMetricsByOffer({});
            }
          })
          .catch(() => setOwnerMetricsByOffer({}));

        fetch('/api/me/impact-stats', { headers: { Authorization: `Bearer ${token}` } })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (!data || typeof data !== 'object') return;
            setMetrics((prev) => ({
              ...prev,
              positiveVotesTotal: typeof data.positiveVotesTotal === 'number' ? data.positiveVotesTotal : prev.positiveVotesTotal,
              commentsCount: typeof data.commentsCount === 'number' ? data.commentsCount : prev.commentsCount,
              cazadoresAyudados: typeof data.cazadoresAyudados === 'number' ? data.cazadoresAyudados : prev.cazadoresAyudados,
            }));
          })
          .catch((err) => {
            notifyUserError(showToast, 'No pudimos cargar tus estadísticas de impacto.', 'me:impact-stats', err);
          });
      }

      if (mapped.length > 0 && user.id) {
        fetchBatchUserData(user.id, mapped.map((o) => o.id)).then(({ voteMap: vm, voteValueMap: vvm, favoriteMap: fm }) => {
          setVoteMap(vm);
          setVoteValueMap(vvm);
          setFavoriteMap(fm);
        });
      }
    };

    load();
  }, [router, showToast]);

  const statusCounts = useMemo(() => {
    const counts: Record<DealStatusFilter, number> = {
      all: offers.length,
      approved: 0,
      pending: 0,
      rejected: 0,
      expired: 0,
    };
    for (const offer of offers) counts[offer.dealStatus] += 1;
    return counts;
  }, [offers]);
  const filteredOffers = useMemo(
    () => (statusFilter === 'all' ? offers : offers.filter((offer) => offer.dealStatus === statusFilter)),
    [offers, statusFilter],
  );
  const totalViews = useMemo(() => {
    if (!ownerMetricsByOffer) return 0;
    return Object.values(ownerMetricsByOffer).reduce((sum, m) => sum + (m.views ?? 0), 0);
  }, [ownerMetricsByOffer]);

  const handleRepublish = (offer: MappedOffer) => {
    const params = new URLSearchParams({ upload: '1' });
    if (offer.title) params.set('title', offer.title);
    if (offer.offerUrl) params.set('offer_url', offer.offerUrl);
    if (offer.brand) params.set('store', offer.brand);
    if (offer.image) params.set('image', offer.image);
    router.push(`/?${params.toString()}`);
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100">
          <section className="mx-auto max-w-5xl px-4 md:px-8 pt-24 pb-12 md:pt-12">
            <div className="h-20 rounded-3xl bg-gray-100 dark:bg-[#1a1a1a]/50 mb-8 opacity-70 animate-pulse" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-[#1a1a1a]/50 opacity-70 animate-pulse" />
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
  const publicHref = profile
    ? publicProfilePath(profile.display_name, profile.id, profile.slug)
    : null;

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

  const repLevel = profile?.reputation_level ?? 1;
  const isHunter = meView === 'hunter';

  return (
    <ClientLayout>
      <div
        className={`min-h-screen text-gray-900 dark:text-gray-100 ${
          isHunter
            ? /* Fuerza variantes dark: de OfferCard y controles aunque el tema global sea light */
              'dark bg-[#050506] text-zinc-100'
            : 'bg-transparent'
        }`}
      >
        <section className="mx-auto max-w-5xl px-4 md:px-8 pt-24 pb-12 md:pt-12">
          {isHunter ? (
            <div className="mb-6 overflow-hidden rounded-3xl border border-zinc-800/90 bg-gradient-to-br from-[#16161a] via-[#101014] to-[#0c0c0e] p-5 shadow-[0_0_40px_-16px_rgba(139,92,246,0.25)] sm:p-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-purple-700 ring-2 ring-violet-500/40 ring-offset-2 ring-offset-[#101014]">
                      {profile?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-10 w-10 text-white" />
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="sr-only"
                      aria-label="Elegir foto de perfil"
                      onChange={handleAvatarChange}
                    />
                    <button
                      type="button"
                      disabled={avatarUploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-medium text-violet-400 hover:underline disabled:opacity-50 disabled:no-underline"
                    >
                      {avatarUploading ? 'Subiendo…' : 'Cambiar foto'}
                    </button>
                  </div>
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <h1 className="truncate text-2xl font-bold text-white sm:text-3xl">
                      {displayName}
                    </h1>
                    <p className="mt-1.5 inline-flex flex-wrap items-center justify-center gap-1.5 text-sm text-violet-300 sm:justify-start">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="font-medium">Cazador de Ofertas</span>
                      <span className="text-zinc-600">•</span>
                      <span className="text-zinc-400">
                        Nivel {repLevel}
                      </span>
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      Encuentra. Comparte. Ayuda a otros a ahorrar.
                    </p>
                    {publicHref ? (
                      <Link
                        href={publicHref}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-400 hover:text-violet-300 hover:underline"
                      >
                        Ver perfil público
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>
                </div>
                <blockquote className="hidden max-w-xs rounded-2xl border border-violet-500/20 bg-violet-950/30 px-4 py-3 text-sm leading-relaxed text-zinc-200 lg:block">
                  <p>
                    &ldquo;Las mejores oportunidades siempre están un paso adelante. Para eso
                    estamos aquí.&rdquo;
                  </p>
                  <footer className="mt-3 border-t border-violet-500/30 pt-2 text-[11px] font-semibold tracking-widest text-violet-400">
                    AVENTA
                  </footer>
                </blockquote>
              </div>
              <div className="mt-5">
                <ReputationBar
                  variant="hunter"
                  level={repLevel}
                  score={profile?.reputation_score ?? 0}
                />
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-3xl bg-white p-6 shadow-lg dark:bg-[#141414]">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-purple-600">
                    {profile?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-10 w-10 text-white" />
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="sr-only"
                    aria-label="Elegir foto de perfil"
                    onChange={handleAvatarChange}
                  />
                  <button
                    type="button"
                    disabled={avatarUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-medium text-violet-600 hover:underline disabled:opacity-50 disabled:no-underline dark:text-violet-400"
                  >
                    {avatarUploading ? 'Subiendo…' : 'Cambiar foto'}
                  </button>
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <h1 className="truncate text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {displayName}
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Así te ven los demás en AVENTA
                  </p>
                  {publicHref ? (
                    <Link
                      href={publicHref}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
                    >
                      Ver perfil público
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="mt-4">
                <ReputationBar level={repLevel} score={profile?.reputation_score ?? 0} />
              </div>
            </div>
          )}

          <div
            className={`mb-8 flex max-w-md gap-1 rounded-2xl p-1.5 ${
              isHunter
                ? 'border border-zinc-800 bg-[#121214]'
                : 'border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#141414]'
            }`}
            role="tablist"
            aria-label="Vista de perfil"
          >
            {(
              [
                { id: 'public' as const, label: 'Público' },
                { id: 'hunter' as const, label: 'Cazador' },
              ] as const
            ).map((tab) => {
              const selected = meView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setMeView(tab.id)}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                    selected
                      ? isHunter
                        ? 'bg-white text-[#1d1d1f] shadow-sm focus-visible:ring-offset-[#121214]'
                        : 'bg-[#1d1d1f] text-white focus-visible:ring-offset-white dark:bg-white dark:text-[#1d1d1f] dark:focus-visible:ring-offset-[#141414]'
                      : isHunter
                        ? 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 focus-visible:ring-offset-[#121214]'
                        : 'text-gray-600 hover:bg-gray-100 focus-visible:ring-offset-white dark:text-gray-400 dark:hover:bg-[#1a1a1a] dark:focus-visible:ring-offset-[#141414]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {isHunter ? (
            <>
              <div className="mb-8">
                <RewardsProgramPanel />
              </div>

              <HunterActivitySummary
                published={statusCounts.all}
                approved={statusCounts.approved}
                pending={statusCounts.pending}
                rejected={statusCounts.rejected}
                positiveVotes={metrics.positiveVotesTotal}
                comments={metrics.commentsCount}
                views={totalViews}
              />

              <div className="mb-4 flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Mis ofertas</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Consulta el estado, la actividad y la siguiente acción de cada publicación.
                  </p>
                </div>
                <div
                  className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-zinc-800 bg-[#121214] p-1.5"
                  role="tablist"
                  aria-label="Filtrar ofertas por estado"
                >
                  {OFFER_STATUS_FILTERS.map((filter) => {
                    const selected = statusFilter === filter.value;
                    return (
                      <button
                        key={filter.value}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setStatusFilter(filter.value)}
                        className={`shrink-0 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121214] ${
                          selected
                            ? 'bg-white text-[#1d1d1f]'
                            : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                        }`}
                      >
                        {filter.label}
                        <span
                          className={`ml-1.5 tabular-nums ${selected ? 'opacity-75' : 'text-zinc-600'}`}
                        >
                          {statusCounts[filter.value]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-4 md:space-y-6">
                {filteredOffers.length === 0 ? (
                  <div className="space-y-3 rounded-2xl border border-zinc-800 bg-[#121214] py-10 text-center">
                    <p className="text-zinc-300">
                      {offers.length === 0
                        ? 'Nada publicado. ¿Cazamos una oferta?'
                        : 'No tienes ofertas en este estado.'}
                    </p>
                    {offers.length === 0 ? (
                      <p className="text-sm text-zinc-500">
                        Usa el botón de subir cuando veas un precio que valga la pena.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  filteredOffers.map((offer) => (
                    <div
                      key={offer.id}
                      className="overflow-hidden rounded-2xl ring-1 ring-zinc-800/80 transition hover:ring-violet-500/30"
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
                          offer.dealStatus === 'approved'
                            ? () => router.push(buildOfferPublicPath(offer.id, offer.title))
                            : undefined
                        }
                        onVoteChange={handleVoteChange}
                        userVote={voteMap[offer.id] ?? null}
                        userVoteStoredValue={voteValueMap[offer.id] ?? null}
                        isLiked={!!favoriteMap[offer.id]}
                        createdAt={offer.createdAt}
                        msiMonths={offer.msiMonths}
                        bankCoupon={offer.bankCoupon}
                        coupons={offer.coupons}
                        offerScope={offer.offerScope ?? null}
                        dealStatus={offer.dealStatus}
                        rejectionReason={offer.rejectionReason}
                        onManagementAction={
                          offer.dealStatus === 'expired'
                            ? () => handleRepublish(offer)
                            : undefined
                        }
                        ownerMetrics={
                          ownerMetricsByOffer
                            ? (ownerMetricsByOffer[offer.id] ?? {
                                storeClicks: 0,
                                cazarClicks: 0,
                                views: 0,
                                shares: 0,
                              })
                            : null
                        }
                      />
                    </div>
                  ))
                )}
              </div>

              <div className="mt-10">
                <MyRewardsHistory />
              </div>

              <div className="mt-8 flex flex-col items-stretch gap-4 rounded-2xl border border-zinc-800 bg-[#121214] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </span>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    Cada oferta que compartes puede ayudar a alguien a encontrar una gran
                    oportunidad. Gracias por ser parte de AVENTA.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openUploadModal()}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_-4px_rgba(139,92,246,0.5)] transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121214]"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Subir nueva oferta
                </button>
              </div>
            </>
          ) : (
            <PublicHallazgosSection
              offers={offers}
              voteMap={voteMap}
              voteValueMap={voteValueMap}
              favoriteMap={favoriteMap}
              onVoteChange={handleVoteChange}
              onOfferClick={(offer) => router.push(buildOfferPublicPath(offer.id, offer.title))}
              approvedCount={statusCounts.approved}
              expiredCount={statusCounts.expired}
              rejectedCount={statusCounts.rejected}
              positiveVotesTotal={metrics.positiveVotesTotal}
            />
          )}

          <div className="h-24 md:h-0" />
        </section>
      </div>
    </ClientLayout>
  );
}

export default function MePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <p className="text-gray-500 dark:text-gray-400">Cargando tu perfil…</p>
        </div>
      }
    >
      <MePageInner />
    </Suspense>
  );
}
