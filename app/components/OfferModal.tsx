'use client';

import { X, Heart, ThumbsUp, ThumbsDown, ExternalLink, Star, Image as ImageIcon, AlertCircle, User, MessageCircle, Share2, Flag } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useUI } from '@/app/providers/UIProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { formatPriceMXN } from '@/lib/formatPrice';
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
  offerId?: string;
  author?: { username: string; avatar_url?: string | null };
  image?: string;
  isLiked?: boolean;
  onFavoriteChange?: (isFavorite: boolean) => void;
  userVote?: 1 | -1 | 0 | null;
}

type CommentItem = {
  id: string;
  content: string;
  created_at: string;
  author: { username: string };
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

function slugFromUsername(name: string | null | undefined): string {
  if (!name || !name.trim()) return '';
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// Mock de reseñas
const mockReviews = [
  {
    id: 1,
    user: 'Juan P.',
    avatar: null,
    rating: 5,
    text: 'Producto excelente, superó mis expectativas. La oferta fue real y el envío rápido.',
    time: 'Hace 3 días',
    hasPhoto: true,
  },
  {
    id: 2,
    user: 'Laura M.',
    avatar: null,
    rating: 4.5,
    text: 'Muy buena calidad, solo que el color es un poco diferente a la foto.',
    time: 'Hace 1 semana',
    hasPhoto: true,
  },
  {
    id: 3,
    user: 'Roberto S.',
    avatar: null,
    rating: 3.5,
    text: 'Está bien, pero esperaba más por el precio. La oferta fue real al menos.',
    time: 'Hace 2 semanas',
    hasPhoto: false,
  },
];

// Componente de estrellas
function StarRating({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
  
  const starSize = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';

  return (
    <div className="flex items-center gap-0.5">
      {[...Array(fullStars)].map((_, i) => (
        <Star key={`full-${i}`} className={`${starSize} fill-yellow-400 text-yellow-400`} />
      ))}
      {hasHalfStar && (
        <div className="relative">
          <Star className={`${starSize} text-gray-300`} />
          <Star className={`${starSize} fill-yellow-400 text-yellow-400 absolute left-0 top-0 overflow-hidden`} style={{ width: '50%' }} />
        </div>
      )}
      {[...Array(emptyStars)].map((_, i) => (
        <Star key={`empty-${i}`} className={`${starSize} text-gray-300`} />
      ))}
    </div>
  );
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
  offerId,
  author,
  image,
  isLiked: isLikedProp = false,
  onFavoriteChange,
  userVote: userVoteProp = 0,
}: OfferModalProps) {
  const router = useRouter();
  const { setOfferOpen, openLuna, showToast } = useUI();
  const { session } = useAuth();
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
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [reviewHasMedia, setReviewHasMedia] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState<string>('');
  const [reportComment, setReportComment] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const hasTrackedRef = useRef(false);
  const outboundSentRef = useRef(false);

  const savings = originalPrice - discountPrice;
  
  // Calcular promedio de reseñas
  const averageRating = mockReviews.reduce((acc, review) => acc + review.rating, 0) / mockReviews.length;

  // Bloquear scroll de la página cuando el modal está abierto (solo scroll del modal)
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

  // Ocultar navbar inferior cuando el detalle de oferta está abierto
  useEffect(() => {
    setOfferOpen(isOpen);
    if (!isOpen) outboundSentRef.current = false;
    return () => setOfferOpen(false);
  }, [isOpen, setOfferOpen]);

  // Registrar view al abrir el modal (una vez por apertura; resiste Strict Mode)
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
    }).catch(() => {});
  }, [isOpen, offerId]);

  useEffect(() => {
    if (isOpen && offerId) {
      setLocalUpvotes(upvotes);
      setLocalDownvotes(downvotes);
    }
  }, [isOpen, offerId, upvotes, downvotes]);

  // Cargar comentarios al abrir el modal
  useEffect(() => {
    if (!isOpen || !offerId) {
      setComments([]);
      return;
    }
    setCommentsLoading(true);
    fetch(`/api/offers/${encodeURIComponent(offerId)}/comments`)
      .then((res) => (res.ok ? res.json() : { comments: [] }))
      .then((data) => setComments(Array.isArray(data.comments) ? data.comments : []))
      .catch(() => setComments([]))
      .finally(() => setCommentsLoading(false));
  }, [isOpen, offerId]);

  const handleVote = (vote: 'up' | 'down') => {
    if (!offerId || !session?.access_token) return;
    const value = vote === 'up' ? 1 : -1;
    const prevVote = userVote;
    const prevUp = localUpvotes;
    const prevDown = localDownvotes;

    if (prevVote === value) {
      setLocalVote(0);
      if (vote === 'up') setLocalUpvotes((p) => p - 1);
      else setLocalDownvotes((p) => p - 1);
    } else {
      if (prevVote === 1) setLocalUpvotes((p) => p - 1);
      if (prevVote === -1) setLocalDownvotes((p) => p - 1);
      setLocalVote(value);
      if (vote === 'up') setLocalUpvotes((p) => p + 1);
      else setLocalDownvotes((p) => p + 1);
    }

    fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ offerId, value }),
    })
      .then((res) => { if (!res.ok) throw new Error(); })
      .catch(() => {
        setLocalVote(prevVote);
        setLocalUpvotes(prevUp);
        setLocalDownvotes(prevDown);
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
      if (offerId) {
        fetch('/api/track-outbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ offerId }),
        }).catch(() => {});
      }
      if (offerUrl?.trim()) {
        window.open(offerUrl.trim(), '_blank', 'noopener,noreferrer');
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
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setComments((prev) => [...prev, newComment]);
        setCommentText('');
      }
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleSubmitReview = () => {
    if (reviewRating > 0 && reviewText.trim() && reviewHasMedia) {
      setReviewRating(0);
      setReviewText('');
      setReviewHasMedia(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!reportType || !offerId || reportSubmitting) return;
    if (!session?.access_token) {
      showToast?.('Inicia sesión para reportar');
      return;
    }
    setReportSubmitting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ offerId, reportType, comment: reportComment.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        showToast?.('Reporte enviado. Gracias por ayudar.');
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
        {/* Overlay con blur */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        
        {/* Modal */}
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="relative z-10 w-full max-w-2xl md:max-w-5xl lg:max-w-6xl max-h-[90vh] md:max-h-[85vh] overflow-hidden rounded-3xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col overscroll-contain touch-pan-y"
          onClick={(e) => e.stopPropagation()}
          style={{ overflowX: 'hidden' }}
        >
          {/* Imagen — más grande, protagonista */}
          <div className="relative flex-shrink-0 h-48 md:h-64 lg:h-72 bg-[#F5F5F7] dark:bg-[#1d1d1f] flex items-center justify-center">
            {image ? (
              <img src={image} alt="" className="w-full h-full object-contain p-4" />
            ) : (
              <img src="/placeholder.png" alt="" className="w-full h-full object-contain opacity-50 p-8" />
            )}
            <button
              onClick={handleFavoriteClick}
              className="absolute right-3 top-3 rounded-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-2.5 shadow-lg border border-gray-200/80 dark:border-gray-700 transition-all duration-200 hover:scale-105 active:scale-95"
              aria-label={isLiked ? 'Quitar de favoritos' : 'Agregar a favoritos'}
            >
              <Heart
                className={`h-5 w-5 ${
                  isLiked ? 'fill-[#EF4444] text-[#EF4444]' : 'text-gray-500 dark:text-gray-400'
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

          {/* Contenido scrollable — estructura mejorada */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain min-w-0 flex flex-col">
            <div className="p-5 md:p-8 space-y-6 flex-1">
              {/* Header: tienda, título, autor en línea compacta */}
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                    {brand}
                  </p>
                  <h2 className="text-xl md:text-2xl lg:text-3xl font-semibold text-gray-900 dark:text-gray-100 mt-1 leading-tight tracking-tight">
                    {title}
                  </h2>
                  {author?.username && (
                    <Link
                      href={`/u/${slugFromUsername(author.username)}`}
                      className="flex items-center gap-2 mt-3 text-sm text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                    >
                      {author.avatar_url ? (
                        <img src={author.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                      <span>Cazado por {author.username}</span>
                    </Link>
                  )}
                </div>
                {/* Precio destacado a la derecha en desktop */}
                <div className="flex-shrink-0 md:text-right">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-3xl md:text-4xl font-bold text-[#111827] dark:text-gray-100 tracking-tight">
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
                  <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1">
                    Ahorras {formatPriceMXN(savings)}
                  </p>
                )}
                </div>
              </div>

              {description?.trim() && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Descripción</p>
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{description.trim()}</p>
                </div>
              )}

              {/* Información adicional: pasos, condiciones, cupones */}
              {(steps?.trim() || conditions?.trim() || coupons?.trim()) && (
                <div className="rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/50 p-4 md:p-5 space-y-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Cómo obtener la oferta</p>
                  {steps?.trim() && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Pasos</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{steps.trim()}</p>
                    </div>
                  )}
                  {conditions?.trim() && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Condiciones</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{conditions.trim()}</p>
                    </div>
                  )}
                  {coupons?.trim() && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cupón o código</p>
                      <p className="text-sm font-mono font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-3 py-2 rounded-lg inline-block">
                        {coupons.trim()}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Votos */}
              <div className="flex items-center gap-4 rounded-2xl border border-purple-100 dark:border-purple-800/30 bg-purple-50/50 dark:bg-purple-900/20 p-4">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">¿Esta oferta te parece útil?</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleVote('up')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${
                      userVote === 1
                        ? 'bg-purple-200 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-purple-100 dark:hover:bg-purple-900/20'
                    }`}
                  >
                    <ThumbsUp className={`h-5 w-5 ${userVote === 1 ? 'fill-purple-600 text-purple-600 dark:fill-purple-400 dark:text-purple-400' : ''}`} />
                    <span className="font-semibold">{localUpvotes}</span>
                  </button>
                  <button
                    onClick={() => handleVote('down')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${
                      userVote === -1
                        ? 'bg-pink-200 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-pink-100 dark:hover:bg-pink-900/20'
                    }`}
                  >
                    <ThumbsDown className={`h-5 w-5 ${userVote === -1 ? 'fill-pink-600 text-pink-600 dark:fill-pink-400 dark:text-pink-400' : ''}`} />
                    <span className="font-semibold">{localDownvotes}</span>
                  </button>
                </div>
              </div>

              {/* Tabs: Comentarios / Reseñas */}
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

                {/* Contenido de tabs */}
                {activeTab === 'comments' ? (
                  <div className="space-y-4">
                    <div className="space-y-4">
                      {commentsLoading ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Cargando comentarios…</p>
                      ) : (
                        comments.map((comment) => (
                          <div key={comment.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
                            <div className="mb-2 flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                @{comment.author.username}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {formatRelativeDate(comment.created_at)}
                              </p>
                            </div>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">{comment.content}</p>
                          </div>
                        ))
                      )}
                    </div>

                    {offerId && (
                      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                        <textarea
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder={session ? 'Escribe un comentario (máx. 280 caracteres)...' : 'Inicia sesión para comentar.'}
                          maxLength={280}
                          disabled={!session}
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-purple-500 focus:outline-none resize-none disabled:opacity-60"
                          rows={2}
                        />
                        <button
                          onClick={handleSubmitComment}
                          disabled={!commentText.trim() || commentSubmitting || !session}
                          className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 dark:from-purple-600 dark:to-pink-500 px-4 py-2 font-semibold text-white text-sm transition-all duration-200 ease-out hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {commentSubmitting ? 'Enviando…' : 'Comentar'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Próximamente - reseñas en desarrollo */}
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/80 dark:bg-amber-900/20 p-6 text-center">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">Reseñas próximamente</p>
                      <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                        La comunidad podrá dejar reseñas verificadas. Estamos construyendo esta función.
                      </p>
                    </div>
                    {/* Placeholder oculto - mantener estructura por si se activa después */}
                    <div className="hidden">
                    {/* Promedio de reseñas */}
                    <div className="rounded-xl border border-purple-100 dark:border-purple-800/30 bg-purple-50/50 dark:bg-purple-900/20 p-4">
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-4xl font-bold text-gray-900 dark:text-gray-100">{averageRating.toFixed(1)}</div>
                          <StarRating rating={averageRating} size="lg" />
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{mockReviews.length} reseñas</p>
                        </div>
                      </div>
                    </div>

                    {/* Lista de reseñas */}
                    <div className="space-y-4">
                      {mockReviews.map((review) => (
                        <div key={review.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 dark:from-purple-400 dark:to-pink-400 transition-all duration-600 ease-[0.16,1,0.3,1]" />
                              <div>
                                <p className="font-semibold text-gray-900 dark:text-gray-100">{review.user}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{review.time}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <StarRating rating={review.rating} size="sm" />
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{review.rating}</span>
                            </div>
                          </div>
                          <p className="text-gray-700 dark:text-gray-300 mb-2">{review.text}</p>
                          {review.hasPhoto && (
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                              <ImageIcon className="h-4 w-4" />
                              <span>Incluye foto</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Formulario para dejar reseña */}
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                        <AlertCircle className="h-4 w-4" />
                        <span className="font-semibold">Sé respetuoso. Las reseñas ofensivas serán eliminadas.</span>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Calificación *
                        </label>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              onClick={() => setReviewRating(star)}
                              className="transition-transform duration-200 ease-out hover:scale-110"
                            >
                              <Star
                                className={`h-8 w-8 ${
                                  star <= reviewRating
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-gray-300'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Reseña *
                        </label>
                        <textarea
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value)}
                          placeholder="Comparte tu experiencia..."
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-purple-500 focus:outline-none resize-none"
                          rows={4}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Foto o video * (obligatorio)
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setReviewHasMedia(true)}
                            className={`flex-1 rounded-lg border-2 px-4 py-3 transition-colors duration-200 ease-out ${
                              reviewHasMedia
                                ? 'border-purple-500 dark:border-purple-400 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:border-purple-300 dark:hover:border-purple-500'
                            }`}
                          >
                            <div className="flex items-center justify-center gap-2">
                              <ImageIcon className="h-5 w-5" />
                              <span>Agregar foto/video</span>
                            </div>
                          </button>
                        </div>
                        {reviewHasMedia && (
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">✓ Media adjuntado</p>
                        )}
                      </div>

                      <button
                        onClick={handleSubmitReview}
                        disabled={reviewRating === 0 || !reviewText.trim() || !reviewHasMedia}
                        className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 dark:from-purple-600 dark:to-pink-500 px-4 py-2.5 font-semibold text-white transition-transform duration-200 ease-out hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Publicar reseña
                      </button>
                    </div>
                    </div>
                  </div>
                )}

                {/* Preguntar a Luna - debajo de comentarios */}
                <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={(e) => { e.stopPropagation(); openLuna(); }}
                    className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>Preguntar a Luna sobre esta oferta</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Acciones fijas: CAZAR OFERTA + Share al lado */}
          <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 md:p-6 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={handleOutboundClick}
                disabled={!offerUrl?.trim()}
                className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 px-6 py-4 font-semibold text-white shadow-lg transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 uppercase tracking-wide"
              >
                <span>CAZAR OFERTA</span>
                <ExternalLink className="h-5 w-5" />
              </button>
              {offerId && (
                <button
                  onClick={() => {
                    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/?o=${offerId}`;
                    navigator.clipboard.writeText(url).then(() => {
                      setShareCopied(true);
                      setTimeout(() => setShareCopied(false), 2000);
                      showToast?.('Enlace copiado');
                    }).catch(() => window.open(url, '_blank'));
                    fetch('/api/events', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
                      body: JSON.stringify({ offer_id: offerId, event_type: 'share' }),
                    }).catch(() => {});
                  }}
                  className="flex-shrink-0 p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/80 text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:border-violet-200 dark:hover:border-violet-800 hover:bg-violet-50/50 dark:hover:bg-violet-900/20 transition-all duration-200"
                  title={shareCopied ? '¡Copiado!' : 'Compartir'}
                  aria-label="Compartir oferta"
                >
                  <Share2 className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* Plus al final: Reportar */}
          <div className="px-5 md:px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 flex items-center justify-end gap-4">
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

          {/* Modal de reporte (portal para evitar overflow) */}
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
                        placeholder="Comentario opcional (máx. 500 caracteres)"
                        maxLength={500}
                        rows={2}
                        className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 resize-none mb-4"
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowReportModal(false)}
                          className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSubmitReport}
                          disabled={!reportType || reportSubmitting}
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
