 'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import ClientLayout from '@/app/ClientLayout';
import ReputationBar from '@/app/components/ReputationBar';
import PublicHallazgosSection from '@/app/me/PublicHallazgosSection';
import HunterDashboard from '@/app/me/dashboard/HunterDashboard';
import HunterHeader from '@/app/me/dashboard/HunterHeader';
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
  const [metrics, setMetrics] = useState<{
    positiveVotesTotal: number | null;
    commentsCount: number | null;
  }>({
    positiveVotesTotal: null,
    commentsCount: null,
  });
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
        .select('id, display_name, avatar_url, reputation_level, reputation_score, slug')
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
      });

      const { data: rows } = await supabase
        .from('offers')
        .select('id, title, price, original_price, image_url, store, offer_url, description, hunter_comment, msi_months, bank_coupon, coupons, conditions, created_at, upvotes_count, downvotes_count, ranking_momentum, status, rejection_reason, expires_at')
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

      setOffers(mapped);
      setLoading(false);

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
      <ClientLayout>
        <div className="min-h-screen bg-[#F5F5F7] text-[#1d1d1f] dark:bg-[#0a0a0a] dark:text-[#fafafa]">
          <section className="mx-auto max-w-5xl px-4 pb-12 pt-24 md:px-8 md:pt-12">
            <div className="mb-8 h-16 max-w-sm animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" />
            <div className="h-40 animate-pulse rounded-2xl bg-white dark:bg-[#141414]" />
          </section>
        </div>
      </ClientLayout>
    );
  }

  if (profileMissing || !profile) {
    return (
      <ClientLayout>
        <div className="min-h-screen bg-[#F5F5F7] text-gray-900 dark:bg-[#0a0a0a] dark:text-gray-100">
          <section className="mx-auto max-w-5xl px-4 pb-12 pt-24 md:px-8 md:pt-12">
            <p className="text-sm text-gray-600 dark:text-zinc-300">No se pudo cargar tu perfil.</p>
          </section>
        </div>
      </ClientLayout>
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
    <ClientLayout>
      <div className="min-h-screen bg-[#F5F5F7] text-gray-900 dark:bg-[#0a0a0a] dark:text-gray-100">
        <section className="mx-auto max-w-5xl px-4 md:px-8 pt-24 pb-12 md:pt-12">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="sr-only"
            aria-label="Elegir foto de perfil"
            onChange={handleAvatarChange}
          />
          <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <HunterHeader
            displayName={displayName}
            avatarUrl={profile?.avatar_url ?? null}
            level={repLevel}
            score={profile?.reputation_score ?? 0}
            publicHref={publicHref}
            avatarUploading={avatarUploading}
            onPickAvatar={() => fileInputRef.current?.click()}
          />

          <div
            className="inline-flex max-w-full shrink-0 gap-1 self-start rounded-full border border-black/5 bg-white/70 p-1 backdrop-blur-md dark:border-white/10 dark:bg-white/5"
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
                  className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1f] dark:focus-visible:ring-[#fafafa] ${
                    selected
                      ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]'
                      : 'text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#a3a3a3] dark:hover:text-[#fafafa]'
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
              offers={offers.map((offer) => ({
                id: offer.id,
                title: offer.title,
                dealStatus: offer.dealStatus,
                discountPrice: offer.discountPrice,
                originalPrice: offer.originalPrice,
                image: offer.image ?? null,
              }))}
            />

          ) : (
            <>
            <p className="mb-6 text-[15px] text-[#6e6e73] dark:text-[#a3a3a3]">Así me ve la comunidad.</p>
            <div className="mb-8 max-w-md">
              <ReputationBar variant="hunter" level={repLevel} score={profile?.reputation_score ?? 0} />
            </div>
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
            </>
          )}

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
          <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
        </div>
      }
    >
      <MePageInner />
    </Suspense>
  );
}
