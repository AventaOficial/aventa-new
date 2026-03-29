 'use client';

import { Suspense, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { User } from 'lucide-react';
import ClientLayout from '@/app/ClientLayout';
import OfferCard from '@/app/components/OfferCard';
import OfferCardSkeleton from '@/app/components/OfferCardSkeleton';
import OfferModal from '@/app/components/OfferModal';
import ReputationBar from '@/app/components/ReputationBar';
import CommissionProgramPanel from '@/app/me/CommissionProgramPanel';
import { createClient } from '@/lib/supabase/client';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useOffersRealtime } from '@/lib/hooks/useOffersRealtime';
import { fetchBatchUserData, type VoteMap, type FavoriteMap } from '@/lib/offers/batchUserData';
import { mapOfferToCard, type CardOffer, type RankedOfferSource } from '@/lib/offers/transform';
import { notifyUserError } from '@/lib/utils/handleError';
import { useUI } from '@/app/providers/UIProvider';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';

type MappedOffer = CardOffer & { dealStatus: DealStatus; rejectionReason: string | null };

function MePageInner() {
  useTheme();
  const { showToast } = useUI();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [voteMap, setVoteMap] = useState<VoteMap>({});
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({});
  const [profile, setProfile] = useState<{
    display_name: string | null;
    avatar_url: string | null;
    reputation_level?: number;
    reputation_score?: number;
  } | null>(null);
  const [offers, setOffers] = useState<MappedOffer[]>([]);
  const [metrics, setMetrics] = useState({
    totalOffers: 0,
    positiveVotesTotal: 0,
    commentsCount: 0,
    cazadoresAyudados: 0,
  });
  const [selectedOffer, setSelectedOffer] = useState<MappedOffer | null>(null);
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
        .select('id, display_name, avatar_url, reputation_level, reputation_score')
        .eq('id', user.id)
        .maybeSingle();

      if (!profileData) {
        setLoading(false);
        return;
      }

      setProfile({
        display_name: profileData.display_name,
        avatar_url: profileData.avatar_url,
        reputation_level: (profileData as { reputation_level?: number }).reputation_level ?? 1,
        reputation_score: (profileData as { reputation_score?: number }).reputation_score ?? 0,
      });

      const { data: rows } = await supabase
        .from('offers')
        .select('id, title, price, original_price, image_url, store, offer_url, description, created_at, upvotes_count, downvotes_count, status, rejection_reason, expires_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });

      const profileForCard = {
        display_name: profileData.display_name,
        avatar_url: profileData.avatar_url,
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
        fetchBatchUserData(user.id, mapped.map((o) => o.id)).then(({ voteMap: vm, favoriteMap: fm }) => {
          setVoteMap(vm);
          setFavoriteMap(fm);
        });
      }
    };

    load();
  }, [router, showToast]);

  if (loading) {
    return (
      <ClientLayout>
        <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100">
          <section className="mx-auto max-w-5xl px-4 md:px-8 pt-24 pb-12 md:pt-12">
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
        <section className="mx-auto max-w-5xl px-4 md:px-8 pt-24 pb-12 md:pt-12">
          <div className="rounded-3xl bg-white dark:bg-gray-900 p-6 shadow-lg mb-8">
            <div className="flex flex-col items-center sm:flex-row sm:items-center gap-4">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-pink-400 dark:from-purple-400 dark:to-pink-400 overflow-hidden">
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
              <div className="text-center sm:text-left min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
                  {displayName}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Tu panel</p>
              </div>
            </div>
            <div className="mt-4">
              <ReputationBar
                level={profile?.reputation_level ?? 1}
                score={profile?.reputation_score ?? 0}
              />
            </div>
            <div className="mt-3">
              <CommissionProgramPanel />
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
                {metrics.positiveVotesTotal}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow">
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
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Cazadores ayudados
              </p>
              <p className="mt-1 text-2xl font-bold text-violet-600 dark:text-violet-400">
                {metrics.cazadoresAyudados}
              </p>
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-500 leading-snug">
                Personas distintas que votaron positivo o abrieron &quot;cazar&quot; en tus ofertas (sin contarte a ti).
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
                  dealStatus={offer.dealStatus}
                  rejectionReason={offer.rejectionReason}
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
