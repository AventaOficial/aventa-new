'use client';

import Link from 'next/link';
import Image from 'next/image';
import { User, BadgeCheck, Heart, ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react';
import { formatPriceMXN } from '@/lib/formatPrice';
import { buildOfferUrl } from '@/lib/offerUrl';
import { useAuth } from '@/app/providers/AuthProvider';
import ClientLayout from '@/app/ClientLayout';
import OfferModal from '@/app/components/OfferModal';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchBatchUserData, type VoteMap, type FavoriteMap } from '@/lib/offers/batchUserData';

function slugFromUsername(name: string | null | undefined): string {
  if (!name || !name.trim()) return '';
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

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
  const [showModal, setShowModal] = useState(false);
  const [voteMap, setVoteMap] = useState<VoteMap>({});
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({});
  const [localVote, setLocalVote] = useState<1 | -1 | 0 | null>(null);
  const [localUp, setLocalUp] = useState(offer.upvotes);
  const [localDown, setLocalDown] = useState(offer.downvotes);
  const [isLiked, setIsLiked] = useState(false);

  const userVote = localVote ?? 0;
  const displayUp = localVote === 1 ? localUp : offer.upvotes;
  const displayDown = localVote === -1 ? localDown : offer.downvotes;
  const savings = offer.originalPrice - offer.discountPrice;
  const allImages = (offer.imageUrls?.length ? offer.imageUrls : offer.image ? [offer.image] : []) as string[];
  const currentImage = allImages[0] || offer.image || '/placeholder.png';

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchBatchUserData(session.user.id, [offer.id]).then(({ voteMap: vm, favoriteMap: fm }) => {
      setVoteMap(vm);
      setFavoriteMap(fm);
      setIsLiked(!!fm[offer.id]);
    });
  }, [session?.user?.id, offer.id]);

  const handleVote = async (value: 1 | -1) => {
    if (!session) return;
    const newVote = userVote === value ? 0 : value;
    setLocalVote(newVote);
    setLocalUp((u) => u + (newVote === 1 ? 1 : userVote === 1 ? -1 : 0));
    setLocalDown((d) => d + (newVote === -1 ? 1 : userVote === -1 ? -1 : 0));
    const res = await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ offerId: offer.id, value: newVote }),
    });
    if (!res.ok) {
      setLocalVote(userVote);
      setLocalUp(offer.upvotes);
      setLocalDown(offer.downvotes);
    }
  };

  const ctaUrl = buildOfferUrl(offer.offerUrl, offer.author.creatorMlTag);

  return (
    <ClientLayout>
      <article className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        {/* Breadcrumb / internal links */}
        <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-6">
          <Link href="/" className="hover:text-violet-600 dark:hover:text-violet-400">
            Inicio
          </Link>
          <span aria-hidden>/</span>
          {offer.categorySlug && (
            <>
              <Link
                href={`/categoria/${offer.categorySlug}`}
                className="hover:text-violet-600 dark:hover:text-violet-400"
              >
                {offer.categoryLabel ?? offer.categorySlug}
              </Link>
              <span aria-hidden>/</span>
            </>
          )}
          {offer.storeSlug && offer.storeName && (
            <>
              <Link
                href={`/tienda/${offer.storeSlug}`}
                className="hover:text-violet-600 dark:hover:text-violet-400"
              >
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
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                      <BadgeCheck className="h-3.5 w-3.5" /> Cazador estrella
                    </span>
                  )}
                  {offer.author.leaderBadge === 'cazador_aventa' && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400">
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
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Ahorras {formatPriceMXN(savings)}
                </p>
              )}
              {offer.msiMonths != null && offer.msiMonths >= 1 && (
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mt-1">
                  {offer.msiMonths} MSI: {formatPriceMXN(offer.discountPrice / offer.msiMonths)}/mes
                </p>
              )}

              {/* Votes */}
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
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
                >
                  Ver comentarios y más detalles
                </button>
              </div>

              {/* Category & Store links */}
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

              {/* CTA */}
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
        </div>
      </article>

      {showModal && (
        <OfferModal
          isOpen={true}
          onClose={() => setShowModal(false)}
          title={offer.title}
          brand={offer.brand}
          originalPrice={offer.originalPrice}
          discountPrice={offer.discountPrice}
          discount={offer.discount}
          description={offer.description}
          steps={offer.steps}
          conditions={offer.conditions}
          coupons={offer.coupons}
          offerUrl={offer.offerUrl}
          upvotes={displayUp}
          downvotes={displayDown}
          offerId={offer.id}
          author={offer.author}
          image={offer.image}
          imageUrls={offer.imageUrls}
          msiMonths={offer.msiMonths}
          isLiked={isLiked}
          onFavoriteChange={(fav) => setIsLiked(fav)}
          onVoteChange={() => {}}
          userVote={userVote}
        />
      )}
    </ClientLayout>
  );
}
