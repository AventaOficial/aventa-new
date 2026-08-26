'use client';

import { useEffect, useState } from 'react';
import { X, BarChart3, Clock, Target } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';

type AdvancedPayload = {
  offer: { id: string; title: string; upvotes: number; expires_at: string | null };
  totals: { views: number; outbound: number; shares: number; cazar_cta: number };
  hourly: { hour: string; views: number; outbound: number; shares: number }[];
  peak: { hour: string; views: number } | null;
  partner: {
    qualifyingCount: number;
    requiredOffers: number;
    minUpvotesPerOffer: number;
    thisOfferQualifies: boolean;
    remainingForThisOffer: number;
    remainingOffers: number;
  };
};

type Props = {
  offerId: string;
  onClose: () => void;
};

function formatHourMx(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      timeZone: 'America/Mexico_City',
    });
  } catch {
    return iso;
  }
}

export default function OfferAdvancedMetricsModal({ offerId, onClose }: Props) {
  const { session } = useAuth();
  useBodyScrollLock(true);
  const [data, setData] = useState<AdvancedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const token = session?.access_token;
    if (!token) {
      setError('Inicia sesión');
      setLoading(false);
      return;
    }
    fetch(`/api/me/offer-metrics/${encodeURIComponent(offerId)}/advanced`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || 'No se pudieron cargar');
        return body as AdvancedPayload;
      })
      .then((body) => {
        if (alive) setData(body);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message || 'Error');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [offerId, session?.access_token]);

  const maxViews = Math.max(1, ...(data?.hourly.map((h) => h.views) ?? [1]));

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-[#141414] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Métricas avanzadas"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Métricas avanzadas</p>
              <p className="text-[11px] text-gray-500">Últimos 7 días</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Cargando…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-600">{error}</p>
          ) : data ? (
            <>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2">
                {data.offer.title}
              </p>

              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['Vistas', data.totals.views],
                    ['Clics a tienda', data.totals.outbound],
                    ['Compartidos', data.totals.shares],
                    ['Aperturas CTA', data.totals.cazar_cta],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-[#1a1a1a]"
                  >
                    <p className="text-[11px] text-gray-500">{label}</p>
                    <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {data.peak ? (
                <div className="flex items-start gap-2 rounded-xl bg-violet-50 px-3 py-2.5 dark:bg-violet-950/40">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                  <div>
                    <p className="text-xs font-semibold text-violet-900 dark:text-violet-200">
                      Hora con más vistas
                    </p>
                    <p className="text-sm text-violet-800 dark:text-violet-300">
                      {formatHourMx(data.peak.hour)} · {data.peak.views} vistas
                    </p>
                  </div>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Vistas por hora
                </p>
                {data.hourly.length === 0 ? (
                  <p className="text-xs text-gray-500">Aún no hay actividad en esta ventana.</p>
                ) : (
                  <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                    {[...data.hourly].reverse().slice(0, 48).map((b) => (
                      <li key={b.hour} className="flex items-center gap-2 text-[11px]">
                        <span className="w-[7.5rem] shrink-0 tabular-nums text-gray-500">
                          {formatHourMx(b.hour)}
                        </span>
                        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: `${Math.max(4, (b.views / maxViews) * 100)}%` }}
                          />
                        </div>
                        <span className="w-6 shrink-0 text-right tabular-nums font-medium text-gray-800 dark:text-gray-200">
                          {b.views}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                <div className="mb-2 flex items-center gap-2">
                  <Target className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    Camino a Partner
                  </p>
                </div>
                <p className="text-[11px] leading-snug text-gray-600 dark:text-gray-400">
                  Necesitas {data.partner.requiredOffers} ofertas con al menos{' '}
                  {data.partner.minUpvotesPerOffer} votos positivos cada una.
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full bg-violet-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (data.partner.qualifyingCount / Math.max(1, data.partner.requiredOffers)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                  {data.partner.qualifyingCount}/{data.partner.requiredOffers} ofertas califican
                  {data.partner.thisOfferQualifies
                    ? ' · Esta oferta ya califica'
                    : ` · A esta le faltan ${data.partner.remainingForThisOffer} votos`}
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
