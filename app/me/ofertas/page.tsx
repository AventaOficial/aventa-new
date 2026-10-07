'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Check,
  Clock,
  MessageCircle,
  MousePointer2,
  Search,
  Send,
  Tag,
  ThumbsUp,
  X,
} from 'lucide-react';
import { MeSpaceShell, meHeroAccentClass, meHeroActionClass } from '@/app/me/dashboard/MeSectionPage';
import OfferDetailDrawer, { type OfferDrawerModel } from '@/app/me/ofertas/OfferDetailDrawer';
import { useUI } from '@/app/providers/UIProvider';
import { ALL_CATEGORIES } from '@/lib/categories';
import { PUBLIC_NAVBAR_OFFSET_CLASS } from '@/lib/ui/publicNavbarOffset';
import { createClient } from '@/lib/supabase/client';
import { resolveOfferSourceCurrency } from '@/lib/offers/sourceCurrency';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type StatusFilter = 'all' | DealStatus;
type SortKey = 'recent' | 'oldest' | 'votes';

type Row = OfferDrawerModel & {
  rejectionReason: string | null;
  views: number | null;
};

const FILTERS: Array<{ value: StatusFilter; label: string; dot: string }> = [
  { value: 'all', label: 'Todas', dot: 'bg-violet-500' },
  { value: 'approved', label: 'Aprobadas', dot: 'bg-emerald-500' },
  { value: 'pending', label: 'En revisión', dot: 'bg-amber-400' },
  { value: 'rejected', label: 'Rechazadas', dot: 'bg-rose-500' },
  { value: 'expired', label: 'Expiradas', dot: 'bg-zinc-400' },
];

const STATUS_LABEL: Record<DealStatus, string> = {
  approved: 'Aprobada',
  pending: 'En revisión',
  rejected: 'Rechazada',
  expired: 'Expirada',
};

function categoryLabel(value: string | null): string | null {
  if (!value) return null;
  return ALL_CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

function compactCount(value: number | null): string {
  if (value == null) return '—';
  if (value < 1000) return String(value);
  const scaled = value / 1000;
  const digits = scaled >= 10 ? 0 : 1;
  return `${scaled.toFixed(digits).replace(/\.0$/, '')}K`;
}

function countWord(value: number | null, singular: string, plural: string): string {
  return value === 1 ? singular : plural;
}

function ago(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 1) return 'Hoy';
  if (days === 1) return 'Hace 1 día';
  if (days < 7) return `Hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return 'Hace 1 semana';
  if (weeks < 5) return `Hace ${weeks} semanas`;
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Spark({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 72 28" className="h-7 w-16" aria-hidden>
      <path d="M2 20 C12 18 16 8 26 12 C36 16 40 6 50 8 C58 10 62 4 70 6" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function OfertasHeroAside({ total, ready }: { total: number; ready: boolean }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <Tag className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden />
        Tu impacto
      </p>
      <p className="mt-2 text-[28px] font-semibold tabular-nums leading-none">{ready ? total : '—'}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--me-muted)]">Descubrimientos que ya publicaste.</p>
    </div>
  );
}

function OfertasInner() {
  const router = useRouter();
  const { openUploadModal } = useUI();
  const params = useSearchParams();
  const initial = params.get('estado');
  const [filter, setFilter] = useState<StatusFilter>(
    initial === 'approved' || initial === 'pending' || initial === 'rejected' || initial === 'expired' ? initial : 'all',
  );
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [category, setCategory] = useState('all');
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

  const [weekAgo] = useState(() => Date.now() - 7 * 86_400_000);
  const counts = useMemo(() => {
    const list = rows ?? [];
    const tally = { all: list.length, approved: 0, pending: 0, rejected: 0, expired: 0, week: 0 };
    for (const row of list) {
      tally[row.dealStatus] += 1;
      const created = row.createdAt ? new Date(row.createdAt).getTime() : NaN;
      if (!Number.isNaN(created) && created >= weekAgo) tally.week += 1;
    }
    return tally;
  }, [rows, weekAgo]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows ?? []) {
      if (row.category) seen.add(row.category);
    }
    return [...seen];
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (rows ?? []).filter((row) => {
      if (filter !== 'all' && row.dealStatus !== filter) return false;
      if (category !== 'all' && row.category !== category) return false;
      if (!needle) return true;
      const haystack = `${row.title} ${row.store ?? ''} ${categoryLabel(row.category) ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
    return list.sort((a, b) => {
      if (sort === 'votes') return (b.upvotes ?? 0) - (a.upvotes ?? 0);
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sort === 'oldest' ? aTime - bTime : bTime - aTime;
    });
  }, [category, filter, query, rows, sort]);

  const percent = (count: number) => (counts.all === 0 ? 0 : Math.round((count / counts.all) * 100));
  const publish = () => openUploadModal();

  return (
    <MeSpaceShell
      tone="night"
      wide
      integrated
      accentClassName={meHeroAccentClass}
      title="Tus ofertas,"
      accent="tu impacto"
      lede="Aquí viven los descubrimientos que publicaste."
      note={
        <button type="button" onClick={publish} className={meHeroActionClass}>
          Publicar oferta
        </button>
      }
      aside={<OfertasHeroAside total={counts.all} ready={rows != null} />}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Send className="h-4 w-4" aria-hidden />}
          iconClass="bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200"
          value={counts.all}
          label="Total publicadas"
          detail={`+${counts.week} esta semana`}
          detailClass="text-emerald-700 dark:text-emerald-400"
          spark="#22c55e"
        />
        <StatCard
          icon={<Check className="h-4 w-4" aria-hidden />}
          iconClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
          value={counts.approved}
          label="Aprobadas"
          detail={`${percent(counts.approved)}% del total`}
          detailClass="text-emerald-700 dark:text-emerald-400"
          spark="#22c55e"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" aria-hidden />}
          iconClass="bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-300"
          value={counts.pending}
          label="En revisión"
          detail={`${percent(counts.pending)}% del total`}
          detailClass="text-[var(--me-muted)]"
          spark="#f59e0b"
        />
        <StatCard
          icon={<X className="h-4 w-4" aria-hidden />}
          iconClass="bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
          value={counts.rejected}
          label="Rechazadas"
          detail={`${percent(counts.rejected)}% del total`}
          detailClass="text-rose-700 dark:text-rose-400"
          spark="#fb7185"
        />
      </section>

      <div className="mt-4 flex min-w-0 flex-col gap-3 rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Filtrar ofertas por estado">
          {FILTERS.map((item) => {
            const selected = filter === item.value;
            const count = counts[item.value];
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(item.value)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                  selected ? 'bg-violet-600 text-white' : 'text-[var(--me-muted)] hover:bg-[var(--me-soft)]'
                }`}
              >
                {item.value === 'all' ? null : <span className={`h-2 w-2 rounded-full ${selected ? 'bg-white' : item.dot}`} aria-hidden />}
                {item.label}
                <span className={`tabular-nums ${selected ? 'text-white/80' : 'text-[var(--me-muted)]'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-[var(--me-soft)] px-3 py-2 text-[var(--me-muted)]">
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en tus ofertas..."
            className="w-full bg-transparent text-[13px] text-[var(--me-ink)] outline-none placeholder:text-[var(--me-faint)]"
            aria-label="Buscar en tus ofertas"
          />
        </label>
        <label className="inline-flex items-center gap-2 rounded-full bg-[var(--me-soft)] px-3 py-2 text-[13px] text-[var(--me-ink)]">
          <span className="sr-only">Orden</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="bg-transparent font-medium focus:outline-none"
            aria-label="Orden"
          >
            <option value="recent">Más recientes</option>
            <option value="oldest">Más antiguas</option>
            <option value="votes">Más votos</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2 rounded-full bg-[var(--me-soft)] px-3 py-2 text-[13px] text-[var(--me-ink)]">
          <span className="sr-only">Categoría</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="max-w-40 bg-transparent font-medium focus:outline-none"
            aria-label="Categoría"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {categoryLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows == null && !error ? (
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-20 animate-pulse rounded-2xl bg-[var(--me-card)]" />
          <div className="h-20 animate-pulse rounded-2xl bg-[var(--me-card)]" />
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-5">
          <p className="text-sm text-[var(--me-ink)]">No se pudieron cargar tus ofertas.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 inline-flex items-center justify-center rounded-full border border-[var(--me-line)] px-4 py-2 text-xs font-semibold text-[var(--me-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            Reintentar
          </button>
        </div>
      ) : null}
      {rows != null && visible.length === 0 && !error ? (
        <div className="mt-3 rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-5">
          <p className="text-sm text-[var(--me-muted)]">
            {rows.length === 0 ? 'Nada publicado. ¿Cazamos una oferta?' : 'No tienes ofertas en esta vista.'}
          </p>
          {rows.length === 0 ? (
            <button
              type="button"
              onClick={publish}
              className="mt-3 inline-flex items-center justify-center rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              Subir oferta
            </button>
          ) : null}
        </div>
      ) : null}

      <ul className="mt-3 space-y-2">
        {visible.map((row) => {
          const label = categoryLabel(row.category);
          const tone =
            row.dealStatus === 'approved'
              ? 'bg-emerald-500 text-white'
              : row.dealStatus === 'pending'
                ? 'bg-amber-400 text-[#1a1204]'
                : row.dealStatus === 'rejected'
                  ? 'bg-rose-500 text-white'
                  : 'bg-[var(--me-chip)] text-[var(--me-ink)]';
          const StatusIcon = row.dealStatus === 'approved' ? Check : row.dealStatus === 'pending' ? Clock : X;
          return (
            <li key={row.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none px-3 py-3 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--me-soft)]">
                  {row.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-[var(--me-faint)]">
                      <Tag className="h-5 w-5" aria-hidden />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[var(--me-ink)]">{row.title}</p>
                  <p className="mt-0.5 truncate text-[12px] text-[var(--me-muted)]">
                    {row.store ?? 'Tienda'}
                    {label ? ` · ${label}` : ''}
                  </p>
                  {ago(row.createdAt) ? <p className="mt-0.5 text-[12px] text-[var(--me-faint)]">{ago(row.createdAt)}</p> : null}
                  {label || row.store ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {label ? <span className="rounded-full bg-[var(--me-chip)] px-2 py-0.5 text-[11px] text-[var(--me-muted)]">{label}</span> : null}
                      {row.store ? <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] text-violet-700 dark:text-violet-200">{row.store}</span> : null}
                    </div>
                  ) : null}
                  {row.rejectionReason ? <p className="mt-1 text-[12px] text-rose-700 dark:text-rose-300">{row.rejectionReason}</p> : null}
                </div>
              </div>
              <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${tone}`}>
                <StatusIcon className="h-3.5 w-3.5" aria-hidden />
                {STATUS_LABEL[row.dealStatus]}
              </span>
              <div className="flex flex-wrap items-center gap-4 text-[13px] text-[var(--me-ink)] lg:w-70 lg:justify-between">
                <Metric icon={<MousePointer2 className="h-3.5 w-3.5" aria-hidden />} value={compactCount(row.views)} label={countWord(row.views, 'Vista', 'Vistas')} />
                <Metric icon={<ThumbsUp className="h-3.5 w-3.5" aria-hidden />} value={compactCount(row.upvotes)} label={countWord(row.upvotes, 'Voto', 'Votos')} />
                <Metric icon={<MessageCircle className="h-3.5 w-3.5" aria-hidden />} value={compactCount(row.comments)} label={countWord(row.comments, 'Comentario', 'Comentarios')} />
              </div>
              <button
                type="button"
                onClick={() => setMetricsOffer(row)}
                className="inline-flex items-center justify-center gap-1 rounded-full border border-[var(--me-line)] bg-[var(--me-soft)] px-3 py-2 text-[13px] font-medium text-[var(--me-ink)] hover:bg-[var(--me-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                Ver detalles
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      {metricsOffer ? <OfferDetailDrawer offer={metricsOffer} onClose={() => setMetricsOffer(null)} /> : null}
    </MeSpaceShell>
  );
}

function StatCard({
  icon,
  iconClass,
  value,
  label,
  detail,
  detailClass,
  spark,
}: {
  icon: ReactNode;
  iconClass: string;
  value: number;
  label: string;
  detail: string;
  detailClass: string;
  spark: string;
}) {
  return (
    <article className="flex items-center gap-3 rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none px-4 py-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[28px] font-semibold leading-none tabular-nums tracking-tight text-[var(--me-ink)]">{value}</span>
        <span className="mt-1 block text-[13px] font-medium text-[var(--me-ink)]">{label}</span>
        <span className={`mt-0.5 block text-[11px] font-medium ${detailClass}`}>{detail}</span>
      </span>
      <Spark color={spark} />
    </article>
  );
}

function Metric({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <span className="inline-flex min-w-16 items-center gap-1.5">
      <span className="text-violet-500">{icon}</span>
      <span>
        <span className="block font-semibold tabular-nums leading-none">{value}</span>
        <span className="mt-0.5 block text-[11px] text-[var(--me-muted)]">{label}</span>
      </span>
    </span>
  );
}

export default function OfertasPage() {
  return (
    <Suspense
      fallback={
        <div className={`min-h-screen bg-[var(--me-page)] px-4 ${PUBLIC_NAVBAR_OFFSET_CLASS}`} aria-hidden>
          <div className="h-20 animate-pulse rounded-2xl bg-[var(--me-card)]" />
        </div>
      }
    >
      <OfertasInner />
    </Suspense>
  );
}
