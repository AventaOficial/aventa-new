'use client';

import { useId, useState } from 'react';
import { Check, Heart, Eye, X } from 'lucide-react';

export type WelcomeChoiceCard = {
  id: string;
  title: string;
  created_at: string;
  image_url: string | null;
  store: string | null;
  price: number | null;
  original_price: number | null;
  upvotes_count: number;
  views: number;
  eligible: true;
  dealStatus: 'approved' | 'expired';
};

type RewardsOfferSelectionProps = {
  choices: WelcomeChoiceCard[];
  confirming: boolean;
  error: string | null;
  onConfirm: (offerId: string) => void;
};

function formatMx(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function discountPct(price: number | null, original: number | null): number | null {
  if (price == null || original == null || original <= 0 || price >= original) return null;
  return Math.round(((original - price) / original) * 100);
}

/**
 * Selección de Oferta de Bienvenida (pending_selection).
 * Tocar tarjeta solo selecciona en UI; confirmar llama al backend.
 */
export default function RewardsOfferSelection({
  choices,
  confirming,
  error,
  onConfirm,
}: RewardsOfferSelectionProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const titleId = useId();

  const selected = choices.find((c) => c.id === selectedId) ?? null;

  const openConfirm = () => {
    if (!selectedId) return;
    setShowConfirm(true);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-gradient-to-b from-violet-50 to-white dark:from-violet-950/40 dark:to-[#141414] p-5 space-y-2 text-center">
        <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">
          ¡Felicidades, cazador!
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          Acabas de desbloquear una recompensa.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          Ahora elige una de tus ofertas elegibles.
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-400">
          Tu recompensa
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">Elige uno de tus hallazgos.</p>
      </div>

      {choices.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/20 p-4">
          No hay ofertas elegibles ahora. Si crees que es un error, recarga o contacta soporte.
        </p>
      ) : (
        <ul className="space-y-3">
          {choices.map((offer) => {
            const active = selectedId === offer.id;
            const disc = discountPct(offer.price, offer.original_price);
            return (
              <li key={offer.id}>
                <div
                  className={`rounded-2xl border overflow-hidden transition-colors ${
                    active
                      ? 'border-violet-500 ring-2 ring-violet-500/25 bg-violet-50/50 dark:bg-violet-950/30'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414]'
                  }`}
                >
                  <div className="flex gap-3 p-3">
                    <div className="h-20 w-20 shrink-0 rounded-xl bg-gray-100 dark:bg-[#1a1a1a] overflow-hidden">
                      {offer.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={offer.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-[10px] text-gray-400">
                          Sin foto
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate">
                        {offer.store?.trim() || 'Tienda'}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                        {offer.title}
                      </p>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                          {formatMx(offer.price)}
                        </span>
                        {disc != null ? (
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            -{disc}%
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <Heart className="h-3 w-3" aria-hidden />
                          {offer.upvotes_count} votos
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-3 w-3" aria-hidden />
                          {offer.views} vistas
                        </span>
                        <span
                          className={
                            offer.dealStatus === 'expired'
                              ? 'text-gray-500'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {offer.dealStatus === 'expired' ? 'Expirada' : 'Activa'}
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-violet-600 dark:text-violet-400 font-medium">
                          <Check className="h-3 w-3" aria-hidden />
                          Elegible
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="px-3 pb-3">
                    <button
                      type="button"
                      disabled={confirming}
                      onClick={() => setSelectedId(offer.id)}
                      className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                        active
                          ? 'bg-violet-600 text-white'
                          : 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] hover:opacity-90'
                      } disabled:opacity-50`}
                    >
                      {active ? 'Seleccionada' : 'Elegir esta oferta'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selectedId ? (
        <button
          type="button"
          disabled={confirming}
          onClick={openConfirm}
          className="w-full rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3.5 text-sm disabled:opacity-50"
        >
          Continuar con la selección
        </button>
      ) : null}

      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {showConfirm && selected ? (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Cerrar"
            disabled={confirming}
            onClick={() => {
              if (!confirming) setShowConfirm(false);
            }}
          />
          <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#141414] shadow-2xl border border-violet-100 dark:border-violet-900/50 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2
                id={titleId}
                className="text-xl font-semibold text-gray-900 dark:text-gray-50"
              >
                ¿Confirmar recompensa?
              </h2>
              <button
                type="button"
                disabled={confirming}
                onClick={() => setShowConfirm(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300">Has elegido:</p>

            <div className="flex gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-[#1a1a1a]">
                {selected.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.image_url} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                  {selected.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{selected.store?.trim() || 'Tienda'}</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Esta oferta será asociada a tu recompensa.
            </p>
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300 leading-relaxed">
              Una vez confirmada, esta selección no podrá cambiarse.
            </p>

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <button
                type="button"
                disabled={confirming}
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-2xl border border-gray-200 dark:border-gray-700 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={confirming}
                onClick={() => onConfirm(selected.id)}
                className="flex-1 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 text-sm disabled:opacity-50"
              >
                {confirming ? 'Confirmando…' : 'Confirmar recompensa'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
