'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import MeSectionPage from '@/app/me/dashboard/MeSectionPage';
import { createClient } from '@/lib/supabase/client';
import { formatPriceMXN } from '@/lib/formatPrice';
import { offerDiscountPercent } from '@/lib/me/offerPresentation';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';

type Row = {
  id: string;
  title: string;
  store: string | null;
  price: number | null;
  originalPrice: number | null;
  createdAt: string | null;
  dealStatus: DealStatus;
  rejectionReason: string | null;
  views: number | null;
};

const FILTERS: Array<{ value: 'all' | DealStatus; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'approved', label: 'Activas' },
  { value: 'pending', label: 'En revisión' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: 'expired', label: 'Expiradas' },
];

const STATUS_LABEL: Record<DealStatus, string> = {
  approved: 'Activa',
  pending: 'En revisión',
  rejected: 'Rechazada',
  expired: 'Expirada',
};

function money(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return formatPriceMXN(value);
}

function when(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function OfertasInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get('estado');
  const [filter, setFilter] = useState<'all' | DealStatus>(
    initial === 'approved' || initial === 'pending' || initial === 'rejected' || initial === 'expired' ? initial : 'all',
  );
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace('/');
        return;
      }
      const { data, error: loadError } = await supabase
        .from('offers')
        .select('id, title, store, price, original_price, created_at, status, rejection_reason, expires_at')
        .eq('created_by', auth.user.id)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (loadError) {
        setError(true);
        setRows([]);
        return;
      }
      const now = new Date().toISOString();
      const mapped: Row[] = (data ?? []).map((row) => {
        const status = String((row as { status?: string }).status ?? 'pending').toLowerCase();
        const expiresAt = (row as { expires_at?: string | null }).expires_at;
        let dealStatus: DealStatus = 'pending';
        if (status === 'rejected') dealStatus = 'rejected';
        else if (status === 'approved' || status === 'published') {
          dealStatus = expiresAt && expiresAt < now ? 'expired' : 'approved';
        }
        const price = (row as { price?: number | null }).price;
        const original = (row as { original_price?: number | null }).original_price;
        return {
          id: String((row as { id: string }).id),
          title: String((row as { title?: string }).title ?? 'Oferta'),
          store: (row as { store?: string | null }).store?.trim() || null,
          price: typeof price === 'number' ? price : null,
          originalPrice: typeof original === 'number' ? original : null,
          createdAt: (row as { created_at?: string | null }).created_at ?? null,
          dealStatus,
          rejectionReason: (row as { rejection_reason?: string | null }).rejection_reason?.trim() || null,
          views: null,
        };
      });
      setRows(mapped);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      try {
        const res = await fetch('/api/me/offer-metrics', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok || !active) return;
        const body = (await res.json()) as { metrics?: Record<string, { views?: number }> };
        const metrics = body.metrics;
        if (!metrics || !active) return;
        setRows((current) =>
          (current ?? mapped).map((row) => {
            const views = metrics[row.id]?.views;
            return typeof views === 'number' ? { ...row, views } : row;
          }),
        );
      } catch {
        /* Las vistas privadas se omiten si no cargan. */
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const visible = useMemo(
    () => (rows ?? []).filter((row) => filter === 'all' || row.dealStatus === filter),
    [rows, filter],
  );

  return (
    <MeSectionPage title="Ofertas" lede="Tu centro de trabajo. El estado de cada hallazgo, sin datos de afiliación.">
      <div className="mb-4 flex gap-1 overflow-x-auto" role="tablist" aria-label="Filtrar ofertas por estado">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={filter === item.value}
            onClick={() => setFilter(item.value)}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
              filter === item.value
                ? 'bg-violet-600 text-white'
                : 'bg-white text-gray-700 dark:bg-[#121214] dark:text-zinc-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {rows == null && !error ? (
        <div className="space-y-2" aria-hidden>
          <div className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-900" />
          <div className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-900" />
        </div>
      ) : null}
      {error ? <p className="text-sm text-gray-600 dark:text-zinc-300">No se pudieron cargar tus ofertas.</p> : null}
      {rows != null && visible.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-zinc-300">
          {rows.length === 0 ? 'Nada publicado. ¿Cazamos una oferta?' : 'No tienes ofertas en este estado.'}
        </p>
      ) : null}
      <ul className="space-y-3">
        {visible.map((row) => {
          const price = money(row.price);
          const discount = offerDiscountPercent(row.price, row.originalPrice);
          const date = when(row.createdAt);
          return (
            <li key={row.id} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-[#121214]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {row.store ? <p className="text-xs text-gray-500 dark:text-zinc-400">{row.store}</p> : null}
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{row.title}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-gray-700 dark:text-zinc-200">{STATUS_LABEL[row.dealStatus]}</span>
              </div>
              <p className="mt-2 text-xs text-gray-600 dark:text-zinc-300">
                {price ? <span>Precio {price}</span> : <span>Precio no indicado</span>}
                {discount != null ? <span> · Descuento {discount}%</span> : null}
                {date ? <span> · {date}</span> : null}
              </p>
              {row.views != null ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">Vistas, solo para ti: {row.views}</p>
              ) : null}
              {row.rejectionReason ? <p className="mt-1 text-xs text-gray-600 dark:text-zinc-300">{row.rejectionReason}</p> : null}
            </li>
          );
        })}
      </ul>
    </MeSectionPage>
  );
}

export default function OfertasPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 pt-24" aria-hidden>
          <div className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-900" />
        </div>
      }
    >
      <OfertasInner />
    </Suspense>
  );
}
