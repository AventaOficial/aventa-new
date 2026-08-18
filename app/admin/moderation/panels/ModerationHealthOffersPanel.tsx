'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/providers/AuthProvider';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { buildOfferPublicPath } from '@/lib/offerPath';
import LoadingState from '@/app/components/panel/LoadingState';
import EmptyState from '@/app/components/panel/EmptyState';

type HealthRow = {
  offer_id: string;
  status: string;
  last_checked_at: string;
  published_price: number | null;
  live_price: number | null;
  price_delta_pct: number | null;
  diagnostic: string | null;
  offers: {
    id: string;
    title: string;
    price: number;
    original_price: number | null;
    store: string | null;
    image_url: string | null;
    offer_url: string | null;
    status: string;
  } | null;
};

type Props = {
  status: 'price_changed' | 'out_of_stock';
  title: string;
  emptyMessage: string;
  /** staff API para operaciones/analyst; admin por defecto */
  apiBase?: '/api/admin/offer-health-queue' | '/api/staff/offer-health-queue';
  readOnly?: boolean;
};

function formatMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ModerationHealthOffersPanel({
  status,
  title,
  emptyMessage,
  apiBase = '/api/admin/offer-health-queue',
  readOnly = false,
}: Props) {
  const { session } = useAuth();
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [tableAvailable, setTableAvailable] = useState(true);
  const [canWrite, setCanWrite] = useState(!readOnly);

  const load = useCallback(async () => {
    setLoading(true);
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    try {
      const res = await fetch(`${apiBase}?status=${status}`, { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRows([]);
        setNote(typeof body?.error === 'string' ? body.error : 'Error al cargar');
        return;
      }
      setRows(Array.isArray(body?.rows) ? body.rows : []);
      setTableAvailable(body?.tableAvailable !== false);
      setCanWrite(!readOnly && body?.canWrite !== false);
      setNote(typeof body?.note === 'string' ? body.note : null);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, status, apiBase, readOnly]);

  useEffect(() => {
    if (session?.access_token) void load();
    else setLoading(false);
  }, [session?.access_token, load]);

  const markExpired = async (offerId: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    await fetch('/api/admin/expire-offer', { method: 'POST', headers, body: JSON.stringify({ offerId }) });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Ofertas publicadas con alerta de salud · verificar en tienda
            {readOnly ? ' · solo lectura' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </button>
      </div>

      {!tableAvailable && note ? (
        <p className="text-sm text-amber-700 dark:text-amber-300 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
          {note}
        </p>
      ) : null}

      {loading ? (
        <LoadingState message="Cargando ofertas…" variant="light" />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyMessage} variant="light" />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const offer = row.offers;
            if (!offer) return null;
            return (
              <li
                key={row.offer_id}
                className="rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-white/90 dark:bg-[#141414]/90 p-4 flex flex-col sm:flex-row gap-4"
              >
                {offer.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={offer.image_url} alt="" className="h-20 w-20 rounded-xl object-cover shrink-0 bg-gray-100" />
                ) : (
                  <div className="h-20 w-20 rounded-xl bg-gray-100 dark:bg-gray-800 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <Link
                    href={buildOfferPublicPath(offer.id)}
                    className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline line-clamp-2"
                  >
                    {offer.title}
                  </Link>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {offer.store ?? 'Tienda'} · Publicado {formatMoney(row.published_price ?? offer.price)}
                    {row.live_price != null ? (
                      <> · En tienda {formatMoney(row.live_price)}</>
                    ) : null}
                    {row.price_delta_pct != null ? (
                      <span className="text-amber-600 dark:text-amber-400"> ({row.price_delta_pct}%)</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">Revisado {formatWhen(row.last_checked_at)}</p>
                  {row.diagnostic ? (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{row.diagnostic}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  {offer.offer_url ? (
                    <a
                      href={offer.offer_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver tienda
                    </a>
                  ) : null}
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => void markExpired(offer.id)}
                      className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-2"
                    >
                      Marcar expirada
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
