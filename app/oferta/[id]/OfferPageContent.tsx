'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  User,
  BadgeCheck,
  Heart,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  MessageCircle,
  Flag,
  Share2,
} from 'lucide-react';
import { formatPriceMXN } from '@/lib/formatPrice';
import { buildOfferUrl } from '@/lib/offerUrl';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';
import ClientLayout from '@/app/ClientLayout';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchBatchUserData, type VoteMap, type FavoriteMap } from '@/lib/offers/batchUserData';

function slugFromUsername(name: string | null | undefined): string {
  if (!name || !name.trim()) return '';
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
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
  author: { username: string };
  user_id?: string | null;
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
  upvotes: number;
  downvotes: number;
  votes: { up: number; down: number; score: number };
  author: { username: string; avatar_url?: string | null; leaderBadge?: string | null; creatorMlTag?: string | null };
  createdAt: string | null;
  categorySlug?: string;
  categoryLabel?: string;
  storeSlug?: string;
  storeName?: string;
};

export default function OfferPageContent({ offer }: { offer: OfferPayload }) {
  const { session } = useAuth();
  const { showToast } = useUI();

  const [voteMap, setVoteMap] = useState<VoteMap>({});
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({});
  const [localVote, setLocalVote] = useState<1 | -1 | 0 | null>(null);
  const [localUp, setLocalUp] = useState(offer.upvotes);
  const [localDown, setLocalDown] = useState(offer.downvotes);
  const [isLiked, setIsLiked] = useState(false);

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState('');
  const [reportComment, setReportComment] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
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

  const userVote = localVote ?? 0;
  const displayUp = localVote === 1 ? localUp : offer.upvotes;
  const displayDown = localVote === -1 ? localDown : offer.downvotes;
  const savings = offer.originalPrice - offer.discountPrice;
  const allImages = (offer.imageUrls?.length ? offer.imageUrls : offer.image ? [offer.image] : []) as string[];
  const currentImage = allImages[0] || offer.image || '/placeholder.png';

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
    if (!session?.user?.id) return;
    fetchBatchUserData(session.user.id, [offer.id]).then(({ voteMap: vm, favoriteMap: fm }) => {
      setVoteMap(vm);
      setFavoriteMap(fm);
      setIsLiked(!!fm[offer.id]);
      const v = vm[offer.id];
      if (v === 1 || v === -1) setLocalVote(v);
    });
  }, [session?.user?.id, offer.id]);

  const handleVote = async (value: 1 | -1) => {
    if (!session) return;
    const newVote = userVote === value ? 0 : value;
    const prevUp = localUp;
    const prevDown = localDown;
    setLocalVote(newVote);
    setLocalUp((u) => u + (newVote === 1 ? 1 : userVote === 1 ? -1 : 0));
    setLocalDown((d) => d + (newVote === -1 ? 1 : userVote === -1 ? -1 : 0));

    // API acepta 2 (up) o -1 (down). Para quitar voto enviamos el valor actual y la API borra la fila.
    const apiValue = newVote === 1 ? 2 : newVote === -1 ? -1 : (userVote === 1 ? 2 : -1);

    const res = await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ offerId: offer.id, value: apiValue }),
    });
    if (!res.ok) {
      setLocalVote(userVote);
      setLocalUp(prevUp);
      setLocalDown(prevDown);
      showToast?.('No se pudo registrar el voto. Revisa tu conexión.');
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
      const { error } = await supabase.from('offer_favorites').delete().eq('offer_id', offer.id);
      if (error) setIsLiked(true);
    } else {
      const { error } = await supabase.from('offer_favorites').insert({
        user_id: session.user.id,
        offer_id: offer.id,
      });
      if (error) setIsLiked(false);
    }
  };

  const ctaUrl = buildOfferUrl(offer.offerUrl, offer.author.creatorMlTag);

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

        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <div className="relative md:w-[45%] aspect-square md:aspect-auto md:min-h-[400px] bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-4 overflow-hidden">
              <Image
                src={currentImage}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 45vw"
                className="object-contain p-4"
                priority
                unoptimized={currentImage.startsWith('/')}
              />
              <button
                type="button"
                onClick={handleFavoriteClick}
                className="absolute right-3 top-3 rounded-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm p-2.5 shadow border border-gray-200 dark:border-gray-700"
                aria-label={isLiked ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              >
                <Heart className={`h-5 w-5 ${isLiked ? 'fill-red-500 text-red-500' : 'text-gray-500 dark:text-gray-400'}`} />
              </button>
            </div>
            <div className="p-6 md:p-8 flex-1">
              <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                {offer.brand}
              </p>
              <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-gray-100 mt-1 leading-tight">
                {offer.title}
              </h1>
              {offer.author?.username && (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Link
                    href={`/u/${slugFromUsername(offer.author.username)}`}
                    className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400"
                  >
                    {offer.author.avatar_url ? (
                      <img src={offer.author.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                    <span>Cazado por {offer.author.username}</span>
                  </Link>
                  {offer.author.leaderBadge === 'cazador_estrella' && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400" title="Cazador reconocido por la comunidad">
                      <BadgeCheck className="h-3.5 w-3.5" /> Cazador estrella
                    </span>
                  )}
                  {offer.author.leaderBadge === 'cazador_aventa' && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400" title="Cazador destacado">
                      <BadgeCheck className="h-3.5 w-3.5" /> Cazador Aventa
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-baseline gap-3 mt-4">
                <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {formatPriceMXN(offer.discountPrice)}
                </span>
                {offer.originalPrice > 0 && (
                  <>
                    <span className="text-lg text-gray-500 dark:text-gray-400 line-through">
                      {formatPriceMXN(offer.originalPrice)}
                    </span>
                    {offer.discount > 0 && (
                      <span className="text-sm font-semibold px-2 py-0.5 rounded-md bg-red-500/15 text-red-600 dark:text-red-400">
                        -{offer.discount}%
                      </span>
                    )}
                  </>
                )}
              </div>
              {offer.originalPrice > 0 && savings > 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ahorras {formatPriceMXN(savings)}</p>
              )}
              {offer.msiMonths != null && offer.msiMonths >= 1 && (
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mt-1">
                  {offer.msiMonths} MSI: {formatPriceMXN(offer.discountPrice / offer.msiMonths)}/mes
                </p>
              )}

              <div className="flex items-center gap-4 mt-6">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleVote(1)}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 transition-colors ${
                      userVote === 1
                        ? 'bg-purple-200 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-purple-100 dark:hover:bg-purple-900/20'
                    }`}
                  >
                    <ThumbsUp className={`h-5 w-5 ${userVote === 1 ? 'fill-current' : ''}`} />
                    <span className="font-semibold">{displayUp * 2}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVote(-1)}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 transition-colors ${
                      userVote === -1
                        ? 'bg-pink-200 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-pink-100 dark:hover:bg-pink-900/20'
                    }`}
                  >
                    <ThumbsDown className={`h-5 w-5 ${userVote === -1 ? 'fill-current' : ''}`} />
                    <span className="font-semibold">{displayDown}</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                {offer.categorySlug && (
                  <Link
                    href={`/categoria/${offer.categorySlug}`}
                    className="text-xs font-medium px-3 py-1.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-800/40"
                  >
                    {offer.categoryLabel ?? offer.categorySlug}
                  </Link>
                )}
                {offer.storeSlug && offer.storeName && (
                  <Link
                    href={`/tienda/${offer.storeSlug}`}
                    className="text-xs font-medium px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    {offer.storeName}
                  </Link>
                )}
              </div>

              {ctaUrl && (
                <a
                  href={ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 dark:bg-violet-500 text-white px-6 py-3 font-semibold hover:bg-violet-700 dark:hover:bg-violet-600 transition-colors"
                >
                  Ver oferta en tienda
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const url = typeof window !== 'undefined' ? `${window.location.origin}/oferta/${offer.id}` : '';
                    navigator.clipboard.writeText(url).then(() => {
                      setShareCopied(true);
                      setTimeout(() => setShareCopied(false), 2000);
                      showToast?.('Enlace copiado');
                    }).catch(() => window.open(url, '_blank'));
                    if (session?.access_token) {
                      fetch('/api/events', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                        body: JSON.stringify({ offer_id: offer.id, event_type: 'share' }),
                      }).catch(() => {});
                    }
                  }}
                  className="p-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400"
                  title={shareCopied ? '¡Copiado!' : 'Compartir'}
                  aria-label="Compartir"
                >
                  <Share2 className="h-4 w-4" />
                </button>
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

          {(offer.description?.trim() || offer.steps?.trim() || offer.conditions?.trim() || offer.coupons?.trim()) && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-6 md:p-8 space-y-6">
              {offer.description?.trim() && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Descripción</h2>
                  <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{offer.description}</p>
                </div>
              )}
              {offer.steps?.trim() && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Pasos</h2>
                  <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{offer.steps}</p>
                </div>
              )}
              {offer.conditions?.trim() && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Condiciones</h2>
                  <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{offer.conditions}</p>
                </div>
              )}
              {offer.coupons?.trim() && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Cupones</h2>
                  <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{offer.coupons}</p>
                </div>
              )}
            </div>
          )}

          {/* Inline comments */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-6 md:p-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Comentarios ({comments.length})
            </h2>
            {commentsLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Cargando comentarios…</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                Aún no hay comentarios. Sé el primero en comentar.
              </p>
            ) : (
              <div className="space-y-4 mb-6">
                {comments.map((comment) => {
                  const isOwn = !!session?.user?.id && comment.user_id === session.user.id;
                  return (
                    <div key={comment.id} className="space-y-2">
                      <div
                        className={`rounded-xl border p-4 ${
                          isOwn
                            ? 'border-violet-300 dark:border-violet-600 bg-violet-50/60 dark:bg-violet-900/20'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2">
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
                            const isOwnReply = !!session?.user?.id && reply.user_id === session.user.id;
                            return (
                              <div
                                key={reply.id}
                                className={`rounded-lg border p-3 ${
                                  isOwnReply
                                    ? 'border-violet-300 dark:border-violet-600 bg-violet-50/50 dark:bg-violet-900/15'
                                    : 'border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80'
                                }`}
                              >
                                <div className="mb-1 flex items-center gap-2">
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

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
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
            className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-xl p-6 border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="report-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Reportar oferta
            </h3>
            <p id="report-desc" className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Ayuda a la comunidad indicando qué problema tiene esta oferta. Tu descripción es obligatoria (mín. 100 caracteres).
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
