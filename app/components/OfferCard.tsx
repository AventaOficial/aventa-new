'use client';

import Link from 'next/link';
import { Heart, Sparkles, ThumbsUp, ThumbsDown, ExternalLink, Search, User, Share2, Award } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUI } from '@/app/providers/UIProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';

export const OFFER_CARD_DESCRIPTION_MAX_LENGTH = 80;

const formatPrice = (value: number) =>
  new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

function slugFromUsername(name: string | null | undefined): string {
  if (!name || !name.trim()) return '';
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffM < 1) return 'un momento';
  if (diffM < 60) return `${diffM} min`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD === 1) return '1 día';
  if (diffD < 7) return `${diffD} días`;
  if (diffD < 30) return `${Math.floor(diffD / 7)} sem`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

type UserVote = 1 | -1 | 0;

interface OfferCardProps {
  offerId?: string;
  title: string;
  brand: string;
  originalPrice: number;
  discountPrice: number;
  discount: number;
  description?: string;
  image?: string;
  onCardClick?: () => void;
  upvotes: number;
  downvotes: number;
  votes: { up: number; down: number; score: number };
  offerUrl?: string;
  author?: { username: string; avatar_url?: string | null };
  onFavoriteChange?: (isFavorite: boolean) => void;
  userVote?: 1 | -1 | 0 | null;
  isLiked?: boolean;
  createdAt?: string | null;
  msiMonths?: number | null;
  /** Badge "Destacada" cuando la oferta tiene alta calidad (ranking_blend alto). */
  isDestacada?: boolean;
}

export default function OfferCard({
  offerId,
  title,
  brand,
  originalPrice,
  discountPrice,
  discount,
  description,
  image,
  onCardClick,
  upvotes,
  downvotes,
  votes,
  offerUrl,
  author,
  onFavoriteChange,
  userVote: userVoteProp = 0,
  isLiked: isLikedProp = false,
  msiMonths,
  createdAt,
  isDestacada = false,
}: OfferCardProps) {
  const router = useRouter();
  const { showToast } = useUI();
  const { session } = useAuth();
  const [localVote, setLocalVote] = useState<1 | -1 | 0 | null>(null);
  const [localLiked, setLocalLiked] = useState<boolean | null>(null);
  const userVote = localVote !== null ? localVote : (userVoteProp ?? 0);
  const isLiked = localLiked !== null ? localLiked : (isLikedProp ?? false);
  const [localScore, setLocalScore] = useState(() => votes?.score ?? upvotes - downvotes);
  const [imgError, setImgError] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const baseScore = votes?.score ?? upvotes - downvotes;

  const cardRef = useRef<HTMLDivElement>(null);
  const viewTrackedRef = useRef(false);

  useEffect(() => {
    if (!offerId || !cardRef.current) return;
    if (typeof sessionStorage === 'undefined') return;
    const key = `view:${offerId}`;
    if (sessionStorage.getItem(key)) return;
    if (viewTrackedRef.current) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting || viewTrackedRef.current) return;
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          timeoutId = null;
          if (viewTrackedRef.current) return;
          viewTrackedRef.current = true;
          try {
            sessionStorage.setItem(key, '1');
          } catch {}
          const payload = JSON.stringify({ offerId });
          const token = session?.access_token;
          if (token) {
            fetch('/api/track-view', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: payload,
              keepalive: true,
            }).catch(() => {});
          } else {
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon('/api/track-view', blob);
          }
        }, 1000);
      },
      { threshold: 0.5, rootMargin: '0px' }
    );

    observer.observe(cardRef.current);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [offerId, session?.access_token]);

  useEffect(() => {
    setLocalScore(baseScore);
  }, [offerId, baseScore]);

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session) {
      router.push('/');
      return;
    }
    if (!offerId) return;
    const prev = isLiked;
    setLocalLiked(!prev);
    if (onFavoriteChange) onFavoriteChange(!prev);
    const supabase = createClient();
    if (prev) {
      const { error } = await supabase.from('offer_favorites').delete().eq('offer_id', offerId);
      if (error) {
        setLocalLiked(false);
        if (onFavoriteChange) onFavoriteChange(false);
      }
    } else {
      const { error } = await supabase.from('offer_favorites').insert({
        user_id: session.user.id,
        offer_id: offerId,
      });
      if (error) {
        setLocalLiked(false);
        if (onFavoriteChange) onFavoriteChange(false);
      }
    }
  };

  const sendVote = (value: 1 | -1, onRevert: () => void): void => {
    if (!offerId) return;
    const token = session?.access_token ?? null;
    fetch('/api/votes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ offerId, value }),
    })
      .then((res) => { if (!res.ok) throw new Error(); })
      .catch(onRevert);
  };

  const handleVoteUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!offerId) return;
    if (!session) {
      showToast('Crea una cuenta para votar y ayudar a la comunidad');
      return;
    }
    const prevVote = userVote;
    const prevScore = localScore;
    const newVote: UserVote = prevVote === 1 ? 0 : 1;
    const delta = newVote - prevVote;
    setLocalVote(newVote);
    setLocalScore((s) => s + delta);
    sendVote(1, () => {
      setLocalVote(prevVote);
      setLocalScore(prevScore);
    });
  };

  const handleVoteDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!offerId) return;
    if (!session) {
      showToast('Crea una cuenta para votar y ayudar a la comunidad');
      return;
    }
    const prevVote = userVote;
    const prevScore = localScore;
    const newVote: UserVote = prevVote === -1 ? 0 : -1;
    const delta = newVote - prevVote;
    setLocalVote(newVote);
    setLocalScore((s) => s + delta);
    sendVote(-1, () => {
      setLocalVote(prevVote);
      setLocalScore(prevScore);
    });
  };

  const showImage = image && !imgError;
  const storeLabel = brand || 'Tienda';
  const timeLabel = createdAt ? formatRelativeTime(createdAt) : null;

  const VotesBlock = () => (
    <div className="flex items-center gap-2 max-[400px]:gap-1 text-gray-900 dark:text-gray-100">
      <button
        type="button"
        onClick={handleVoteUp}
        className="flex h-9 w-9 max-[400px]:h-8 max-[400px]:w-8 md:h-10 md:w-10 items-center justify-center rounded-lg transition-colors hover:bg-[#f5f5f7] dark:hover:bg-[#262626] active:scale-95"
        aria-label="Votar positivo"
      >
        <ThumbsUp
          className={`h-5 w-5 max-[400px]:h-4 max-[400px]:w-4 md:h-5 md:w-5 ${
            userVote === 1
              ? 'fill-violet-600 text-violet-600 dark:fill-violet-400 dark:text-violet-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        />
      </button>
      <span className="min-w-[1.75rem] max-[400px]:min-w-[1.5rem] md:min-w-[2rem] text-center text-base max-[400px]:text-sm md:text-lg font-semibold">
        {localScore}
      </span>
      <button
        type="button"
        onClick={handleVoteDown}
        className="flex h-9 w-9 max-[400px]:h-8 max-[400px]:w-8 md:h-10 md:w-10 items-center justify-center rounded-lg transition-colors hover:bg-[#f5f5f7] dark:hover:bg-[#262626] active:scale-95"
        aria-label="Votar negativo"
      >
        <ThumbsDown
          className={`h-5 w-5 max-[400px]:h-4 max-[400px]:w-4 md:h-5 md:w-5 ${
            userVote === -1
              ? 'fill-violet-600 text-violet-600 dark:fill-violet-400 dark:text-violet-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div
      ref={cardRef}
      onClick={onCardClick}
      className="relative flex flex-row items-stretch overflow-hidden rounded-2xl bg-white dark:bg-[#141414] border border-[#e5e5e7] dark:border-[#262626] p-2.5 max-[400px]:p-2 md:p-3 cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] active:scale-[0.99] md:hover:shadow-xl md:hover:shadow-violet-500/5 md:hover:border-violet-200 dark:md:hover:border-violet-800/50"
    >
      <button
        onClick={handleFavoriteClick}
        className="absolute top-2 left-2 max-[400px]:top-1.5 max-[400px]:left-1.5 z-10 flex h-8 w-8 max-[400px]:h-7 max-[400px]:w-7 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-lg bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-sm border border-[#e5e5e7] dark:border-[#262626] shadow-sm hover:bg-[#f5f5f7] dark:hover:bg-[#262626] transition-colors active:scale-95"
        aria-label={isLiked ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      >
        <Heart
          className={`h-4 w-4 ${
            isLiked ? 'fill-red-500 text-red-500' : 'text-gray-500 dark:text-gray-400'
          }`}
        />
      </button>

      {offerId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/?o=${offerId}`;
            navigator.clipboard.writeText(url).then(() => {
              setShareCopied(true);
              setTimeout(() => setShareCopied(false), 2000);
              showToast('Enlace copiado');
            }).catch(() => window.open(url, '_blank'));
            fetch('/api/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
              body: JSON.stringify({ offer_id: offerId, event_type: 'share' }),
            }).catch(() => {});
          }}
          className="absolute top-2 right-2 max-[400px]:top-1.5 max-[400px]:right-1.5 z-10 p-1 max-[400px]:p-1 md:p-1.5 rounded-md md:rounded-lg bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm border border-[#e5e5e7]/80 dark:border-[#262626]/80 text-[#8e8e93] dark:text-[#737378] hover:text-violet-600 dark:hover:text-violet-400 hover:bg-white/95 dark:hover:bg-[#1a1a1a]/95 transition-colors"
          title={shareCopied ? '¡Copiado!' : 'Compartir (se abre la oferta expandida)'}
          aria-label="Compartir oferta"
        >
          <Share2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
        </button>
      )}

      <div className="w-[35%] min-w-[80px] max-[400px]:min-w-[70px] md:min-w-[140px] shrink-0 flex flex-col gap-2 max-[400px]:gap-1.5">
        <div className="h-[152px] max-[400px]:h-[124px] md:h-36 rounded-xl overflow-hidden bg-[#f5f5f7] dark:bg-[#1a1a1a] flex-shrink-0">
          {showImage ? (
            <img
              src={image}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </div>
          )}
        </div>
        <div className="flex justify-center">
          <VotesBlock />
        </div>
      </div>

      <div className="flex flex-col min-w-0 flex-1 pl-3 max-[400px]:pl-2 md:pl-4 justify-between gap-1.5 max-[400px]:gap-1 md:gap-2 pt-6 max-[400px]:pt-5 md:pt-0">
        <div className="min-w-0">
          <h3 className="text-sm max-[400px]:text-xs md:text-base font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">
            {title}
          </h3>

          <div className="flex items-baseline gap-1.5 max-[400px]:gap-1 md:gap-2 flex-wrap mt-1 max-[400px]:mt-0.5 min-w-0">
            <span className="text-base max-[400px]:text-sm md:text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              {formatPrice(discountPrice)}
            </span>
            {msiMonths != null && msiMonths >= 1 && (
              <span className="text-[10px] md:text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {msiMonths} MSI
              </span>
            )}
            {originalPrice > 0 && (
              <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400 line-through">
                {formatPrice(originalPrice)}
              </span>
            )}
            {discount > 0 && (
              <span
                className="text-[10px] md:text-[11px] font-medium px-1 md:px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444' }}
              >
                -{discount}%
              </span>
            )}
            {isDestacada && (
              <span className="inline-flex items-center gap-0.5 text-[10px] md:text-[11px] font-medium px-1.5 md:px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300" title="Alta calidad: la comunidad y el tiempo la destacan">
                <Award className="h-3 w-3 md:h-3.5 md:w-3.5" />
                Destacada
              </span>
            )}
          </div>

          <p className="text-[11px] md:text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {storeLabel}
            {timeLabel ? ` • hace ${timeLabel}` : ''}
          </p>

          {author?.username && (
            <Link
              href={`/u/${slugFromUsername(author.username)}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-[11px] md:text-xs text-violet-600 dark:text-violet-400 hover:underline mt-0.5 min-w-0"
            >
              {author.avatar_url ? (
                <img src={author.avatar_url} alt="" className="h-4 w-4 md:h-5 md:w-5 rounded-full object-cover shrink-0" />
              ) : (
                <User className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" />
              )}
              <span className="truncate">Cazado por {author.username}</span>
            </Link>
          )}
          {description?.trim() && (
            <p className="hidden md:block text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 min-w-0">
              {description.trim().length > OFFER_CARD_DESCRIPTION_MAX_LENGTH
                ? `${description.trim().slice(0, OFFER_CARD_DESCRIPTION_MAX_LENGTH)}…`
                : description.trim()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 max-[400px]:gap-1.5 mt-2 max-[400px]:mt-1.5 md:mt-auto md:pt-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onCardClick?.(); }}
            className="flex-1 min-w-0 flex items-center justify-center gap-1.5 max-[400px]:gap-1 md:gap-2 rounded-xl border-2 border-violet-600 dark:border-violet-500 bg-white dark:bg-gray-900 px-3 max-[400px]:px-2 py-2.5 max-[400px]:py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-semibold text-violet-600 dark:text-violet-400 transition-all duration-200 hover:bg-violet-50 dark:hover:bg-violet-900/20 active:scale-95"
          >
            <Search className="h-4 w-4 max-[400px]:h-3.5 max-[400px]:w-3.5 md:h-4.5 md:w-4.5 shrink-0" />
            Cazar oferta
          </button>
          {offerUrl?.trim() && (
            <button
              onClick={(e) => { e.stopPropagation(); window.open(offerUrl!.trim(), '_blank', 'noopener,noreferrer'); }}
              className="flex-1 min-w-0 flex items-center justify-center gap-2 max-[400px]:gap-1 rounded-xl bg-gradient-to-r from-violet-600 to-violet-700 dark:from-violet-500 dark:to-violet-600 px-4 max-[400px]:px-2.5 py-3 max-[400px]:py-2 md:px-4 md:py-2.5 text-sm max-[400px]:text-xs font-semibold text-white shadow-violet-500/25 transition-all duration-200 hover:shadow-violet-500/40 active:scale-95"
            >
              <ExternalLink className="h-4 w-4 max-[400px]:h-3.5 max-[400px]:w-3.5 md:h-4.5 md:w-4.5 shrink-0" />
              Ir directo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
