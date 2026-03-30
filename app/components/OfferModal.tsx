'use client';

import Image from 'next/image';
import { X, Heart, ThumbsUp, ThumbsDown, ExternalLink, User, MessageCircle, Share2, Flag, BadgeCheck } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useUI } from '@/app/providers/UIProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { formatPriceMXN } from '@/lib/formatPrice';
import { buildOfferUrl } from '@/lib/offerUrl';
import { getBankCouponLabel } from '@/lib/bankCoupons';
import { buildOfferPublicPath, mergeOfferImageUrls } from '@/lib/offerPath';
import { postOfferVote, type VoteDirection } from '@/lib/votes/client';
import { useVoterVoteWeights } from '@/lib/hooks/useVoterVoteWeights';
import { publicProfilePath } from '@/lib/profileSlug';
import { logClientError, notifyUserError } from '@/lib/utils/handleError';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createPortal } from 'react-dom';

interface OfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  brand: string;
  originalPrice: number;
  discountPrice: number;
  discount: number;
  description?: string;
  steps?: string;
  conditions?: string;
  coupons?: string;
  offerUrl?: string;
  upvotes?: number;
  downvotes?: number;
  /** Score ponderado (p. ej. `ranking_momentum`); si falta se usa 2×(up−down). */
  votesScore?: number;
  offerId?: string;
  author?: {
    username: string;
    avatar_url?: string | null;
    leaderBadge?: string | null;
    creatorMlTag?: string | null;
    userId?: string | null;
    slug?: string | null;
  };
  image?: string;
  imageUrls?: string[];
  msiMonths?: number | null;
  bankCoupon?: string | null;
  isLiked?: boolean;
  onFavoriteChange?: (isFavorite: boolean) => void;
  onVoteChange?: (offerId: string, value: 1 | -1 | 0, storedWeight?: number) => void;
  userVoteStoredValue?: number | null;
  userVote?: 1 | -1 | 0 | null;
}

type CommentItem = {
  id: string;
  content: string;
  created_at: string;
  author: { username: string };
  user_id?: string | null;
  parent_id?: string | null;
  image_url?: string | null;
  like_count?: number;
  liked_by_me?: boolean;
  replies?: CommentItem[];
};

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

export default function OfferModal({
  isOpen,
  onClose,
  title,
  brand,
  originalPrice,
  discountPrice,
  discount,
  description,
  steps,
  conditions,
  coupons,
  offerUrl,
  upvotes = 0,
  downvotes = 0,
  votesScore,
  offerId,
  author,
  image,
  imageUrls,
  msiMonths,
  bankCoupon,
  isLiked: isLikedProp = false,
  onFavoriteChange,
  onVoteChange,
  userVoteStoredValue: userVoteStoredProp = null,
  userVote: userVoteProp = 0,
}: OfferModalProps) {
  const bankCouponLabel = getBankCouponLabel(bankCoupon ?? null);
  const bankCouponDisplay = bankCouponLabel ? bankCouponLabel.toUpperCase() : null;
  const personalCouponTrim = coupons?.trim() ?? '';
  const outboundUrlTrim = offerUrl?.trim() ?? '';
  const showCtaCouponChip = Boolean(outboundUrlTrim && (bankCouponDisplay || personalCouponTrim));

  const router = useRouter();
  const { setOfferOpen, openLuna, showToast } = useUI();
  const { session } = useAuth();
  const { up: wUp, down: wDown } = useVoterVoteWeights();
  const [localLiked, setLocalLiked] = useState<boolean | null>(null);
  const isLiked = localLiked !== null ? localLiked : isLikedProp;
  const [localVote, setLocalVote] = useState<1 | -1 | 0 | null>(null);
  const userVote = localVote !== null ? localVote : (userVoteProp ?? 0);

  useEffect(() => {
    if (isOpen && offerId) setLocalVote(null);
  }, [isOpen, offerId]);
  const [localUpvotes, setLocalUpvotes] = useState(upvotes);
  const [localDownvotes, setLocalDownvotes] = useState(downvotes);
  const [activeTab, setActiveTab] = useState<'comments' | 'reviews'>('comments');
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState<string>('');
  const [reportComment, setReportComment] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const hasTrackedRef = useRef(false);
  const outboundSentRef = useRef(false);
  const allImages = mergeOfferImageUrls(image, imageUrls);
  const [imageIndex, setImageIndex] = useState(0);
  const currentImage = allImages[imageIndex] || allImages[0] || image || '/placeholder.png';
  const authorProfileHref =
    author?.username ? publicProfilePath(author.username, author.userId, author.slug) : null;
  const baseWeightedScore =
    votesScore != null && !Number.isNaN(Number(votesScore))
      ? Number(votesScore)
      : 2 * (upvotes - downvotes);
  const [localWeightedScore, setLocalWeightedScore] = useState(baseWeightedScore);

  useEffect(() => {
    if (!isOpen) setImageIndex(0);
  }, [isOpen]);
  useEffect(() => {
    setImageIndex(0);
  }, [offerId]);

  const savings = originalPrice - discountPrice;

  useEffect(() => {
    if (!isOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  useEffect(() => {
    setOfferOpen(isOpen);
    if (!isOpen) outboundSentRef.current = false;
    return () => setOfferOpen(false);
  }, [isOpen, setOfferOpen]);

  useEffect(() => {
    if (!isOpen) {
      hasTrackedRef.current = false;
      return;
    }
    if (!offerId || hasTrackedRef.current) return;
    hasTrackedRef.current = true;
    fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ offer_id: offerId, event_type: 'view' }),
    }).catch((err) => logClientError('offer-modal:view-event', err));
  }, [isOpen, offerId]);

  useEffect(() => {
    if (isOpen && offerId) {
      setLocalUpvotes(upvotes);
      setLocalDownvotes(downvotes);
      setLocalWeightedScore(baseWeightedScore);
    }
  }, [isOpen, offerId, upvotes, downvotes, baseWeightedScore]);

  const fetchComments = useCallback(() => {
    if (!offerId) return;
    setCommentsLoading(true);
    fetch(`/api/offers/${encodeURIComponent(offerId)}/comments`, {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : { comments: [] }))
      .then((data) => {
        const list = Array.isArray(data.comments) ? data.comments : [];
        const roots = list.filter((c: CommentItem) => !c.parent_id);
        const withReplies = roots.map((r: CommentItem) => ({
          ...r,
          replies: list.filter((c: CommentItem) => c.parent_id === r.id).sort(
            (a: CommentItem, b: CommentItem) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          ),
        }));
        setComments(withReplies);
      })
      .catch((err) => {
        notifyUserError(showToast, 'No pudimos cargar los comentarios.', 'offer-modal:comments', err);
        setComments([]);
      })
      .finally(() => setCommentsLoading(false));
  }, [offerId, session?.access_token, showToast]);

  useEffect(() => {
    if (!isOpen || !offerId) {
      setComments([]);
      return;
    }
    fetchComments();
  }, [isOpen, offerId, fetchComments]);

  const contributionForDisplay = (display: 0 | 1 | -1, stored: number | null | undefined): number => {
    if (display === 0) return 0;
    if (display === 1) return stored != null && stored > 0 ? stored : wUp;
    return stored != null && stored < 0 ? stored : wDown;
  };

  const handleVote = (vote: VoteDirection) => {
    if (!offerId || !session?.access_token) return;
    const displayVote = vote === 'up' ? 1 : -1;
    const prevVote = userVote as 0 | 1 | -1;
    const prevUp = localUpvotes;
    const prevDown = localDownvotes;
    const prevWeighted = localWeightedScore;

    const newVote: 1 | -1 | 0 = prevVote === displayVote ? 0 : displayVote;
    const prevC = contributionForDisplay(prevVote, userVoteStoredProp);
    const newC =
      newVote === 0
        ? 0
        : newVote === 1
          ? contributionForDisplay(1, wUp)
          : contributionForDisplay(-1, wDown);
    const wDelta = newC - prevC;

    if (prevVote === displayVote) {
      setLocalVote(0);
      if (vote === 'up') setLocalUpvotes((p) => p - 1);
      else setLocalDownvotes((p) => p - 1);
    } else {
      if (prevVote === 1) setLocalUpvotes((p) => p - 1);
      if (prevVote === -1) setLocalDownvotes((p) => p - 1);
      setLocalVote(displayVote);
      if (vote === 'up') setLocalUpvotes((p) => p + 1);
      else setLocalDownvotes((p) => p + 1);
    }
    setLocalWeightedScore((s) => s + wDelta);

    void postOfferVote(offerId, vote, session.access_token).then((result) => {
      if (result.ok) {
        onVoteChange?.(
          offerId,
          newVote,
          newVote === 0 ? undefined : newVote === 1 ? wUp : wDown
        );
        return;
      }
      setLocalVote(prevVote);
      setLocalUpvotes(prevUp);
      setLocalDownvotes(prevDown);
      setLocalWeightedScore(prevWeighted);
      showToast?.(result.message);
    });
  };

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

  const handleOutboundClick = () => {
    if (outboundSentRef.current) return;
    outboundSentRef.current = true;
    try {
      const parts: string[] = [];
      if (personalCouponTrim) parts.push(personalCouponTrim);
      if (bankCouponDisplay) parts.push(`Cupón bancario: ${bankCouponDisplay}`);
      if (parts.length > 0) {
        void navigator.clipboard.writeText(parts.join('\n')).then(
          () => showToast?.('Cupón copiado al portapapeles'),
          () => {}
        );
      }
      if (offerId) {
        fetch('/api/track-outbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ offerId }),
        }).catch((err) => logClientError('offer-modal:track-outbound', err));
      }
      if (offerUrl?.trim()) {
        const url = buildOfferUrl(offerUrl, author?.creatorMlTag) || offerUrl.trim();
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      outboundSentRef.current = false;
    }
  };

  const handleSubmitComment = async () => {
    const text = commentText.trim();
    if (!text || !offerId || !session?.access_token || commentSubmitting) return;
    if (text.length > 280) return;
    setCommentSubmitting(true);
    try {
      const res = await fetch(`/api/offers/${encodeURIComponent(offerId)}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: text, parent_id: replyingToId || undefined }),
      });
      if (res.ok) {
        setCommentText('');
        setReplyingToId(null);
        showToast?.('Comentario enviado. Será visible cuando pase la moderación.');
        fetchComments();
      }
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!offerId || !session?.access_token || likingId) return;
    setLikingId(commentId);
    try {
      const res = await fetch(
        `/api/offers/${encodeURIComponent(offerId)}/comments/${encodeURIComponent(commentId)}/like`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      if (res.ok) fetchComments();
    } finally {
      setLikingId(null);
    }
  };

  const handleSubmitReport = async () => {
    if (!reportType || !offerId || reportSubmitting) return;
    if (!session?.access_token) {
      showToast?.('Inicia sesión para reportar');
      return;
    }
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
        body: JSON.stringify({ offerId, reportType, comment: commentTrim }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        showToast?.('report_success');
        setShowReportModal(false);
        setReportType('');
        setReportComment('');
      } else {
        showToast?.(data?.error ?? 'Error al enviar');
      }
    } catch {
      showToast?.('Error al enviar');
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleReportComment = async (commentId: string) => {
    if (!offerId || !session?.access_token) {
      showToast?.('Inicia sesión para reportar');
      return;
    }
    try {
      const res = await fetch(
        `/api/offers/${encodeURIComponent(offerId)}/comments/${encodeURIComponent(commentId)}/report`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ reason: 'Reportado por usuario' }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        showToast?.('Comentario reportado. Gracias por ayudar.');
      } else if (res.status === 409) {
        showToast?.('Ya reportaste este comentario.');
      } else {
        showToast?.(data?.error ?? 'Error al reportar');
      }
    } catch {
      showToast?.('Error al reportar');
    }
  };

  const REPORT_OPTIONS: { value: string; label: string }[] = [
    { value: 'precio_falso', label: 'Precio falso o engañoso' },
    { value: 'no_es_oferta', label: 'No es una oferta real' },
    { value: 'expirada', label: 'Oferta expirada' },
    { value: 'spam', label: 'Spam' },
    { value: 'afiliado_oculto', label: 'Enlace afiliado oculto' },
    { value: 'otro', label: 'Otro' },
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden"
        onClick={onClose}
        style={{ overscrollBehavior: 'contain' }}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="relative z-10 w-full max-w-2xl md:max-w-5xl lg:max-w-6xl max-h-[92vh] md:max-h-[85vh] overflow-hidden rounded-3xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col overscroll-contain touch-pan-y"
          onClick={(e) => e.stopPropagation()}
          style={{ overflowX: 'hidden' }}
        >
          {/* Desktop: contenedor grid — imagen izquierda, contenido derecha */}
          <div className="flex flex-col md:flex-row flex-1 min-h-0 md:overflow-hidden">
          {/* Desktop: imagen izquierda */}
          <div className="relative hidden md:flex md:w-[44%] md:shrink-0 md:min-h-0 md:self-stretch bg-gray-50 dark:bg-[#1d1d1f] items-center justify-center overflow-hidden">
            <Image src={currentImage} alt="" fill sizes="44vw" className="object-contain object-center" unoptimized={currentImage.startsWith('/')} />
            {allImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setImageIndex((i) => (i === 0 ? allImages.length - 1 : i - 1)); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 dark:bg-gray-900/90 p-2 shadow-md border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                  aria-label="Imagen anterior"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setImageIndex((i) => (i === allImages.length - 1 ? 0 : i + 1)); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 dark:bg-gray-900/90 p-2 shadow-md border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                  aria-label="Siguiente imagen"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {allImages.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setImageIndex(i); }}
                      className={`h-1.5 rounded-full transition-all ${i === imageIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
                      aria-label={`Imagen ${i + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
            <button
              onClick={handleFavoriteClick}
              className="absolute right-3 top-3 rounded-full bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm p-2.5 shadow-lg border border-white/40 dark:border-gray-700/60 transition-all duration-200 hover:scale-105 active:scale-95"
              aria-label={isLiked ? 'Quitar de favoritos' : 'Agregar a favoritos'}
            >
              <Heart
                className={`h-5 w-5 ${
                  isLiked ? 'fill-red-500/90 text-red-500/90' : 'text-gray-500/90 dark:text-gray-400/90'
                }`}
              />
            </button>
            <button
              onClick={onClose}
              className="absolute left-3 top-3 rounded-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-2.5 shadow-lg border border-gray-200/80 dark:border-gray-700 transition-all duration-200 hover:scale-105 active:scale-95"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </button>
          </div>

          {/* Columna derecha: scroll (mobile imagen hero + contenido; desktop solo contenido) */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain flex flex-col md:min-w-0">
            {/* Mobile: imagen como hero, aspect-ratio, object-contain, se desplaza al hacer scroll */}
            <div className="md:hidden relative w-full aspect-[4/5] shrink-0 bg-[#F5F5F7] dark:bg-[#1d1d1f] flex items-center justify-center overflow-hidden">
              <Image src={currentImage} alt="" fill sizes="100vw" className="object-contain object-center" unoptimized={currentImage.startsWith('/')} />
              {allImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setImageIndex((i) => (i === 0 ? allImages.length - 1 : i - 1)); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 dark:bg-gray-900/90 p-2 shadow-md border border-gray-200 dark:border-gray-700"
                    aria-label="Imagen anterior"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setImageIndex((i) => (i === allImages.length - 1 ? 0 : i + 1)); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 dark:bg-gray-900/90 p-2 shadow-md border border-gray-200 dark:border-gray-700"
                    aria-label="Siguiente imagen"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {allImages.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setImageIndex(i); }}
                        className={`h-1.5 rounded-full transition-all ${i === imageIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
                        aria-label={`Imagen ${i + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
              <button
                onClick={handleFavoriteClick}
                className="absolute right-3 top-3 rounded-full bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm p-2.5 shadow-lg border border-white/40 dark:border-gray-700/60"
                aria-label={isLiked ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              >
                <Heart
                  className={`h-5 w-5 ${
                    isLiked ? 'fill-red-500/90 text-red-500/90' : 'text-gray-500/90 dark:text-gray-400/90'
                  }`}
                />
              </button>
              <button
                onClick={onClose}
                className="absolute left-3 top-3 rounded-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-2.5 shadow-lg border border-gray-200/80 dark:border-gray-700"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </button>
            </div>

            <div className="p-4 pt-3 md:p-8 md:pt-7 md:pb-12 pb-10 space-y-5 md:space-y-7 min-h-[min(60vh,600px)]">
              {/* Orden fijo en columna: marca → título → cazado por → precios (evita título roto y solapamientos en desktop) */}
              <div className="flex flex-col gap-3 md:gap-4">
                <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                  {brand}
                </p>
                <h2 className="text-xl md:text-3xl lg:text-4xl font-semibold text-gray-900 dark:text-gray-100 leading-tight tracking-tight break-words">
                  {title}
                </h2>
                {author?.username && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {authorProfileHref ? (
                      <Link
                        href={authorProfileHref}
                        className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                      >
                        {author.avatar_url ? (
                          <img src={author.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                        ) : (
                          <User className="h-4 w-4 shrink-0" />
                        )}
                        <span>Cazado por {author.username}</span>
                      </Link>
                    ) : (
                      <span className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        {author.avatar_url ? (
                          <img src={author.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                        ) : (
                          <User className="h-4 w-4 shrink-0" />
                        )}
                        <span>Cazado por {author.username}</span>
                      </span>
                    )}
                    {author.leaderBadge === 'cazador_estrella' && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400" title="Cazador reconocido por la comunidad">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        Cazador estrella
                      </span>
                    )}
                    {author.leaderBadge === 'cazador_aventa' && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400" title="Cazador destacado">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        Cazador Aventa
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-baseline gap-3 pt-1">
                  <span className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#111827] dark:text-gray-100 tracking-tight">
                    {formatPriceMXN(discountPrice)}
                  </span>
                  {originalPrice > 0 && (
                    <>
                      <span className="text-lg md:text-xl text-[#6B7280] dark:text-gray-400 line-through">
                        {formatPriceMXN(originalPrice)}
                      </span>
                      {discount > 0 && (
                        <span className="text-sm font-semibold px-2 py-0.5 rounded-md bg-red-500/15 text-red-600 dark:text-red-400">
                          -{discount}%
                        </span>
                      )}
                    </>
                  )}
                </div>
                {originalPrice > 0 && savings > 0 && (
                  <p className="text-sm text-[#6B7280] dark:text-gray-400 -mt-1">
                    Ahorras {formatPriceMXN(savings)}
                  </p>
                )}
                {(msiMonths != null && msiMonths >= 1) || bankCouponLabel ? (
                  <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {msiMonths != null && msiMonths >= 1 ? (
                      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        {msiMonths} MSI: {formatPriceMXN(discountPrice / msiMonths)}/mes
                      </p>
                    ) : null}
                    {bankCouponLabel ? (
                      <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">de cupón</span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {description?.trim() && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Descripción</p>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{description.trim()}</p>
                </div>
              )}

              {(steps?.trim() || conditions?.trim() || (coupons?.trim() && !showCtaCouponChip)) && (
                <div className="rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/50 p-4 md:p-5 space-y-5">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600 pb-2">
                    Información adicional
                  </p>
                  {steps?.trim() && (() => {
                    let stepItems: string[] = [];
                    try {
                      const parsed = JSON.parse(steps.trim());
                      if (Array.isArray(parsed)) stepItems = parsed.filter((s: unknown) => typeof s === 'string' && s.trim());
                    } catch {
                      stepItems = steps.trim().split(/\n+/).map((s) => s.trim()).filter(Boolean);
                    }
                    if (stepItems.length === 0) return null;
                    return (
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Pasos para aprovechar la oferta</p>
                        <ol className="space-y-2">
                          {stepItems.map((text, i) => (
                            <li key={i} className="flex gap-3">
                              <span className="shrink-0 w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs font-semibold flex items-center justify-center">
                                {i + 1}
                              </span>
                              <span className="text-sm text-gray-700 dark:text-gray-300 pt-0.5">{text}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    );
                  })()}
                  {conditions?.trim() && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Condiciones</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{conditions.trim()}</p>
                    </div>
                  )}
                  {coupons?.trim() && !showCtaCouponChip && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cupón o código</p>
                      <p className="text-sm font-mono font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-3 py-2 rounded-lg inline-block">
                        {coupons.trim()}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3 rounded-2xl border border-purple-100 dark:border-purple-800/30 bg-purple-50/50 dark:bg-purple-900/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0">
                  ¿Esta oferta te parece útil?
                </p>
                <div className="flex items-center justify-center gap-2 text-gray-900 dark:text-gray-100">
                  <button
                    type="button"
                    onClick={() => handleVote('up')}
                    aria-label="Votar positivo"
                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-white/80 dark:hover:bg-gray-800/80 active:scale-95 ${
                      userVote === 1
                        ? 'bg-purple-200 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                        : 'bg-white/70 dark:bg-gray-800/70 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <ThumbsUp className={`h-5 w-5 ${userVote === 1 ? 'fill-purple-600 text-purple-600 dark:fill-purple-400 dark:text-purple-400' : ''}`} />
                  </button>
                  <span className="min-w-[2.25rem] text-center text-lg font-semibold tabular-nums">{localWeightedScore}</span>
                  <button
                    type="button"
                    onClick={() => handleVote('down')}
                    aria-label="Votar negativo"
                    className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-white/80 dark:hover:bg-gray-800/80 active:scale-95 ${
                      userVote === -1
                        ? 'bg-pink-200 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400'
                        : 'bg-white/70 dark:bg-gray-800/70 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <ThumbsDown className={`h-5 w-5 ${userVote === -1 ? 'fill-pink-600 text-pink-600 dark:fill-pink-400 dark:text-pink-400' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setActiveTab('comments')}
                    className={`px-4 py-2 font-semibold transition-colors duration-200 ease-out border-b-2 ${
                      activeTab === 'comments'
                        ? 'border-purple-600 dark:border-purple-400 text-purple-600 dark:text-purple-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Comentarios ({comments.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('reviews')}
                    className={`px-4 py-2 font-semibold transition-colors duration-200 ease-out border-b-2 flex items-center gap-2 ${
                      activeTab === 'reviews'
                        ? 'border-purple-600 dark:border-purple-400 text-purple-600 dark:text-purple-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Reseñas
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                      Próximamente
                    </span>
                  </button>
                </div>

                {activeTab === 'comments' ? (
                  <div className="space-y-4">
                    <div className="space-y-4">
                      {commentsLoading ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Cargando comentarios…</p>
                      ) : comments.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                          Nadie ha comentado. ¡Sé el primero!
                        </p>
                      ) : (
                        comments.map((comment) => {
                          const isOwn = !!session?.user?.id && comment.user_id === session.user.id;
                          return (
                          <div key={comment.id} className="space-y-2">
                            <div className={`rounded-xl border p-4 ${
                              isOwn
                                ? 'border-violet-300 dark:border-violet-600 bg-violet-50/60 dark:bg-violet-900/20'
                                : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                            }`}>
                              <div className="mb-2 flex items-center gap-2">
                                <p className={`text-sm font-medium ${isOwn ? 'text-violet-700 dark:text-violet-300' : 'text-gray-900 dark:text-gray-100'}`}>
                                  {comment.author.username}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatRelativeDate(comment.created_at)}
                                </p>
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
                                  className={`flex items-center gap-1 text-xs font-medium transition-colors ${comment.liked_by_me ? 'text-pink-500' : 'text-gray-500 dark:text-gray-400 hover:text-pink-500'}`}
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
                                {session && !isOwn && (
                                  <button
                                    type="button"
                                    onClick={() => handleReportComment(comment.id)}
                                    className="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1"
                                  >
                                    <Flag className="h-3.5 w-3.5" />
                                    Reportar
                                  </button>
                                )}
                              </div>
                            </div>
                            {(comment.replies?.length ?? 0) > 0 && (
                              <div className="pl-4 md:pl-6 space-y-2 border-l-2 border-gray-200 dark:border-gray-700 ml-2">
                                {comment.replies?.map((reply) => {
                                  const isOwnReply = !!session?.user?.id && reply.user_id === session.user.id;
                                  return (
                                  <div key={reply.id} className={`rounded-lg border p-3 ${
                                    isOwnReply
                                      ? 'border-violet-300 dark:border-violet-600 bg-violet-50/50 dark:bg-violet-900/15'
                                      : 'border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80'
                                  }`}>
                                    <div className="mb-1 flex items-center gap-2">
                                      <p className={`text-sm font-medium ${isOwnReply ? 'text-violet-700 dark:text-violet-300' : 'text-gray-900 dark:text-gray-100'}`}>{reply.author.username}</p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatRelativeDate(reply.created_at)}</p>
                                    </div>
                                    <p className="text-gray-700 dark:text-gray-300 text-sm">{reply.content}</p>
                                    <div className="mt-2 flex items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => session && handleLikeComment(reply.id)}
                                        disabled={!session || likingId === reply.id}
                                        className={`flex items-center gap-1 text-xs font-medium transition-colors ${reply.liked_by_me ? 'text-pink-500' : 'text-gray-500 dark:text-gray-400 hover:text-pink-500'}`}
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
                                      {session && !isOwnReply && (
                                        <button
                                          type="button"
                                          onClick={() => handleReportComment(reply.id)}
                                          className="text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1"
                                        >
                                          <Flag className="h-3.5 w-3.5" />
                                          Reportar
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                                })}
                              </div>
                            )}
                          </div>
                        );
                        })
                      )}
                    </div>

                    {offerId && (
                      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                        {replyingToId && (() => {
                          const replyingTo = comments.flatMap((c) => [c, ...(c.replies ?? [])]).find((x) => x.id === replyingToId);
                          return replyingTo ? (
                            <p className="text-sm text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded-lg px-3 py-2">
                              Respondiendo a <span className="font-semibold">{replyingTo.author.username}</span>: &quot;{replyingTo.content.slice(0, 60)}{replyingTo.content.length > 60 ? '…' : ''}&quot;
                            </p>
                          ) : (
                            <p className="text-xs text-purple-600 dark:text-purple-400">Respondiendo a un comentario — escribe abajo y envía.</p>
                          );
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
                        <div className="flex items-center gap-2">
                          {replyingToId && (
                            <button
                              type="button"
                              onClick={() => { setReplyingToId(null); setCommentText(''); }}
                              className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
                            >
                              Cancelar respuesta
                            </button>
                          )}
                          <button
                            onClick={handleSubmitComment}
                            disabled={!commentText.trim() || commentSubmitting || !session}
                            className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 dark:from-purple-600 dark:to-pink-500 px-4 py-2 font-semibold text-white text-sm transition-all duration-200 ease-out hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {commentSubmitting ? 'Enviando…' : replyingToId ? 'Responder' : 'Comentar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/80 dark:bg-amber-900/20 p-6 text-center">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">Reseñas próximamente</p>
                      <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                        La comunidad podrá dejar reseñas verificadas con foto o video. Estamos construyendo esta función.
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => { openLuna(); onClose(); }}
                    className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                  >
                    <MessageCircle className="h-4 w-4 shrink-0" />
                    <span>Preguntar a Luna sobre esta oferta</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                      Próximamente
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 md:px-5 md:py-2 flex-shrink-0">
            <div className="flex flex-wrap items-stretch gap-2 md:gap-3">
              <button
                onClick={handleOutboundClick}
                disabled={!offerUrl?.trim()}
                className="flex-1 min-w-[min(100%,10rem)] rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 px-4 py-2.5 md:px-4 md:py-2 font-semibold text-white shadow-lg transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 uppercase tracking-wide text-sm md:text-sm"
              >
                <span>CAZAR OFERTA</span>
                <ExternalLink className="h-4 w-4 md:h-4 md:w-4 shrink-0" />
              </button>
              {showCtaCouponChip ? (
                <div
                  className="flex min-w-0 max-w-full flex-1 basis-[min(100%,12rem)] items-center justify-center rounded-xl border-2 border-dashed border-white/90 bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 px-3 py-2.5 text-center text-xs md:text-sm font-semibold text-white shadow-sm"
                  role="note"
                  aria-label="Cupón de la oferta"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    {bankCouponDisplay ? (
                      <span className="leading-snug">
                        <span className="text-white/90">Cupón bancario </span>
                        <span className="font-bold tracking-wide">{bankCouponDisplay}</span>
                      </span>
                    ) : null}
                    {personalCouponTrim ? (
                      <span className="font-mono text-[11px] md:text-xs font-semibold break-all text-white">{personalCouponTrim}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {offerId && (
                <button
                  onClick={() => {
                    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}${buildOfferPublicPath(offerId!, title)}`;
                    navigator.clipboard.writeText(url).then(() => {
                      setShareCopied(true);
                      setTimeout(() => setShareCopied(false), 2000);
                      showToast?.('Enlace copiado');
                    }).catch(() => window.open(url, '_blank'));
                    fetch('/api/events', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
                      body: JSON.stringify({ offer_id: offerId, event_type: 'share' }),
                    }).catch((err) => logClientError('offer-modal:share-event', err));
                  }}
                  className="flex-shrink-0 self-center p-2.5 md:p-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/80 text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:border-violet-200 dark:hover:border-violet-800 hover:bg-violet-50/50 dark:hover:bg-violet-900/20 transition-all duration-200"
                  title={shareCopied ? '¡Copiado!' : 'Compartir'}
                  aria-label="Compartir oferta"
                >
                  <Share2 className="h-4 w-4 md:h-4 md:w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="px-5 md:px-6 py-4 md:py-2 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 flex items-center justify-end gap-4">
            {offerId && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowReportModal(true); }}
                className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
              >
                <Flag className="h-4 w-4" />
                <span>Reportar</span>
              </button>
            )}
          </div>

          {typeof document !== 'undefined' &&
            createPortal(
              <AnimatePresence>
                {showReportModal && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50"
                    onClick={() => setShowReportModal(false)}
                  >
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-xl p-6"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Reportar oferta</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        ¿Qué problema tiene esta oferta?
                      </p>
                      <div className="space-y-3 mb-4">
                        {REPORT_OPTIONS.map((opt) => (
                          <label key={opt.value} className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50">
                            <input
                              type="radio"
                              name="reportType"
                              value={opt.value}
                              checked={reportType === opt.value}
                              onChange={() => setReportType(opt.value)}
                              className="rounded-full border-gray-300 text-amber-500 focus:ring-amber-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                      <textarea
                        value={reportComment}
                        onChange={(e) => setReportComment(e.target.value)}
                        placeholder="Describe el problema (mín. 100 caracteres, máx. 500)"
                        maxLength={500}
                        rows={4}
                        className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 resize-none mb-2"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                        {reportComment.trim().length}/100 caracteres mínimos
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowReportModal(false)}
                          className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSubmitReport}
                          disabled={!reportType || reportSubmitting || reportComment.trim().length < 100}
                          className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {reportSubmitting ? 'Enviando…' : 'Enviar reporte'}
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>,
              document.body
            )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
