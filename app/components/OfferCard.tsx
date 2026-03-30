'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Heart, Sparkles, ThumbsUp, ThumbsDown, Search, User, Share2, Award, BadgeCheck, Eye, MousePointerClick } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUI } from '@/app/providers/UIProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { getBankCouponLabel } from '@/lib/bankCoupons';
import { buildOfferPublicPath } from '@/lib/offerPath';
import { postOfferVote, type VoteDirection } from '@/lib/votes/client';
import { useVoterVoteWeights } from '@/lib/hooks/useVoterVoteWeights';
import { logClientError } from '@/lib/utils/handleError';
import { logEvent } from '@/lib/monitoring/clientLogger';
import { publicProfilePath } from '@/lib/profileSlug';

export const OFFER_CARD_DESCRIPTION_MAX_LENGTH = 80;

const formatPrice = (value: number) =>
  new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

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
  author?: {
    username: string;
    avatar_url?: string | null;
    leaderBadge?: string | null;
    creatorMlTag?: string | null;
    userId?: string | null;
    slug?: string | null;
  };
  onFavoriteChange?: (isFavorite: boolean) => void;
  onVoteChange?: (offerId: string, value: 1 | -1 | 0, storedWeight?: number) => void;
  /** Valor en `offer_votes.value` (p. ej. 2, -1) para optimismo del score. */
  userVoteStoredValue?: number | null;
  userVote?: 1 | -1 | 0 | null;
  isLiked?: boolean;
  createdAt?: string | null;
  msiMonths?: number | null;
  bankCoupon?: string | null;
  /** Código o texto de cupón que el cazador escribió a mano. */
  coupons?: string | null;
  /** Badge "Destacada" cuando la oferta tiene alta calidad (ranking_blend alto). */
  isDestacada?: boolean;
  /** Oferta de prueba (relleno): badge "Prueba", click solo toast, no voto/favorito. */
  isTesterOffer?: boolean;
  /** Status for "My Deals" page: show badge (Pending / Approved / Rejected / Expired). */
  dealStatus?: 'pending' | 'approved' | 'rejected' | 'expired';
  /** Rejection reason from moderation (shown when dealStatus === 'rejected'). */
  rejectionReason?: string | null;
  /** Panel de métricas solo en el perfil del creador (vistas, compartidos, clics en Cazar). */
  ownerMetrics?: { cazarClicks: number; views: number; shares: number } | null;
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
  onVoteChange,
  userVoteStoredValue: userVoteStoredProp = null,
  userVote: userVoteProp = 0,
  isLiked: isLikedProp = false,
  msiMonths,
  bankCoupon,
  coupons,
  createdAt,
  isDestacada = false,
  isTesterOffer = false,
  dealStatus,
  rejectionReason,
  ownerMetrics,
}: OfferCardProps) {
  const router = useRouter();
  const { showToast } = useUI();
  const { session } = useAuth();
  const { up: wUp, down: wDown } = useVoterVoteWeights();
  const [localVote, setLocalVote] = useState<1 | -1 | 0 | null>(null);
  const [localLiked, setLocalLiked] = useState<boolean | null>(null);
  const userVote = localVote !== null ? localVote : (userVoteProp ?? 0);
  const isLiked = localLiked !== null ? localLiked : (isLikedProp ?? false);
  const scoreFromFeed = votes?.score ?? upvotes * 2 - downvotes;
  const [localScore, setLocalScore] = useState(() => scoreFromFeed);
  const [imgError, setImgError] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const baseScore = scoreFromFeed;
  const authorProfileHref =
    author?.username ? publicProfilePath(author.username, author.userId, author.slug) : null;

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
            }).catch((err) => logClientError('offer-card:track-view', err));
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
    if (isTesterOffer) return;
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

  const sendVote = (direction: VoteDirection, onRevert: () => void, onSuccess?: () => void): void => {
    if (!offerId) return;
    const token = session?.access_token ?? null;
    void postOfferVote(offerId, direction, token).then((result) => {
      if (result.ok) {
        logEvent({
          type: 'vote',
          source: 'votes:post',
          metadata: { offerId, direction },
        });
        onSuccess?.();
        return;
      }
      logEvent({
        type: 'api_error',
        source: 'votes:post',
        metadata: { offerId, direction, network: result.isNetworkError },
      });
      showToast?.(result.message);
      onRevert();
    });
  };

  const contributionForDisplay = (display: UserVote, stored: number | null | undefined): number => {
    if (display === 0) return 0;
    if (display === 1) return stored != null && stored > 0 ? stored : wUp;
    return stored != null && stored < 0 ? stored : wDown;
  };

  const handleVoteUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTesterOffer) return;
    if (!offerId) return;
    if (!session) {
      showToast('Crea una cuenta para votar y ayudar a la comunidad');
      return;
    }
    const prevVote = userVote as UserVote;
    const prevScore = localScore;
    const newVote: UserVote = prevVote === 1 ? 0 : 1;
    const prevC = contributionForDisplay(prevVote, userVoteStoredProp);
    const newC = contributionForDisplay(newVote, newVote === 0 ? 0 : wUp);
    const delta = newC - prevC;
    setLocalVote(newVote);
    setLocalScore((s) => s + delta);
    sendVote('up', () => {
      setLocalVote(prevVote);
      setLocalScore(prevScore);
    }, () => onVoteChange?.(offerId, newVote, newVote === 0 ? undefined : wUp));
  };

  const handleVoteDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTesterOffer) return;
    if (!offerId) return;
    if (!session) {
      showToast('Crea una cuenta para votar y ayudar a la comunidad');
      return;
    }
    const prevVote = userVote as UserVote;
    const prevScore = localScore;
    const newVote: UserVote = prevVote === -1 ? 0 : -1;
    const prevC = contributionForDisplay(prevVote, userVoteStoredProp);
    const newC = contributionForDisplay(newVote, newVote === 0 ? 0 : wDown);
    const delta = newC - prevC;
    setLocalVote(newVote);
    setLocalScore((s) => s + delta);
    sendVote('down', () => {
      setLocalVote(prevVote);
      setLocalScore(prevScore);
    }, () => onVoteChange?.(offerId, newVote, newVote === 0 ? undefined : wDown));
  };

  const showImage = image && !imgError;
  const storeLabel = brand || 'Tienda';
  const timeLabel = createdAt ? formatRelativeTime(createdAt) : null;
  const bankCouponLabel = getBankCouponLabel(bankCoupon);
  const bankCouponDisplay = bankCouponLabel ? bankCouponLabel.toUpperCase() : null;
  const personalCouponTrim = coupons?.trim() ?? '';
  const showCouponBlock = Boolean(personalCouponTrim) || Boolean(bankCouponDisplay);

  const copyCouponsToClipboard = async (): Promise<void> => {
    if (isTesterOffer) return;
    const parts: string[] = [];
    if (personalCouponTrim) parts.push(personalCouponTrim);
    if (bankCouponDisplay) parts.push(`Cupón bancario: ${bankCouponDisplay}`);
    if (parts.length === 0) return;
    try {
      await navigator.clipboard.writeText(parts.join('\n'));
      showToast('Cupón copiado al portapapeles');
    } catch {
      // seguimos con la navegación aunque falle el portapapeles
    }
  };

  const runOpenOfferAction = async () => {
    if (isTesterOffer) {
      showToast('Oferta de prueba');
      return;
    }
    if (offerId) {
      logEvent({ type: 'view', source: 'offer:click', metadata: { offerId } });
    }
    await copyCouponsToClipboard();
    onCardClick?.();
  };

  const descTrim = description?.trim() ?? '';
  const descShown =
    descTrim.length > OFFER_CARD_DESCRIPTION_MAX_LENGTH
      ? `${descTrim.slice(0, OFFER_CARD_DESCRIPTION_MAX_LENGTH)}…`
      : descTrim;

  const VotesBlock = () => (
    <div className="flex items-center justify-center gap-1 max-[400px]:gap-0.5 md:gap-1.5 text-gray-900 dark:text-gray-100">
      <button
        type="button"
        onClick={handleVoteUp}
        className="flex h-8 w-8 max-[400px]:h-7 max-[400px]:w-7 md:h-9 md:w-9 items-center justify-center rounded-md md:rounded-lg transition-colors hover:bg-[#f5f5f7] dark:hover:bg-[#262626] active:scale-95"
        aria-label="Votar positivo"
      >
        <ThumbsUp
          className={`h-4 w-4 max-[400px]:h-3.5 max-[400px]:w-3.5 md:h-[18px] md:w-[18px] ${
            userVote === 1
              ? 'fill-violet-600 text-violet-600 dark:fill-violet-400 dark:text-violet-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        />
      </button>
      <span className="min-w-6 max-[400px]:min-w-[1.35rem] md:min-w-7 text-center text-sm max-[400px]:text-[13px] md:text-base font-semibold tabular-nums">
        {localScore}
      </span>
      <button
        type="button"
        onClick={handleVoteDown}
        className="flex h-8 w-8 max-[400px]:h-7 max-[400px]:w-7 md:h-9 md:w-9 items-center justify-center rounded-md md:rounded-lg transition-colors hover:bg-[#f5f5f7] dark:hover:bg-[#262626] active:scale-95"
        aria-label="Votar negativo"
      >
        <ThumbsDown
          className={`h-4 w-4 max-[400px]:h-3.5 max-[400px]:w-3.5 md:h-[18px] md:w-[18px] ${
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
      onClick={() => {
        void runOpenOfferAction();
      }}
      className="relative flex flex-row items-start overflow-hidden rounded-2xl bg-white dark:bg-[#141414] border border-[#e5e5e7] dark:border-[#262626] p-2.5 max-[400px]:p-2 md:p-3 cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] active:scale-[0.99] md:hover:shadow-xl md:hover:shadow-violet-500/5 md:hover:border-violet-200 dark:md:hover:border-violet-800/50"
    >
      <button
        onClick={handleFavoriteClick}
        className="absolute top-2 left-2 max-[400px]:top-1.5 max-[400px]:left-1.5 z-10 flex h-8 w-8 max-[400px]:h-7 max-[400px]:w-7 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-lg bg-white/60 dark:bg-[#1a1a1a]/60 backdrop-blur-sm border border-white/40 dark:border-[#262626]/60 shadow-sm hover:bg-white/80 dark:hover:bg-[#262626]/80 transition-colors active:scale-95"
        aria-label={isLiked ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      >
        <Heart
          className={`h-4 w-4 ${
            isLiked ? 'fill-red-500/90 text-red-500/90' : 'text-gray-500/90 dark:text-gray-400/90'
          }`}
        />
      </button>

      {offerId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const url = `${typeof window !== 'undefined' ? window.location.origin : ''}${buildOfferPublicPath(offerId, title)}`;
            navigator.clipboard.writeText(url).then(() => {
              setShareCopied(true);
              setTimeout(() => setShareCopied(false), 2000);
              showToast('Enlace copiado');
            }).catch(() => window.open(url, '_blank'));
            fetch('/api/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
              body: JSON.stringify({ offer_id: offerId, event_type: 'share' }),
            }).catch((err) => logClientError('offer-card:track-view', err));
          }}
          className="absolute top-2 right-2 max-[400px]:top-1.5 max-[400px]:right-1.5 z-10 p-1 max-[400px]:p-1 md:p-1.5 rounded-md md:rounded-lg bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm border border-[#e5e5e7]/80 dark:border-[#262626]/80 text-[#8e8e93] dark:text-[#737378] hover:text-violet-600 dark:hover:text-violet-400 hover:bg-white/95 dark:hover:bg-[#1a1a1a]/95 transition-colors"
          title={shareCopied ? '¡Copiado!' : 'Compartir (se abre la oferta expandida)'}
          aria-label="Compartir oferta"
        >
          <Share2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
        </button>
      )}

      <div className="w-[38%] min-w-[100px] max-[400px]:min-w-[90px] md:w-[220px] md:min-w-[220px] shrink-0 flex flex-col gap-1 max-[400px]:gap-0.5">
        <div className="relative h-[152px] max-[400px]:h-[128px] md:h-[158px] rounded-xl overflow-hidden bg-[#f5f5f7] dark:bg-[#1a1a1a] shrink-0">
          {showImage ? (
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 400px) 90px, (max-width: 768px) 38vw, 220px"
              className="object-contain md:object-cover object-center"
              onError={() => setImgError(true)}
              unoptimized={image.startsWith('/')}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </div>
          )}
        </div>
        <div className="flex justify-center w-full shrink-0">
          <VotesBlock />
        </div>
      </div>

      <div className="flex flex-col min-w-0 flex-1 pl-3 max-[400px]:pl-2 md:pl-4 gap-1 max-[400px]:gap-0.5 md:gap-1.5 pt-6 max-[400px]:pt-5 md:pt-0">
        <div className="min-w-0">
          {dealStatus && (
            <span
              className={`inline-block text-[10px] max-[400px]:text-[9px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md mb-1.5 ${
                dealStatus === 'pending'
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                  : dealStatus === 'approved'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200'
                    : dealStatus === 'rejected'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {dealStatus === 'pending'
                ? 'Pendiente'
                : dealStatus === 'approved'
                  ? 'Aprobada'
                  : dealStatus === 'rejected'
                    ? 'Rechazada'
                    : 'Expirada'}
            </span>
          )}
          {dealStatus === 'rejected' && rejectionReason && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2 mb-1">
              {rejectionReason}
            </p>
          )}
          <h3 className="text-sm max-[400px]:text-[13px] md:text-base font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 md:line-clamp-3 leading-snug wrap-anywhere">
            {title}
          </h3>

          <div className="flex items-baseline gap-1.5 max-[400px]:gap-1 md:gap-2 flex-wrap mt-1 max-[400px]:mt-0.5 min-w-0">
            <span className="text-base max-[400px]:text-sm md:text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              {formatPrice(discountPrice)}
            </span>
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
            {isTesterOffer && (
              <span className="inline-flex text-[10px] md:text-[11px] font-medium px-1.5 md:px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" title="Oferta de ejemplo (relleno)">
                Prueba
              </span>
            )}
          </div>
          {msiMonths != null && msiMonths >= 1 ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              <span className="inline-flex items-baseline gap-1 text-[10px] md:text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="uppercase tracking-wide">msi</span>
                <span>{msiMonths}</span>
              </span>
            </div>
          ) : null}

          <p className="text-[11px] md:text-xs mt-0.5 min-w-0 truncate">
            <span className="font-semibold text-fuchsia-500 dark:text-pink-300">{storeLabel}</span>
            {timeLabel ? (
              <span className="text-gray-500 dark:text-gray-400 font-normal"> · hace {timeLabel}</span>
            ) : null}
          </p>

          {author?.username && (
            <span className="inline-flex items-center gap-1.5 flex-wrap mt-0.5 min-w-0">
              {authorProfileHref ? (
                <Link
                  href={authorProfileHref}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 text-[11px] md:text-xs text-violet-600 dark:text-violet-400 hover:underline"
                >
                  {author.avatar_url ? (
                    <Image
                      src={author.avatar_url}
                      alt=""
                      width={20}
                      height={20}
                      className="h-4 w-4 md:h-5 md:w-5 rounded-full object-cover shrink-0"
                      unoptimized={
                        author.avatar_url.startsWith('http') &&
                        !author.avatar_url.includes(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
                      }
                    />
                  ) : (
                    <User className="h-4 w-4 md:h-5 md:w-5 shrink-0 text-gray-500 dark:text-gray-400" />
                  )}
                  <span className="truncate">Cazado por {author.username}</span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] md:text-xs text-gray-600 dark:text-gray-400">
                  {author.avatar_url ? (
                    <Image
                      src={author.avatar_url}
                      alt=""
                      width={20}
                      height={20}
                      className="h-4 w-4 md:h-5 md:w-5 rounded-full object-cover shrink-0"
                      unoptimized={
                        author.avatar_url.startsWith('http') &&
                        !author.avatar_url.includes(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
                      }
                    />
                  ) : (
                    <User className="h-4 w-4 md:h-5 md:w-5 shrink-0 text-gray-500 dark:text-gray-400" />
                  )}
                  <span className="truncate">Cazado por {author.username}</span>
                </span>
              )}
              {author.leaderBadge === 'cazador_estrella' && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400" title="Cazador reconocido por la comunidad">
                  <BadgeCheck className="h-3 w-3" />
                  Cazador estrella
                </span>
              )}
              {author.leaderBadge === 'cazador_aventa' && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400" title="Cazador destacado">
                  <BadgeCheck className="h-3 w-3" />
                  Cazador Aventa
                </span>
              )}
            </span>
          )}
          <p className="text-[11px] md:text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 min-w-0 leading-snug wrap-anywhere">
            {descShown ? (
              descShown
            ) : (
              <span className="text-gray-400 dark:text-gray-500 italic">Sin descripción breve</span>
            )}
          </p>
        </div>

        {ownerMetrics != null && (
          <div className="rounded-xl border border-dashed border-violet-300/70 dark:border-violet-800/60 bg-violet-50/50 dark:bg-violet-950/25 px-3 py-2.5 mt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300 mb-2 text-center sm:text-left">
              Solo tú ves estas métricas
            </p>
            <div className="grid grid-cols-3 gap-2 text-[10px] sm:text-[11px]">
              <div className="text-center min-w-0">
                <MousePointerClick className="h-3.5 w-3.5 mx-auto mb-0.5 text-violet-600 dark:text-violet-400 shrink-0" aria-hidden />
                <p className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{ownerMetrics.cazarClicks}</p>
                <p className="text-gray-500 dark:text-gray-400 leading-tight">Clics en cazar</p>
              </div>
              <div className="text-center min-w-0">
                <Eye className="h-3.5 w-3.5 mx-auto mb-0.5 text-violet-600 dark:text-violet-400 shrink-0" aria-hidden />
                <p className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{ownerMetrics.views}</p>
                <p className="text-gray-500 dark:text-gray-400 leading-tight">Vistas</p>
              </div>
              <div className="text-center min-w-0">
                <Share2 className="h-3.5 w-3.5 mx-auto mb-0.5 text-violet-600 dark:text-violet-400 shrink-0" aria-hidden />
                <p className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{ownerMetrics.shares}</p>
                <p className="text-gray-500 dark:text-gray-400 leading-tight">Compartido</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-2 max-[400px]:mt-1.5 space-y-2">
          <div className="flex items-center gap-2 max-[400px]:gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isTesterOffer) {
                  showToast('Oferta de prueba');
                  return;
                }
                void (async () => {
                  await copyCouponsToClipboard();
                  if (offerId) {
                    fetch('/api/events', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                      },
                      body: JSON.stringify({ offer_id: offerId, event_type: 'cazar_cta' }),
                    }).catch((err) => logClientError('offer-card:cazar-cta', err));
                  }
                  onCardClick?.();
                })();
              }}
              className="w-full min-w-0 flex items-center justify-center gap-1.5 max-[400px]:gap-1 md:gap-2 rounded-xl border-2 border-violet-600 dark:border-violet-500 bg-white dark:bg-gray-900 px-3 max-[400px]:px-2 py-2.5 max-[400px]:py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-semibold text-violet-600 dark:text-violet-400 transition-all duration-200 hover:bg-violet-50 dark:hover:bg-violet-900/20 active:scale-95"
            >
              <Search className="h-4 w-4 max-[400px]:h-3.5 max-[400px]:w-3.5 md:h-4.5 md:w-4.5 shrink-0" />
              Cazar oferta
            </button>
          </div>
          {showCouponBlock ? (
            <div
              className="rounded-lg border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/25 px-2.5 py-2 space-y-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {bankCouponDisplay ? (
                <p className="text-[10px] md:text-[11px] leading-snug text-gray-800 dark:text-gray-200">
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300">Cupón bancario</span>
                  <span className="mx-1.5 font-bold tracking-wide text-indigo-600 dark:text-indigo-400">
                    {bankCouponDisplay}
                  </span>
                </p>
              ) : null}
              {personalCouponTrim ? (
                <p className="text-[10px] md:text-[11px] leading-snug text-gray-700 dark:text-gray-300 wrap-anywhere">
                  <span className="font-semibold text-gray-600 dark:text-gray-400">Cupón: </span>
                  <span className="font-mono text-gray-900 dark:text-gray-100">{personalCouponTrim}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
