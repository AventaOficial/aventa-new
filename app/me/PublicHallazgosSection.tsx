'use client';

import { useEffect, useRef, useState } from 'react';
import PublicProfileView, {
  type PublicProfileOffer,
  type PublicProfileOwnerActions,
} from '@/app/components/profile/PublicProfileView';
import type { CardOffer } from '@/lib/offers/transform';
import type { VoteMap, VoteValueMap, FavoriteMap } from '@/lib/offers/batchUserData';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { presentOwnProfile } from '@/lib/profile/visibility';
import type { AchievementRarity } from '@/lib/achievements/types';

const UNLOCKED_PREVIEW_LIMIT = 4;
const RARITY_ORDER: AchievementRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

function rarityRank(rarity: AchievementRarity | undefined): number {
  return rarity ? RARITY_ORDER.indexOf(rarity) : -1;
}

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type MappedOffer = CardOffer & { dealStatus: DealStatus; rejectionReason: string | null };

type PublicHallazgosSectionProps = {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  level: number;
  score: number;
  sharePath: string | null;
  comments: number | null;
  offers: MappedOffer[];
  voteMap: VoteMap;
  voteValueMap: VoteValueMap;
  favoriteMap: FavoriteMap;
  onVoteChange: (offerId: string, value: 1 | -1 | 0, storedWeight?: number) => void;
  onFavoriteChange?: (offerId: string, isFavorite: boolean) => void;
  onOfferClick: (offer: MappedOffer) => void;
  approvedCount: number;
  expiredCount: number;
  rejectedCount: number;
  positiveVotesTotal: number | null;
  owner?: PublicProfileOwnerActions | null;
};

/**
 * Vista previa del perfil público en /me.
 * Sin datos privados de recompensas.
 */
export default function PublicHallazgosSection({
  displayName,
  handle,
  avatarUrl,
  level,
  score,
  sharePath,
  comments,
  offers,
  favoriteMap,
  onFavoriteChange,
  onOfferClick,
  positiveVotesTotal,
  owner = null,
}: PublicHallazgosSectionProps) {
  const [showcase, setShowcase] = useState<Array<{ code: string; name: string; icon: string }>>([]);
  const [unlockedPreview, setUnlockedPreview] = useState<Array<{ code: string; name: string; icon: string }>>([]);
  const [unlockedChoices, setUnlockedChoices] = useState<Array<{ code: string; name: string; icon: string }>>([]);
  const [showcaseLoading, setShowcaseLoading] = useState(true);
  const { session } = useAuth();
  const coverInput = useRef<HTMLInputElement>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [ownIdentity, setOwnIdentity] = useState<{ bio: string | null; location: string | null; coverUrl: string | null }>({
    bio: null,
    location: null,
    coverUrl: null,
  });
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    let cancel = false;
    void createClient()
      .from('profiles')
      .select('bio, city, state, cover_url')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancel || !data) return;
        const row = data as { bio?: string | null; city?: string | null; state?: string | null; cover_url?: string | null };
        setOwnIdentity(presentOwnProfile({ bio: row.bio, city: row.city, state: row.state, coverUrl: row.cover_url }));
      });
    return () => {
      cancel = true;
    };
  }, [session?.user?.id, coverUploading]);
  useEffect(() => {
    let cancel = false;
    const run = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const response = await fetch('/api/me/achievements', { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const payload = await response.json() as {
          featured?: string[];
          cards?: Array<{
            code: string;
            name: string;
            icon: string;
            unlocked: boolean;
            concealed: boolean;
            rarityKey?: AchievementRarity;
            unlockedAt?: string | null;
          }>;
        };
        if (cancel) return;
        const visibleUnlocked = (payload.cards ?? []).filter((card) => card.unlocked && !card.concealed);
        const byCode = new Map(visibleUnlocked.map((card) => [card.code, card]));
        setShowcase(
          (payload.featured ?? [])
            .map((code) => byCode.get(code))
            .filter((card): card is NonNullable<typeof card> => Boolean(card))
            .map((card) => ({ code: card.code, name: card.name, icon: card.icon })),
        );
        const ranked = [...visibleUnlocked].sort(
          (a, b) =>
            rarityRank(b.rarityKey) - rarityRank(a.rarityKey) ||
            (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''),
        );
        setUnlockedChoices(ranked.map((card) => ({ code: card.code, name: card.name, icon: card.icon })));
        setUnlockedPreview(
          ranked.slice(0, UNLOCKED_PREVIEW_LIMIT).map((card) => ({ code: card.code, name: card.name, icon: card.icon })),
        );
      } catch {
        if (!cancel) {
          setShowcase([]);
          setUnlockedPreview([]);
          setUnlockedChoices([]);
        }
      } finally {
        if (!cancel) setShowcaseLoading(false);
      }
    };
    void run();
    return () => {
      cancel = true;
    };
  }, []);
  const publicOffers: PublicProfileOffer[] = offers.map((offer) => ({
    id: offer.id,
    title: offer.title,
    store: offer.brand || null,
    image: offer.image ?? null,
    discountPrice: offer.discountPrice,
    originalPrice: offer.originalPrice,
    createdAt: offer.createdAt ?? null,
    dealStatus: offer.dealStatus,
    upvotes: offer.upvotes,
    isFavorite: Boolean(favoriteMap[offer.id]),
  }));

  async function uploadCover(file: File) {
    const token = session?.access_token;
    if (!token) return;
    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('kind', 'cover');
      await fetch('/api/upload-profile-avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
    } finally {
      setCoverUploading(false);
    }
  }

  return (
    <>
    <input
      ref={coverInput}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="sr-only"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void uploadCover(file);
      }}
    />
    <PublicProfileView
      displayName={displayName}
      handle={handle}
      avatarUrl={avatarUrl}
      bio={ownIdentity.bio}
      location={ownIdentity.location}
      coverUrl={ownIdentity.coverUrl}
      level={level}
      score={score}
      offers={publicOffers}
      votesReceived={positiveVotesTotal}
      comments={comments}
      sharePath={sharePath}
      levelHref="/me/nivel"
      showcase={showcase}
      showcaseLoading={showcaseLoading}
      unlockedPreview={owner ? unlockedPreview : []}
      showcaseChoices={owner ? unlockedChoices : []}
      onSaveShowcase={owner ? async (codes) => {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return 'Inicia sesión para guardar los logros.';
        const response = await fetch('/api/me/achievements', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return typeof payload.error === 'string' ? payload.error : 'No se pudo guardar.';
        const byCode = new Map(unlockedChoices.map((card) => [card.code, card]));
        setShowcase(codes.map((code) => byCode.get(code)).filter((card): card is { code: string; name: string; icon: string } => Boolean(card)));
        return null;
      } : undefined}
      owner={owner ? { ...owner, onPickCover: () => coverInput.current?.click(), coverUploading } : null}
      onFavoriteChange={onFavoriteChange}
      onOpenOffer={(offer) => {
        const source = offers.find((item) => item.id === offer.id);
        if (!source) return;
        const openable = source.dealStatus === 'approved' || source.dealStatus === 'expired';
        if (openable) onOfferClick(source);
      }}
    />
    </>
  );
}
