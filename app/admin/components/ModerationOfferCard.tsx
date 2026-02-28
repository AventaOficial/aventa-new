'use client';

import { useState } from 'react';
import Link from 'next/link';
import { User, Store, Calendar, Eye, X } from 'lucide-react';

type ModerationOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  image_url: string | null;
  offer_url: string | null;
  created_at: string;
  created_by: string | null;
  risk_score?: number | null;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
};

type Props = {
  offer: ModerationOffer;
  status: 'pending' | 'approved' | 'rejected';
  onApprove?: (id: string, createdBy?: string | null) => void;
  onReject?: (id: string, reason?: string) => void;
  actingId?: string | null;
  similarTitles?: string[];
};

function slugFromUsername(name: string | null | undefined): string {
  if (!name || !name.trim()) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export default function ModerationOfferCard({
  offer,
  status,
  onApprove,
  onReject,
  actingId,
  similarTitles = [],
}: Props) {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const authorName =
    offer.profiles?.display_name?.trim() || 'Usuario';
  const authorSlug = slugFromUsername(offer.profiles?.display_name);

  const handleReject = () => {
    if (onReject && rejectReason.trim()) {
      onReject(offer.id, rejectReason.trim());
      setShowRejectInput(false);
      setRejectReason('');
    }
  };

  const canReject = rejectReason.trim().length > 0;

  return (
    <article
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
      data-testid="moderation-offer-card"
    >
      <div className="flex flex-col sm:flex-row">
        <div className="relative w-full sm:w-32 h-40 sm:h-auto sm:min-h-[120px] shrink-0 bg-gray-100 dark:bg-gray-700">
          {offer.image_url ? (
            <img
              src={offer.image_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
              Sin imagen
            </div>
          )}
          {offer.risk_score != null && offer.risk_score > 50 && (
            <span
              className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/90 text-white"
              title="Risk score alto"
            >
              Risk {offer.risk_score}
            </span>
          )}
        </div>

        <div className="flex-1 p-4 flex flex-col gap-3">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
              {offer.title}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-green-600 dark:text-green-400">
                ${Number(offer.price).toLocaleString('es-MX')}
              </span>
              {offer.original_price != null && (
                <span className="line-through">
                  ${Number(offer.original_price).toLocaleString('es-MX')}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Store className="h-3.5 w-3.5" />
                {offer.store ?? '—'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(offer.created_at).toLocaleString('es-MX', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
              <User className="h-3.5 w-3.5" />
              {authorSlug ? (
                <Link
                  href={`/u/${authorSlug}`}
                  className="text-purple-600 dark:text-purple-400 hover:underline"
                >
                  {authorName}
                </Link>
              ) : (
                <span>{authorName}</span>
              )}
            </div>
          </div>

          {similarTitles.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">Ofertas similares</p>
              <ul className="mt-1 list-disc list-inside text-amber-700 dark:text-amber-300">
                {similarTitles.slice(0, 3).map((t, i) => (
                  <li key={i} className="truncate">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              title="Ver la oferta tal como la subió el usuario"
            >
              <Eye className="h-4 w-4" />
              Ver oferta
            </button>
            {status === 'pending' && onApprove && onReject && (
              <>
                <button
                  type="button"
                  onClick={() => onApprove(offer.id, offer.created_by)}
                  disabled={actingId === offer.id}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="La oferta se publicará y verán los usuarios"
                >
                  ✓ Aprobar (publicar)
                </button>
                {!showRejectInput ? (
                  <button
                    type="button"
                    onClick={() => setShowRejectInput(true)}
                    disabled={actingId === offer.id}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="La oferta no se publicará"
                  >
                    ✗ Rechazar
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Motivo (obligatorio)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleReject();
                        if (e.key === 'Escape') {
                          setShowRejectInput(false);
                          setRejectReason('');
                        }
                      }}
                      className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-[180px]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={actingId === offer.id || !canReject}
                      className="px-3 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowRejectInput(false);
                        setRejectReason('');
                      }}
                      className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="relative max-w-lg w-full max-h-[90vh] overflow-auto rounded-xl bg-white dark:bg-gray-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="absolute right-3 top-3 rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="p-4">
              {offer.image_url ? (
                <img
                  src={offer.image_url}
                  alt=""
                  className="w-full h-48 object-contain bg-gray-100 dark:bg-gray-700 rounded-lg"
                />
              ) : (
                <div className="w-full h-48 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-400">
                  Sin imagen
                </div>
              )}
              <h3 className="mt-4 font-semibold text-lg text-gray-900 dark:text-gray-100">
                {offer.title}
              </h3>
              <div className="mt-2 flex gap-4 text-sm">
                <span className="font-medium text-green-600 dark:text-green-400">
                  ${Number(offer.price).toLocaleString('es-MX')}
                </span>
                {offer.original_price != null && (
                  <span className="line-through text-gray-500">
                    ${Number(offer.original_price).toLocaleString('es-MX')}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Store className="h-4 w-4" />
                  {offer.store ?? '—'}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Por {authorName} • {new Date(offer.created_at).toLocaleString('es-MX')}
              </p>
              {offer.offer_url && (
                <p className="mt-2 text-xs text-gray-400 truncate" title={offer.offer_url}>
                  URL: {offer.offer_url}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
