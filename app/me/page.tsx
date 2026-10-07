 'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MeSpaceShell } from '@/app/me/dashboard/MeSectionPage';
import PublicHallazgosSection from '@/app/me/PublicHallazgosSection';
import HunterDashboard from '@/app/me/dashboard/HunterDashboard';
import HunterProgress from '@/app/me/dashboard/HunterProgress';
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
import { ACHIEVEMENTS_HREF } from '@/app/components/notifications/notificationKinds';

type MeView = 'public' | 'hunter';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type DealStatusFilter = 'all' | DealStatus;

type MappedOffer = CardOffer & { dealStatus: DealStatus; rejectionReason: string | null; category?: string | null };

type OfferOwnerMetrics = { storeClicks?: number; cazarClicks: number; views: number; shares: number };

function MePageInner() {
  useTheme();
  const { showToast, openUploadModal } = useUI();
  const router = useRouter();
  const panel = useSearchParams().get('panel');
  useEffect(() => {
    if (panel === 'logros') router.replace('/me/logros');
    else if (panel === 'ofertas') router.replace('/me/ofertas');
    else if (panel === 'guardados') router.replace('/me/favorites');
    else if (panel === 'actividad') router.replace('/me/nivel#actividad');
  }, [panel, router]);
  const spaceTitle = 'Tu';
  const spaceAccent = 'inicio';
  const spaceLede = 'Tu perfil de cazador: publicaciones, guardados y logros.';
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
    bio?: string | null;
    city?: string | null;
    state?: string | null;
    created_at?: string | null;
    is_trusted?: boolean;
  } | null>(null);
  const [offers, setOffers] = useState<MappedOffer[]>([]);
  const [meView, setMeView] = useState<MeView>('hunter');
  const [metrics, setMetrics] = useState<{
    positiveVotesTotal: number | null;
    commentsCount: number | null;
  }>({
    positiveVotesTotal: null,
    commentsCount: null,
  });
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
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
        .select('id, display_name, avatar_url, reputation_level, reputation_score, slug, bio, city, state, created_at, is_trusted')
        .eq('id', user.id)
        .maybeSingle();

      if (!profileData) {
        setProfileMissing(true);
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
        bio: (profileData as { bio?: string | null }).bio ?? null,
        city: (profileData as { city?: string | null }).city ?? null,
        state: (profileData as { state?: string | null }).state ?? null,
        created_at: (profileData as { created_at?: string | null }).created_at ?? null,
        is_trusted: (profileData as { is_trusted?: boolean }).is_trusted === true,
      });

      const { data: rows } = await supabase
        .from('offers')
        .select('id, title, price, original_price, source_currency, image_url, store, offer_url, description, hunter_comment, msi_months, bank_coupon, coupons, conditions, created_at, upvotes_count, downvotes_count, ranking_momentum, status, rejection_reason, expires_at, category')
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
          category?: string | null;
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
          category: r.category?.trim() || null,
        };
      });

      setOffers(mapped);
      setLoading(false);

      supabase
        .from('offer_favorites')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .then(({ count, error }) => {
          if (!error && typeof count === 'number') setSavedCount(count);
        });

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        fetch('/api/me/offer-metrics', { headers: { Authorization: `Bearer ${token}` } })
          .then((res) => (res.ok ? res.json() : Promise.reject(new Error('offer-metrics'))))
          .then((data: { metrics?: Record<string, OfferOwnerMetrics> } | null) => {
            if (data?.metrics && typeof data.metrics === 'object') {
              setOwnerMetricsByOffer(data.metrics);
            }
          })
          .catch(() => {
            /* Sin métricas no se muestra un cero inventado. */
          });

        fetch('/api/me/impact-stats', { headers: { Authorization: `Bearer ${token}` } })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (!data || typeof data !== 'object') return;
            setMetrics({
              positiveVotesTotal: typeof data.positiveVotesTotal === 'number' ? data.positiveVotesTotal : null,
              commentsCount: typeof data.commentsCount === 'number' ? data.commentsCount : null,
            });
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
  const totalViews = useMemo(() => {
    if (!ownerMetricsByOffer) return null;
    return Object.values(ownerMetricsByOffer).reduce((sum, m) => sum + (m.views ?? 0), 0);
  }, [ownerMetricsByOffer]);

  if (loading) {
    return (
      <MeSpaceShell title={spaceTitle} accent={spaceAccent} lede={spaceLede}>
        <div className="h-16 max-w-sm animate-pulse rounded-2xl bg-white/80 dark:bg-white/10" />
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-white dark:bg-[#141414]" />
      </MeSpaceShell>
    );
  }

  if (profileMissing || !profile) {
    return (
      <MeSpaceShell title={spaceTitle} accent={spaceAccent} lede={spaceLede}>
        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-[#141414]">
          <p className="text-[15px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">No se pudo cargar tu perfil.</p>
          <p className="mt-1 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Revisa tu conexión e inténtalo de nuevo.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-5 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-violet-700 active:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#141414] sm:min-h-0 sm:py-2 sm:text-[13px]"
          >
            Reintentar
          </button>
        </div>
      </MeSpaceShell>
    );
  }

  const displayName = profile.display_name?.trim() || 'Usuario';
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
    <MeSpaceShell
      plain={!isHunter}
      tone="night"
      wide
      asideBare={isHunter}
      title={isHunter ? 'Hola,' : spaceTitle}
      accent={isHunter ? displayName : spaceAccent}
      accentClassName={isHunter ? 'bg-linear-to-r from-fuchsia-200 to-violet-300 bg-clip-text text-transparent' : undefined}
      lede={isHunter ? 'Sigue cazando ofertas. Cada publicación ayuda a miles de personas a ahorrar.' : spaceLede}
      note={<span className="block h-1 w-16 rounded-full bg-violet-500" aria-hidden />}
      aside={isHunter ? <HunterProgress level={repLevel} score={profile?.reputation_score ?? 0} /> : <p className="text-[15px] font-semibold leading-snug">Más ofertas, más gente ahorrando, una comunidad más fuerte.</p>}
    >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="sr-only"
            aria-label="Elegir foto de perfil"
            onChange={handleAvatarChange}
          />
          <div className="mb-3 flex justify-end sm:mb-4">
            <div
              className="inline-flex max-w-full shrink-0 gap-1 rounded-full border border-white/10 bg-[#120a22] p-1"
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
                    className={`inline-flex min-h-11 items-center rounded-full px-4 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:min-h-0 sm:py-2 ${
                      selected
                        ? 'bg-violet-600 text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isHunter ? (
            <HunterDashboard
              displayName={displayName}
              avatarUrl={profile?.avatar_url ?? null}
              level={repLevel}
              score={profile?.reputation_score ?? 0}
              publicHref={publicHref}
              bio={profile?.bio}
              city={profile?.city}
              state={profile?.state}
              joinedAt={profile?.created_at}
              trusted={profile?.is_trusted}
              avatarUploading={avatarUploading}
              onPickAvatar={() => fileInputRef.current?.click()}
              onPublish={() => openUploadModal()}
              published={statusCounts.all}
              approved={statusCounts.approved}
              pending={statusCounts.pending}
              rejected={statusCounts.rejected}
              expired={statusCounts.expired}
              positiveVotes={metrics.positiveVotesTotal}
              comments={metrics.commentsCount}
              views={totalViews}
              saved={savedCount}
              offers={offers.map((offer) => ({
                id: offer.id,
                title: offer.title,
                dealStatus: offer.dealStatus,
                discountPrice: offer.discountPrice,
                originalPrice: offer.originalPrice,
                image: offer.image ?? null,
                store: offer.brand || null,
                sourceCurrency: offer.sourceCurrency ?? null,
                createdAt: offer.createdAt ?? null,
                upvotes: offer.upvotes,
                views: ownerMetricsByOffer?.[offer.id]?.views ?? null,
              }))}
            />

          ) : (
            <>
            <p className="sr-only">Así me ve la comunidad.</p>
            <PublicHallazgosSection
              displayName={displayName}
              handle={publicHref?.startsWith('/u/') ? publicHref.slice(3) : null}
              avatarUrl={profile?.avatar_url ?? null}
              level={repLevel}
              score={profile?.reputation_score ?? 0}
              joinedAt={profile?.created_at}
              trusted={profile?.is_trusted}
              sharePath={publicHref}
              comments={metrics.commentsCount}
              offers={offers}
              voteMap={voteMap}
              voteValueMap={voteValueMap}
              favoriteMap={favoriteMap}
              onVoteChange={handleVoteChange}
              onFavoriteChange={(offerId, isFavorite) => {
                setFavoriteMap((prev) => ({ ...prev, [offerId]: isFavorite }));
              }}
              onOfferClick={(offer) => router.push(buildOfferPublicPath(offer.id, offer.title))}
              approvedCount={statusCounts.approved}
              expiredCount={statusCounts.expired}
              rejectedCount={statusCounts.rejected}
              positiveVotesTotal={metrics.positiveVotesTotal}
              owner={{
                onPickAvatar: () => fileInputRef.current?.click(),
                avatarUploading,
                achievementsHref: ACHIEVEMENTS_HREF,
                onOpenAchievements: () => setMeView('hunter'),
              }}
            />
            </>
          )}
    </MeSpaceShell>
  );
}

export default function MePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
        </div>
      }
    >
      <MePageInner />
    </Suspense>
  );
}
