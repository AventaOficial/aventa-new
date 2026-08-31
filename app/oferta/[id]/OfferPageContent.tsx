'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  User,
  BadgeCheck,
  Heart,
  ExternalLink,
  MessageCircle,
  Flag,
  Copy,
  Share2,
  Globe,
  Store,
  Clock,
} from 'lucide-react';
import { formatPriceMXN } from '@/lib/formatPrice';
import { generateDealShareText } from '@/lib/shareText';
import { buildOfferUrl } from '@/lib/offerUrl';
import { trackAndOpenOfferUrl } from '@/lib/rewards/clientOutbound';
import { formatCupónBancarioDisplay, getBankCouponLabel } from '@/lib/bankCoupons';
import { mergeOfferImageUrls, buildOfferPublicPath } from '@/lib/offerPath';
import { postOfferVote, type VoteDirection } from '@/lib/votes/client';
import { useVoterVoteWeights } from '@/lib/hooks/useVoterVoteWeights';
import { publicProfilePath } from '@/lib/profileSlug';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';
import ClientLayout from '@/app/ClientLayout';
import VoteArrowButton from '@/app/components/VoteArrowButton';
import AffiliateDisclosure from '@/app/components/AffiliateDisclosure';
import OfferPriceInsightBlock from '@/app/components/OfferPriceInsightBlock';
import StoreBrandMark from '@/app/components/StoreBrandMark';
import OfferImageThumbs from '@/app/components/OfferImageThumbs';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchBatchUserData, type VoteValueMap, type FavoriteMap } from '@/lib/offers/batchUserData';
import { logClientError, notifyUserError } from '@/lib/utils/handleError';

function formatRemainingTime(createdAt?: string | null): string | null {
  if (!createdAt) return null;
  const expiry = new Date(createdAt);
  expiry.setDate(expiry.getDate() + 7);
  if (Number.isNaN(expiry.getTime())) return null;
  const diffMs = expiry.getTime() - Date.now();
  if (diffMs <= 0) return null;
  const diffD = Math.ceil(diffMs / 86400000);
  return diffD === 1 ? '1 día restante' : `${diffD} días restantes`;
}

function CommentAvatar({
  avatarUrl,
  sizeClass,
}: {
  avatarUrl?: string | null;
  sizeClass: string;
}) {
  if (avatarUrl) {
    const dim = sizeClass.includes('h-7') ? 28 : 32;
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={dim}
        height={dim}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
        unoptimized={
          avatarUrl.startsWith('http') &&
          !avatarUrl.includes(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
        }
      />
    );
  }
  return <User className={`${sizeClass} shrink-0 text-gray-400 dark:text-gray-500`} />;
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffM < 1) return 'Ahora mismo';
  if (diffM < 60) return `hace ${diffM} min`;
  if (diffH < 24) return `hace ${diffH}h`;
  if (diffD === 1) return 'hace 1 día';
  if (diffD < 7) return `hace ${diffD} días`;
  if (diffD < 30) return `hace ${Math.floor(diffD / 7)} sem`;
  return d.toLocaleDateString();
}

type CommentItem = {
  id: string;
  content: string;
  created_at: string;
  author: { username: string; avatar_url?: string | null };
  is_own?: boolean;
  parent_id?: string | null;
  image_url?: string | null;
  like_count?: number;
  liked_by_me?: boolean;
  replies?: CommentItem[];
};

const REPORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'precio_falso', label: 'Precio falso o engañoso' },
  { value: 'no_es_oferta', label: 'No es una oferta real' },
  { value: 'expirada', label: 'Oferta expirada' },
  { value: 'spam', label: 'Spam' },
  { value: 'afiliado_oculto', label: 'Enlace afiliado oculto' },
  { value: 'otro', label: 'Otro' },
];

type OfferPayload = {
  id: string;
  title: string;
  brand: string;
  originalPrice: number;
  discountPrice: number;
  discount: number;
  description?: string;
  steps?: string;
  conditions?: string;
  coupons?: string;
  offerUrl: string;
  image?: string;
  imageUrls?: string[];
  msiMonths?: number;
  bankCoupon?: string | null;
  upvotes: number;
  downvotes: number;
  votes: { up: number; down: number; score: number };
  author: {
    username: string;
    avatar_url?: string | null;
    leaderBadge?: string | null;
    creatorMlTag?: string | null;
    creatorAmazonTag?: string | null;
    userId?: string | null;
    slug?: string | null;
  };
  createdAt: string | null;
  categorySlug?: string;
  categoryLabel?: string;
  storeSlug?: string;
  storeName?: string;
  offerScope?: 'online' | 'in_store' | null;
};

export default function OfferPageContent({ offer }: { offer: OfferPayload }) {
  const { session } = useAuth();
  const { showToast } = useUI();
  const { up: wUp, down: wDown } = useVoterVoteWeights();

  const [voteValueMap, setVoteValueMap] = useState<VoteValueMap>({});
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({});
  const [localVote, setLocalVote] = useState<1 | -1 | 0 | null>(null);
  const [localUp, setLocalUp] = useState(offer.upvotes);
  const [localDown, setLocalDown] = useState(offer.downvotes);
  const [localScore, setLocalScore] = useState(offer.votes.score);
  const [isLiked, setIsLiked] = useState(false);

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentImageUrl, setCommentImageUrl] = useState<string | null>(null);
  const [commentImageUploading, setCommentImageUploading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState('');
  const [reportComment, setReportComment] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [votePending, setVotePending] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const reportModalRef = useRef<HTMLDivElement>(null);

  const closeReportModal = useCallback(() => {
    if (reportSubmitting) return;
    setShowReportModal(false);
    setReportType('');
    setReportComment('');
  }, [reportSubmitting]);

  useEffect(() => {
    if (!showReportModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeReportModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showReportModal, closeReportModal]);

  useEffect(() => {
    setImageIndex(0);
  }, [offer.id]);

  useEffect(() => {
    setLocalScore(offer.votes.score);
    setLocalUp(offer.upvotes);
    setLocalDown(offer.downvotes);
  }, [offer.id, offer.votes.score, offer.upvotes, offer.downvotes]);

  const userVote = localVote ?? 0;
  const storedVoteVal = voteValueMap[offer.id];
  const savings = offer.originalPrice - offer.discountPrice;
  const remainingLabel = formatRemainingTime(offer.createdAt);
  const allImages = mergeOfferImageUrls(offer.image, offer.imageUrls);
  const currentImage = allImages[imageIndex] || allImages[0] || offer.image || '/placeholder.png';
  const publicPath = buildOfferPublicPath(offer.id, offer.title);
  const offerAuthorProfileHref =
    offer.author?.username ? publicProfilePath(offer.author.username, offer.author.userId, offer.author.slug) : null;

  const fetchComments = useCallback(() => {
    if (!offer.id) return;
    setCommentsLoading(true);
    fetch(`/api/offers/${encodeURIComponent(offer.id)}/comments`, {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : { comments: [] }))
      .then((data) => {
        const list = Array.isArray(data.comments) ? data.comments : [];
        const roots = list.filter((c: CommentItem) => !c.parent_id);
        const withReplies = roots.map((r: CommentItem) => ({
          ...r,
          replies: list.filter((c: CommentItem) => c.parent_id === r.id).sort(
            (a: CommentItem, b: CommentItem) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          ),
        }));
        setComments(withReplies);
      })
      .catch(() => setComments([]))
      .finally(() => setCommentsLoading(false));
  }, [offer.id, session?.access_token]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchComments();
    }, 25_000);
    return () => clearInterval(id);
  }, [fetchComments]);

  useEffect(() => {
    if (!showShareMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showShareMenu]);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchBatchUserData(session.user.id, [offer.id]).then(({ voteMap: vm, voteValueMap: vvm, favoriteMap: fm }) => {
      setVoteValueMap(vvm);
      setFavoriteMap(fm);
      setIsLiked(!!fm[offer.id]);
      const v = vm[offer.id];
      if (v === 1 || v === -1) setLocalVote(v);
    });
  }, [session?.user?.id, offer.id]);

  const contributionForDisplay = (display: 0 | 1 | -1, stored: number | undefined): number => {
    if (display === 0) return 0;
    if (display === 1) return stored != null && stored > 0 ? stored : wUp;
    return stored != null && stored < 0 ? stored : wDown;
  };

  const handleVote = async (dir: VoteDirection) => {
    if (!session || votePending) return;
    const displayVote = dir === 'up' ? 1 : -1;
    const prevVote = userVote as 0 | 1 | -1;
    const newVote: 0 | 1 | -1 = prevVote === displayVote ? 0 : displayVote;
    const prevC = contributionForDisplay(prevVote, storedVoteVal);
    const newC = newVote === 0 ? 0 : newVote === 1 ? wUp : wDown;
    const wDelta = newC - prevC;

    const prevUp = localUp;
    const prevDown = localDown;
    const prevScore = localScore;
    const prevLocalVote = localVote;

    setLocalVote(newVote);
    setLocalUp((u) => u + (newVote === 1 ? 1 : prevVote === 1 ? -1 : 0));
    setLocalDown((d) => d + (newVote === -1 ? 1 : prevVote === -1 ? -1 : 0));
    setLocalScore((s) => s + wDelta);

    setVotePending(true);
    const result = await postOfferVote(offer.id, dir, session.access_token);
    setVotePending(false);
    if (!result.ok) {
      setLocalVote(prevLocalVote);
      setLocalUp(prevUp);
      setLocalDown(prevDown);
      setLocalScore(prevScore);
      showToast?.(result.message);
      return;
    }
    setVoteValueMap((prev) => {
      const next = { ...prev };
      if (newVote === 0) delete next[offer.id];
      else next[offer.id] = newVote === 1 ? wUp : wDown;
      return next;
    });
  };

  const handleCommentImage = async (file: File | null) => {
    if (!file || !session?.access_token) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast?.('La foto no puede superar 2 MB');
      return;
    }
    setCommentImageUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/upload-offer-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data?.url !== 'string') {
        showToast?.(data?.error ?? 'No se pudo subir la foto');
        return;
      }
      setCommentImageUrl(data.url);
    } finally {
      setCommentImageUploading(false);
    }
  };

  const handleSubmitComment = async () => {
    const text = commentText.trim();
    if (!text || !offer.id || !session?.access_token || commentSubmitting) return;
    if (text.length > 280) return;
    setCommentSubmitting(true);
    try {
      const res = await fetch(`/api/offers/${encodeURIComponent(offer.id)}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          content: text,
          parent_id: replyingToId || undefined,
          ...(commentImageUrl ? { image_url: commentImageUrl } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCommentText('');
        setCommentImageUrl(null);
        setReplyingToId(null);
        const needsMod = data?.needsModeration === true || data?.status === 'pending';
        showToast?.(
          needsMod ? 'Comentario enviado. Será visible cuando pase la moderación.' : 'Comentario publicado.'
        );
        fetchComments();
      } else {
        showToast?.(typeof data?.error === 'string' ? data.error : 'No se pudo publicar');
      }
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!offer.id || !session?.access_token || likingId) return;
    setLikingId(commentId);
    try {
      const res = await fetch(
        `/api/offers/${encodeURIComponent(offer.id)}/comments/${encodeURIComponent(commentId)}/like`,
        { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (res.ok) fetchComments();
    } finally {
      setLikingId(null);
    }
  };

  const handleReportOffer = async () => {
    if (!reportType || !offer.id || reportSubmitting || !session?.access_token) return;
    const commentTrim = reportComment.trim();
    if (commentTrim.length < 100) {
      showToast?.('Escribe al menos 100 caracteres describiendo el problema.');
      return;
    }
    setReportSubmitting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ offerId: offer.id, reportType, comment: commentTrim }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && !data.error) {
        setShowReportModal(false);
        setReportType('');
        setReportComment('');
        showToast?.('Reporte enviado. Lo revisaremos.');
      } else {
        showToast?.(data?.error || 'Error al enviar el reporte');
      }
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleFavoriteClick = async () => {
    if (!session) return;
    if (!offer.id) return;
    const prev = isLiked;
    setIsLiked(!prev);
    const supabase = createClient();
    if (prev) {
      const { error } = await supabase
        .from('offer_favorites')
        .delete()
        .eq('offer_id', offer.id)
        .eq('user_id', session.user.id);
      if (error) setIsLiked(true);
    } else {
      const { error } = await supabase.from('offer_favorites').insert({
        user_id: session.user.id,
        offer_id: offer.id,
      });
      if (error) setIsLiked(false);
    }
  };

  const ctaUrl = buildOfferUrl(offer.offerUrl);
  const bankCouponLabel = getBankCouponLabel(offer.bankCoupon ?? null);
  const personalCouponTrim = offer.coupons?.trim() ?? '';
  const showCtaCouponChip = Boolean(ctaUrl && (bankCouponLabel || personalCouponTrim));

  const copyOfferCouponsToClipboard = async () => {
    const parts: string[] = [];
    if (personalCouponTrim) parts.push(personalCouponTrim);
    if (bankCouponLabel) parts.push(formatCupónBancarioDisplay(bankCouponLabel));
    if (parts.length === 0) return;
    try {
      await navigator.clipboard.writeText(parts.join('\n'));
      showToast?.('Cupón copiado. Pégalo al pagar en la tienda.');
    } catch {
      /* noop */
    }
  };

  return (
    <ClientLayout>
      <article className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
          <Link href="/" className="hover:text-violet-600 dark:hover:text-violet-400">Inicio</Link>
          <span aria-hidden>/</span>
          {offer.categorySlug && (
            <>
              <Link href={`/categoria/${offer.categorySlug}`} className="hover:text-violet-600 dark:hover:text-violet-400">
                {offer.categoryLabel ?? offer.categorySlug}
              </Link>
              <span aria-hidden>/</span>
            </>
          )}
          {offer.storeSlug && offer.storeName && (
            <>
              <Link href={`/tienda/${offer.storeSlug}`} className="hover:text-violet-600 dark:hover:text-violet-400">
                {offer.storeName}
              </Link>
              <span aria-hidden>/</span>
            </>
          )}
          <span className="text-gray-700 dark:text-gray-300 truncate max-w-[200px]" aria-current="page">
            {offer.title}
          </span>
        </nav>

        <div className="rounded-2xl bg-white dark:bg-[#141414] border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <StoreBrandMark store={offer.brand} />
              {offer.offerScope ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {offer.offerScope === 'online' ? (
                    <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <Store className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  <span>{offer.offerScope === 'online' ? 'Compra en línea' : 'En tienda / sucursal'}</span>
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="relative" ref={shareMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowShareMenu((v) => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] hover:text-violet-600 dark:hover:text-violet-400"
                  aria-label="Compartir"
                  aria-expanded={showShareMenu}
                >
                  <Share2 className="h-4 w-4" />
                </button>
                {showShareMenu ? (
                  <div className="absolute right-0 top-full mt-2 z-20 min-w-[180px] rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] shadow-lg py-2">
                    {(() => {
                      const dealUrl = typeof window !== 'undefined' ? `${window.location.origin}${publicPath}` : '';
                      const shareText = generateDealShareText(
                        { title: offer.title, discountPrice: offer.discountPrice, originalPrice: offer.originalPrice },
                        dealUrl
                      );
                      const trackShare = () => {
                        fetch('/api/events', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            ...(session?.access_token
                              ? { Authorization: `Bearer ${session.access_token}` }
                              : {}),
                          },
                          body: JSON.stringify({ offer_id: offer.id, event_type: 'share' }),
                        }).catch((err) => logClientError('offer-page:share-event', err));
                      };
                      const nativeShare = async () => {
                        if (typeof navigator.share !== 'function') return false;
                        try {
                          await navigator.share({
                            title: offer.title,
                            text: shareText,
                            url: dealUrl,
                          });
                          trackShare();
                          setShowShareMenu(false);
                          return true;
                        } catch {
                          return false;
                        }
                      };
                      return (
                        <>
                          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
                            <button
                              type="button"
                              onClick={() => void nativeShare()}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-violet-600 dark:text-violet-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                              Compartir…
                            </button>
                          ) : null}
                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                            onClick={() => { trackShare(); setShowShareMenu(false); }}
                          >
                            WhatsApp
                          </a>
                          <a
                            href={`https://t.me/share/url?url=${encodeURIComponent(dealUrl)}&text=${encodeURIComponent(shareText)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                            onClick={() => { trackShare(); setShowShareMenu(false); }}
                          >
                            Telegram
                          </a>
                          <a
                            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                            onClick={() => { trackShare(); setShowShareMenu(false); }}
                          >
                            X
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              const url = typeof window !== 'undefined' ? `${window.location.origin}${publicPath}` : '';
                              navigator.clipboard.writeText(url).then(() => {
                                setShareCopied(true);
                                setTimeout(() => setShareCopied(false), 2000);
                                showToast?.('Enlace copiado.');
                              }).catch((err) =>
                                notifyUserError(showToast, 'No se pudo copiar el enlace.', 'offer-page:clipboard', err)
                              );
                              trackShare();
                              setShowShareMenu(false);
                            }}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                          >
                            <Copy className="h-4 w-4 shrink-0" />
                            {shareCopied ? '¡Copiado!' : 'Copiar enlace'}
                          </button>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleFavoriteClick}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1a1a1a]"
                aria-label={isLiked ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              >
                <Heart className={`h-5 w-5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row">
            <div className="md:w-[45%] bg-gray-50 dark:bg-[#1a1a1a] p-4">
              <div className="relative aspect-square w-full overflow-hidden rounded-xl">
                <Image
                  src={currentImage}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 45vw"
                  className="object-contain p-2"
                  priority
                  unoptimized={currentImage.startsWith('/') || currentImage.includes('placehold.co')}
                />
              </div>
              <OfferImageThumbs images={allImages} activeIndex={imageIndex} onSelect={setImageIndex} />
            </div>
            <div className="p-6 md:p-8 flex-1">
              <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                {offer.title}
              </h1>
              {offer.author?.username && (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {offerAuthorProfileHref ? (
                    <Link
                      href={offerAuthorProfileHref}
                      className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400"
                    >
                      {offer.author.avatar_url ? (
                        <img src={offer.author.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                      <span>{offer.author.username} lo encontró</span>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      {offer.author.avatar_url ? (
                        <img src={offer.author.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                      <span>{offer.author.username} lo encontró</span>
                    </span>
                  )}
                  {offer.author.leaderBadge === 'cazador_estrella' && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400" title="Suele acertar en precios">
                      <BadgeCheck className="h-3.5 w-3.5" /> Top
                    </span>
                  )}
                  {offer.author.leaderBadge === 'cazador_aventa' && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400" title="Perfil destacado">
                      <BadgeCheck className="h-3.5 w-3.5" /> Destacado
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-baseline gap-3 mt-4">
                <span className="text-3xl font-bold text-violet-600 dark:text-violet-400">
                  {formatPriceMXN(offer.discountPrice)}
                </span>
                {offer.originalPrice > 0 && (
                  <>
                    <span className="text-lg text-gray-500 dark:text-gray-400 line-through">
                      {formatPriceMXN(offer.originalPrice)}
                    </span>
                    {offer.discount > 0 && (
                      <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                        -{offer.discount}%
                      </span>
                    )}
                  </>
                )}
              </div>
              {offer.originalPrice > 0 && savings > 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ahorras {formatPriceMXN(savings)}</p>
              )}
              {(offer.msiMonths != null && offer.msiMonths >= 1) || bankCouponLabel ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {offer.msiMonths != null && offer.msiMonths >= 1 ? (
                    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      {offer.msiMonths} MSI: {formatPriceMXN(offer.discountPrice / offer.msiMonths)}/mes
                    </p>
                  ) : null}
                  {bankCouponLabel ? (
                    <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {formatCupónBancarioDisplay(bankCouponLabel)}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {remainingLabel ? (
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {remainingLabel}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-900 dark:text-gray-100">
                <div className="flex items-center gap-2">
                  <VoteArrowButton
                    direction="up"
                    active={userVote === 1}
                    disabled={votePending}
                    onClick={() => handleVote('up')}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-violet-50 dark:hover:bg-violet-950/30 active:scale-95 ${
                      userVote === 1
                        ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                    iconClassName={`h-5 w-5 ${userVote === 1 ? 'fill-current' : ''}`}
                    aria-label="Votar arriba"
                  />
                  <span className="min-w-[2.25rem] text-center text-lg font-semibold tabular-nums">{localScore}</span>
                  <VoteArrowButton
                    direction="down"
                    active={userVote === -1}
                    disabled={votePending}
                    onClick={() => handleVote('down')}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-violet-50 dark:hover:bg-violet-950/30 active:scale-95 ${
                      userVote === -1
                        ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                    iconClassName={`h-5 w-5 ${userVote === -1 ? 'fill-current' : ''}`}
                    aria-label="Votar abajo"
                  />
                </div>
                <a
                  href="#comentarios"
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  {comments.length}
                </a>
                {offer.categorySlug ? (
                  <Link
                    href={`/categoria/${offer.categorySlug}`}
                    className="text-xs font-medium px-3 py-1.5 rounded-full bg-gray-100 dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    {offer.categoryLabel ?? offer.categorySlug}
                  </Link>
                ) : null}
                {offer.storeSlug && offer.storeName ? (
                  <Link
                    href={`/tienda/${offer.storeSlug}`}
                    className="text-xs font-medium px-3 py-1.5 rounded-full bg-gray-100 dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    {offer.storeName}
                  </Link>
                ) : null}
              </div>

              {ctaUrl && (
                <div className="mt-6 flex flex-wrap items-stretch gap-2">
                  <a
                    href={ctaUrl}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    onClick={(e) => {
                      e.preventDefault();
                      void copyOfferCouponsToClipboard();
                      if (offer.id && offer.offerUrl?.trim()) {
                        void trackAndOpenOfferUrl({
                          offerId: offer.id,
                          offerUrl: offer.offerUrl,
                          accessToken: session?.access_token,
                        });
                      }
                    }}
                    className="inline-flex flex-1 min-w-[min(100%,11rem)] items-center justify-center gap-2 rounded-xl bg-violet-600 dark:bg-violet-500 text-white px-6 py-3 font-semibold hover:bg-violet-700 dark:hover:bg-violet-600 transition-colors"
                  >
                    Ver si sigue disponible
                    <ExternalLink className="h-4 w-4 shrink-0" />
                  </a>
                  {showCtaCouponChip ? (
                    <div
                      className="inline-flex min-w-0 max-w-full flex-1 basis-[min(100%,14rem)] items-center justify-center rounded-xl border-2 border-dashed border-white/90 bg-violet-600 dark:bg-violet-500 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm"
                      role="note"
                      aria-label="Cupón de la oferta"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        {bankCouponLabel ? (
                          <span className="leading-snug font-semibold">{formatCupónBancarioDisplay(bankCouponLabel)}</span>
                        ) : null}
                        {personalCouponTrim ? (
                          <span className="font-mono text-xs font-semibold break-all text-white">{personalCouponTrim}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {ctaUrl ? (
                <div className="mt-2">
                  <AffiliateDisclosure variant="badge" />
                </div>
              ) : null}

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400"
                >
                  <Flag className="h-4 w-4" />
                  Reportar
                </button>
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-200 dark:divide-gray-700 border-t border-gray-200 dark:border-gray-700">
              {offer.id ? (
                <details className="px-6 md:px-8 py-4" open>
                  <summary className="cursor-pointer text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Información adicional
                  </summary>
                  <div className="mt-3 space-y-4">
                    <OfferPriceInsightBlock offerId={offer.id} />
                    <AffiliateDisclosure variant="block" includeAmazonEn />
                  </div>
                </details>
              ) : null}
              {offer.description?.trim() ? (
                <details className="px-6 md:px-8 py-4">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Descripción
                  </summary>
                  <p className="mt-3 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{offer.description}</p>
                </details>
              ) : null}
              {offer.steps?.trim() ? (
                <details className="px-6 md:px-8 py-4">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Pasos
                  </summary>
                  <p className="mt-3 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{offer.steps}</p>
                </details>
              ) : null}
              {offer.conditions?.trim() ? (
                <details className="px-6 md:px-8 py-4">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Condiciones
                  </summary>
                  <p className="mt-3 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{offer.conditions}</p>
                </details>
              ) : null}
              {offer.coupons?.trim() && !showCtaCouponChip ? (
                <details className="px-6 md:px-8 py-4">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Cupones
                  </summary>
                  <p className="mt-3 text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{offer.coupons}</p>
                </details>
              ) : null}

          {/* Inline comments */}
          <div id="comentarios" className="px-6 md:px-8 py-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Comentarios ({comments.length})
            </h2>
            {commentsLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Cargando comentarios…</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                Nadie ha dicho nada. ¿El precio sigue bien?
              </p>
            ) : (
              <div className="space-y-4 mb-6">
                {comments.map((comment) => {
                  const isOwn = comment.is_own === true;
                  return (
                    <div key={comment.id} className="space-y-2">
                      <div
                        className={`rounded-xl border p-4 ${
                          isOwn
                            ? 'border-violet-300 dark:border-violet-600 bg-violet-50/60 dark:bg-violet-900/20'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a]'
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <CommentAvatar avatarUrl={comment.author.avatar_url} sizeClass="h-8 w-8" />
                          <p className={`text-sm font-medium ${isOwn ? 'text-violet-700 dark:text-violet-300' : 'text-gray-900 dark:text-gray-100'}`}>
                            {comment.author.username}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatRelativeDate(comment.created_at)}</p>
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 text-sm">{comment.content}</p>
                        {comment.image_url && (
                          <img src={comment.image_url} alt="" className="mt-2 rounded-lg max-h-40 object-cover" />
                        )}
                        <div className="mt-2 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => session && handleLikeComment(comment.id)}
                            disabled={!session || likingId === comment.id}
                            className={`flex items-center gap-1 text-xs font-medium ${comment.liked_by_me ? 'text-pink-500' : 'text-gray-500 dark:text-gray-400 hover:text-pink-500'}`}
                          >
                            <Heart className={`h-4 w-4 ${comment.liked_by_me ? 'fill-current' : ''}`} />
                            {(comment.like_count ?? 0) > 0 ? comment.like_count : ''}
                          </button>
                          <button
                            type="button"
                            onClick={() => session && setReplyingToId(comment.id)}
                            className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 flex items-center gap-1"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Responder
                          </button>
                        </div>
                      </div>
                      {(comment.replies?.length ?? 0) > 0 && (
                        <div className="pl-4 md:pl-6 space-y-2 border-l-2 border-gray-200 dark:border-gray-700 ml-2">
                          {comment.replies?.map((reply) => {
                            const isOwnReply = reply.is_own === true;
                            return (
                              <div
                                key={reply.id}
                                className={`rounded-lg border p-3 ${
                                  isOwnReply
                                    ? 'border-violet-300 dark:border-violet-600 bg-violet-50/50 dark:bg-violet-900/15'
                                    : 'border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-[#1a1a1a]/80'
                                }`}
                              >
                                <div className="mb-1 flex items-center gap-2">
                                  <CommentAvatar avatarUrl={reply.author.avatar_url} sizeClass="h-7 w-7" />
                                  <p className={`text-sm font-medium ${isOwnReply ? 'text-violet-700 dark:text-violet-300' : 'text-gray-900 dark:text-gray-100'}`}>
                                    {reply.author.username}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatRelativeDate(reply.created_at)}</p>
                                </div>
                                <p className="text-gray-700 dark:text-gray-300 text-sm">{reply.content}</p>
                                <div className="mt-2 flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => session && handleLikeComment(reply.id)}
                                    disabled={!session || likingId === reply.id}
                                    className={`flex items-center gap-1 text-xs font-medium ${reply.liked_by_me ? 'text-pink-500' : 'text-gray-500 dark:text-gray-400 hover:text-pink-500'}`}
                                  >
                                    <Heart className={`h-4 w-4 ${reply.liked_by_me ? 'fill-current' : ''}`} />
                                    {(reply.like_count ?? 0) > 0 ? reply.like_count : ''}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => session && setReplyingToId(reply.id)}
                                    className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 flex items-center gap-1"
                                  >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                    Responder
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] p-4 space-y-3">
              {replyingToId && (() => {
                const replyingTo = comments.flatMap((c) => [c, ...(c.replies ?? [])]).find((x) => x.id === replyingToId);
                return replyingTo ? (
                  <p className="text-sm text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded-lg px-3 py-2">
                    Respondiendo a <span className="font-semibold">{replyingTo.author.username}</span>: &quot;{replyingTo.content.slice(0, 60)}{replyingTo.content.length > 60 ? '…' : ''}&quot;
                  </p>
                ) : null;
              })()}
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={session ? (replyingToId ? 'Escribe tu respuesta (máx. 280 caracteres)...' : 'Escribe un comentario (máx. 280 caracteres)...') : 'Inicia sesión para comentar.'}
                maxLength={280}
                disabled={!session}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-purple-500 focus:outline-none resize-none disabled:opacity-60"
                rows={2}
              />
              {commentImageUrl ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={commentImageUrl}
                    alt=""
                    className="h-20 w-20 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setCommentImageUrl(null)}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-black/70 px-1.5 text-[10px] text-white"
                  >
                    ✕
                  </button>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {replyingToId && (
                  <button
                    type="button"
                    onClick={() => { setReplyingToId(null); setCommentText(''); }}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
                  >
                    Cancelar respuesta
                  </button>
                )}
                {session ? (
                  <label className="cursor-pointer rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={commentImageUploading}
                      onChange={(e) => {
                        void handleCommentImage(e.target.files?.[0] ?? null);
                        e.target.value = '';
                      }}
                    />
                    {commentImageUploading ? 'Subiendo…' : 'Foto'}
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={handleSubmitComment}
                  disabled={!commentText.trim() || commentSubmitting || !session}
                  className="rounded-xl bg-violet-600 dark:bg-violet-500 px-4 py-2 font-semibold text-white text-sm hover:bg-violet-700 dark:hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {commentSubmitting ? 'Enviando…' : replyingToId ? 'Responder' : 'Comentar'}
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      </article>

      {showReportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={closeReportModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-title"
          aria-describedby="report-desc"
        >
          <div
            ref={reportModalRef}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1a1a1a] shadow-xl p-6 border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="report-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Reportar oferta
            </h3>
            <p id="report-desc" className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              ¿Precio falso, link roto u otra cosa? Cuéntalo (mín. 100 caracteres).
            </p>
            <div className="space-y-2 mb-4" role="radiogroup" aria-labelledby="report-title">
              {REPORT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 border border-transparent focus-within:border-amber-500 dark:focus-within:border-amber-400"
                >
                  <input
                    type="radio"
                    name="reportType"
                    value={opt.value}
                    checked={reportType === opt.value}
                    onChange={() => setReportType(opt.value)}
                    className="rounded-full border-gray-300 text-amber-500 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
            <label htmlFor="report-comment" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Descripción del problema
            </label>
            <textarea
              id="report-comment"
              value={reportComment}
              onChange={(e) => setReportComment(e.target.value)}
              placeholder="Ej: El precio mostrado ya no aplica, el enlace lleva a otro producto..."
              maxLength={500}
              rows={4}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 dark:focus:ring-amber-400 dark:focus:border-amber-400"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {reportComment.trim().length < 100 ? (
                <span className={reportComment.trim().length > 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
                  {reportComment.trim().length}/100 caracteres mínimos
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">{reportComment.trim().length}/500</span>
              )}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeReportModal}
                disabled={reportSubmitting}
                className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReportOffer}
                disabled={reportSubmitting || reportComment.trim().length < 100 || !reportType}
                className="flex-1 rounded-xl bg-amber-600 text-white py-2.5 text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                {reportSubmitting ? 'Enviando…' : 'Enviar reporte'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ClientLayout>
  );
}
