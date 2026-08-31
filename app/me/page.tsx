 'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, User } from 'lucide-react';
import ClientLayout from '@/app/ClientLayout';
import OfferCard from '@/app/components/OfferCard';
import OfferCardSkeleton from '@/app/components/OfferCardSkeleton';
import ReputationBar from '@/app/components/ReputationBar';
import RewardsProgramPanel from '@/app/me/RewardsProgramPanel';
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
  const { showToast } = useUI();
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
  const publicOffers = useMemo(
    () => offers.filter((o) => o.dealStatus === 'approved'),
    [offers],
  );

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

  return (
    <ClientLayout>
      <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100">
        <section className="mx-auto max-w-5xl px-4 md:px-8 pt-24 pb-12 md:pt-12">
          <div className="rounded-3xl bg-white dark:bg-[#141414] p-6 shadow-lg mb-6">
            <div className="flex flex-col items-center sm:flex-row sm:items-center gap-4">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 overflow-hidden">
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
                  className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {avatarUploading ? 'Subiendo…' : 'Cambiar foto'}
                </button>
              </div>
              <div className="text-center sm:text-left min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
                  {displayName}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {meView === 'public'
                    ? 'Así te ven los demás en AVENTA'
                    : 'Tu panel de cazador'}
                </p>
                {publicHref ? (
                  <Link
                    href={publicHref}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    Ver perfil público
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="mt-4">
              <ReputationBar
                level={profile?.reputation_level ?? 1}
                score={profile?.reputation_score ?? 0}
              />
            </div>
          </div>

          <div
            className="mb-8 flex max-w-md gap-1 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-1.5"
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
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    selected
                      ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1a1a1a]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {meView === 'hunter' ? (
            <>
              <div className="mb-8">
                <RewardsProgramPanel />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4 shadow">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Ofertas publicadas
                  </p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {metrics.totalOffers}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4 shadow">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Votos positivos
                  </p>
                  <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
                    {metrics.positiveVotesTotal}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4 shadow">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Comentarios
                  </p>
                  <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {metrics.commentsCount}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-500 leading-snug">
                    En tus ofertas (aprobados).
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4 shadow">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Personas que reaccionaron
                  </p>
                  <p className="mt-1 text-2xl font-bold text-violet-600 dark:text-violet-400">
                    {metrics.cazadoresAyudados}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-500 leading-snug">
                    Votos positivos o clics a tienda en tus ofertas (sin contarte a ti).
                  </p>
                </div>
              </div>

              <div className="mb-4 flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Mis ofertas</h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Consulta el estado, la actividad y la siguiente acción de cada publicación.
                  </p>
                </div>
                <div
                  className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-1.5"
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
                        className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                          selected
                            ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1a1a1a]'
                        }`}
                      >
                        {filter.label}
                        <span className={`ml-1.5 tabular-nums ${selected ? 'opacity-75' : 'text-gray-400 dark:text-gray-500'}`}>
                          {statusCounts[filter.value]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-4 md:space-y-6">
                {filteredOffers.length === 0 ? (
                  <div className="py-10 text-center space-y-3">
                    <p className="text-gray-600 dark:text-gray-300">
                      {offers.length === 0
                        ? 'Nada publicado. ¿Cazamos una oferta?'
                        : 'No tienes ofertas en este estado.'}
                    </p>
                    {offers.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Usa el botón de subir en la barra inferior cuando veas un precio raro.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  filteredOffers.map((offer) => (
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
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    Lo que ha subido
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Solo ofertas activas, como en tu perfil público.
                  </p>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                  {publicOffers.length} activa{publicOffers.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="space-y-4 md:space-y-6">
                {publicOffers.length === 0 ? (
                  <div className="py-10 text-center space-y-3">
                    <p className="text-gray-600 dark:text-gray-300">
                      Nada publicado. ¿Cazamos una oferta?
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Cuando aprueben una, aparecerá aquí como te ven los demás.
                    </p>
                  </div>
                ) : (
                  publicOffers.map((offer) => (
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
                      onCardClick={() => router.push(buildOfferPublicPath(offer.id, offer.title))}
                      onVoteChange={handleVoteChange}
                      userVote={voteMap[offer.id] ?? null}
                      userVoteStoredValue={voteValueMap[offer.id] ?? null}
                      isLiked={!!favoriteMap[offer.id]}
                      createdAt={offer.createdAt}
                      msiMonths={offer.msiMonths}
                      bankCoupon={offer.bankCoupon}
                      coupons={offer.coupons}
                      offerScope={offer.offerScope ?? null}
                    />
                  ))
                )}
              </div>
            </>
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
