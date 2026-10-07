'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import MeSectionPage from '@/app/me/dashboard/MeSectionPage';
import OfferDetailDrawer, { type OfferDrawerModel } from '@/app/me/ofertas/OfferDetailDrawer';
import { PUBLIC_NAVBAR_OFFSET_CLASS } from '@/lib/ui/publicNavbarOffset';
import { createClient } from '@/lib/supabase/client';
import { presentOfferPrice } from '@/lib/formatPrice';
import { resolveOfferSourceCurrency } from '@/lib/offers/sourceCurrency';
import { offerDiscountPercent } from '@/lib/me/offerPresentation';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';

type Row = OfferDrawerModel & {
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

function money(value: number | null, currency: string | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return presentOfferPrice(value, currency);
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
  const [metricsOffer, setMetricsOffer] = useState<Row | null>(null);

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
        .select('id, title, store, price, original_price, source_currency, image_url, offer_url, category, hunter_comment, upvotes_count, created_at, status, rejection_reason, expires_at')
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
        const raw = row as {
          id: string;
          title?: string;
          store?: string | null;
          price?: number | null;
          original_price?: number | null;
          image_url?: string | null;
          offer_url?: string | null;
          source_currency?: string | null;
          category?: string | null;
          hunter_comment?: string | null;
          upvotes_count?: number | null;
          created_at?: string | null;
          rejection_reason?: string | null;
        };
        return {
          id: String(raw.id),
          title: String(raw.title ?? 'Oferta'),
          store: raw.store?.trim() || null,
          price: typeof raw.price === 'number' ? raw.price : null,
          originalPrice: typeof raw.original_price === 'number' ? raw.original_price : null,
          image: raw.image_url?.trim() || null,
          offerUrl: raw.offer_url?.trim() || null,
          sourceCurrency: resolveOfferSourceCurrency(raw.source_currency, raw.offer_url),
          category: raw.category?.trim() || null,
          hunterComment: raw.hunter_comment?.trim() || null,
          upvotes: typeof raw.upvotes_count === 'number' ? raw.upvotes_count : null,
          comments: null,
          favorites: null,
          createdAt: raw.created_at ?? null,
          dealStatus,
          rejectionReason: raw.rejection_reason?.trim() || null,
          views: null,
        };
      });
      setRows(mapped);

      if (mapped.length > 0) {
        const ids = mapped.map((row) => row.id);
        const [commentsRes, favoritesRes] = await Promise.all([
          supabase.from('comments').select('offer_id').in('offer_id', ids).eq('status', 'approved'),
          supabase.from('offer_favorites').select('offer_id').in('offer_id', ids),
        ]);
        if (active) {
          const comments = new Map<string, number>();
          if (!commentsRes.error) {
            for (const item of commentsRes.data ?? []) {
              const id = (item as { offer_id?: string }).offer_id;
              if (id) comments.set(id, (comments.get(id) ?? 0) + 1);
            }
          }
          const favorites = new Map<string, number>();
          if (!favoritesRes.error) {
            for (const item of favoritesRes.data ?? []) {
              const id = (item as { offer_id?: string }).offer_id;
              if (id) favorites.set(id, (favorites.get(id) ?? 0) + 1);
            }
          }
          setRows((current) =>
            (current ?? mapped).map((row) => ({
              ...row,
              comments: commentsRes.error ? null : comments.get(row.id) ?? 0,
              favorites: favoritesRes.error ? null : favorites.get(row.id) ?? 0,
            })),
          );
        }
      }

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
          const price = money(row.price, row.sourceCurrency ?? null);
          const discount = offerDiscountPercent(row.price, row.originalPrice);
          const date = when(row.createdAt);
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setMetricsOffer(row)}
                className="flex w-full items-stretch overflow-hidden rounded-2xl border border-black/[0.04] bg-white text-left shadow-sm transition-colors duration-150 hover:bg-black/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-white/10 dark:bg-[#141414] dark:hover:bg-white/[0.03]"
              >
                <span className="min-w-0 flex-1 px-4 py-3">
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
                  {row.rejectionReason ? (
                    <span className="mt-1 block text-xs text-[#1d1d1f] dark:text-[#fafafa]">{row.rejectionReason}</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {metricsOffer ? <OfferDetailDrawer offer={metricsOffer} onClose={() => setMetricsOffer(null)} /> : null}
    </MeSectionPage>
  );
}

export default function OfertasPage() {
  return (
    <Suspense
      fallback={
        <div className={`px-4 ${PUBLIC_NAVBAR_OFFSET_CLASS}`} aria-hidden>
          <div className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-900" />
        </div>
      }
    >
      <OfertasInner />
    </Suspense>
  );
}
