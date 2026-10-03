'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, BarChart3 } from 'lucide-react';
import MeSectionPage from '@/app/me/dashboard/MeSectionPage';
import OfferAdvancedMetricsModal from '@/app/components/OfferAdvancedMetricsModal';
import { buildOfferPublicPath } from '@/lib/offerPath';
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

const STATUS_CLASS: Record<DealStatus, string> = {
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  rejected: 'bg-black/5 text-[#6e6e73] dark:bg-white/10 dark:text-[#a3a3a3]',
  expired: 'bg-black/5 text-[#6e6e73] dark:bg-white/10 dark:text-[#a3a3a3]',
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
  const [metricsOfferId, setMetricsOfferId] = useState<string | null>(null);

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
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Filtrar ofertas por estado">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={filter === item.value}
            onClick={() => setFilter(item.value)}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
              filter === item.value
                ? 'bg-violet-600 text-white'
                : 'bg-white text-[#1d1d1f] shadow-sm hover:bg-violet-50 hover:text-violet-700 dark:bg-[#141414] dark:text-[#a3a3a3] dark:hover:bg-violet-950/40 dark:hover:text-violet-300'
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
      {error ? (
        <div className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
          <p className="text-sm text-[#1d1d1f] dark:text-[#fafafa]">No se pudieron cargar tus ofertas.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 inline-flex items-center justify-center rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-[#1d1d1f] transition-colors duration-150 hover:bg-black/[0.03] active:bg-black/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-white/15 dark:text-[#fafafa] dark:hover:bg-white/5"
          >
            Reintentar
          </button>
        </div>
      ) : null}
      {rows != null && visible.length === 0 && !error ? (
        <div className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
          <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3]">
            {rows.length === 0 ? 'Nada publicado. ¿Cazamos una oferta?' : 'No tienes ofertas en este estado.'}
          </p>
          {rows.length === 0 ? (
            <Link
              href="/subir"
              className="mt-3 inline-flex items-center justify-center rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:bg-violet-700 active:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#141414]"
            >
              Subir oferta
            </Link>
          ) : null}
        </div>
      ) : null}
      <ul className="space-y-3">
        {visible.map((row) => {
          const price = money(row.price);
          const discount = offerDiscountPercent(row.price, row.originalPrice);
          const date = when(row.createdAt);
          const publicPage = row.dealStatus === 'approved' || row.dealStatus === 'expired';
          return (
            <li
              key={row.id}
              className="flex items-stretch overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-sm dark:border-white/10 dark:bg-[#141414]"
            >
              <button
                type="button"
                onClick={() => setMetricsOfferId(row.id)}
                aria-haspopup="dialog"
                aria-label={`Ver métricas de ${row.title}`}
                className="group min-w-0 flex-1 px-4 py-3 text-left transition-colors duration-150 hover:bg-black/[0.02] active:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 dark:hover:bg-white/[0.03] dark:active:bg-white/[0.06]"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    {row.store ? <span className="block truncate text-xs text-[#6e6e73] dark:text-[#a3a3a3]">{row.store}</span> : null}
                    <span className="block text-sm font-medium leading-snug text-[#1d1d1f] line-clamp-2 dark:text-[#fafafa]">{row.title}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[row.dealStatus]}`}>
                    {STATUS_LABEL[row.dealStatus]}
                  </span>
                </span>
                <span className="mt-2 block text-xs text-[#6e6e73] dark:text-[#a3a3a3]">
                  {price ? <span>Precio {price}</span> : <span>Precio no indicado</span>}
                  {discount != null ? <span> · Descuento {discount}%</span> : null}
                  {date ? <span> · {date}</span> : null}
                </span>
                {row.views != null ? (
                  <span className="mt-1 block text-xs text-[#6e6e73] dark:text-[#a3a3a3]">Vistas, solo para ti: {row.views}</span>
                ) : null}
                {row.rejectionReason ? (
                  <span className="mt-1 block text-xs text-[#1d1d1f] dark:text-[#fafafa]">{row.rejectionReason}</span>
                ) : null}
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-600 transition-colors duration-150 group-hover:text-violet-700 dark:text-violet-400 dark:group-hover:text-violet-300">
                  <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                  Ver métricas
                </span>
              </button>
              {publicPage ? (
                <Link
                  href={buildOfferPublicPath(row.id, row.title)}
                  aria-label={`Ver publicación de ${row.title}`}
                  title="Ver publicación"
                  className="flex w-12 shrink-0 items-center justify-center border-l border-black/5 text-[#6e6e73] transition-colors duration-150 hover:bg-black/[0.03] hover:text-[#1d1d1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 dark:border-white/10 dark:text-[#a3a3a3] dark:hover:bg-white/[0.05] dark:hover:text-[#fafafa]"
                >
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
      {metricsOfferId ? (
        <OfferAdvancedMetricsModal offerId={metricsOfferId} onClose={() => setMetricsOfferId(null)} />
      ) : null}
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
