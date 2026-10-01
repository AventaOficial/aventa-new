'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  CalendarDays,
  Check,
  Flame,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  ThumbsUp,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import { REPUTATION_LEVELS, getReputationLabel, getReputationProgress } from '@/lib/reputation';
import { formatPriceMXN } from '@/lib/formatPrice';
import { offerDiscountPercent } from '@/lib/me/offerPresentation';
import { applyFavoriteToggle } from '@/lib/offers/applyFavoriteToggle';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';
import { requestGuestSignIn } from '@/lib/auth/guestAccessPrompt';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type PublicProfileOffer = {
  id: string;
  title: string;
  store?: string | null;
  image?: string | null;
  discountPrice?: number | null;
  originalPrice?: number | null;
  createdAt?: string | null;
  dealStatus: DealStatus;
  upvotes?: number | null;
  isFavorite?: boolean;
};

type PublicProfileViewProps = {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  level: number;
  score: number;
  offers: PublicProfileOffer[];
  votesReceived: number | null;
  comments: number | null;
  sharePath: string | null;
  levelHref?: string | null;
  onOpenOffer: (offer: PublicProfileOffer) => void;
  onFavoriteChange?: (offerId: string, isFavorite: boolean) => void;
};

type Panel = 'ofertas' | 'actividad' | 'comentarios';
type Sort = 'recent' | 'votes';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  const days = Math.floor((Date.now() - time) / 86_400_000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Hace 1 día';
  if (days < 7) return `Hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return 'Hace 1 semana';
  if (weeks < 5) return `Hace ${weeks} semanas`;
  const months = Math.floor(days / 30);
  if (months <= 1) return 'Hace 1 mes';
  return `Hace ${months} meses`;
}

function statusMeta(status: DealStatus): { label: string; className: string } {
  if (status === 'approved') return { label: 'Aprobada', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' };
  if (status === 'pending') return { label: 'En revisión', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' };
  if (status === 'expired') return { label: 'Expirada', className: 'bg-black/5 text-[#6e6e73] dark:bg-white/10 dark:text-[#a3a3a3]' };
  return { label: 'Rechazada', className: 'bg-black/5 text-[#6e6e73] dark:bg-white/10 dark:text-[#a3a3a3]' };
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-black/[0.04] bg-white px-3 py-3 shadow-sm dark:border-white/10 dark:bg-[#141414]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[18px] font-semibold tabular-nums leading-none text-[#1d1d1f] dark:text-[#fafafa]">{value}</span>
        <span className="mt-1 block truncate text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">{label}</span>
      </span>
    </div>
  );
}

export default function PublicProfileView({
  displayName,
  handle,
  avatarUrl,
  level,
  score,
  offers,
  votesReceived,
  comments,
  sharePath,
  levelHref,
  onOpenOffer,
  onFavoriteChange,
}: PublicProfileViewProps) {
  const { session } = useAuth();
  const { showToast, openRegisterModal } = useUI();
  const [panel, setPanel] = useState<Panel>('ofertas');
  const [sort, setSort] = useState<Sort>('recent');
  const [showAll, setShowAll] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [copied, setCopied] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const published = useMemo(
    () => offers.filter((offer) => offer.dealStatus === 'approved' || offer.dealStatus === 'expired'),
    [offers],
  );
  const counts = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const offer of published) {
      if (!offer.createdAt) continue;
      const date = new Date(offer.createdAt);
      if (Number.isNaN(date.getTime())) continue;
      const key = dayKey(date);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    return byDay;
  }, [published]);

  const years = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const key of counts.keys()) set.add(Number(key.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [counts]);

  const selectedYear = years.includes(year) ? year : years[0];

  const activity = useMemo(() => buildYearActivity(selectedYear, counts), [selectedYear, counts]);
  const maxVotes = offers.reduce((max, offer) => Math.max(max, offer.upvotes ?? 0), 0);
  const logros = [
    { title: 'Primera oferta', detail: 'Publicó su primera oferta', unlocked: published.length >= 1, icon: Send },
    { title: '10 votos', detail: 'Recibió 10 votos', unlocked: (votesReceived ?? maxVotes) >= 10, icon: ThumbsUp },
    { title: 'Racha de 7 días', detail: 'Publicó ofertas 7 días seguidos', unlocked: activity.longestStreak >= 7, icon: Flame },
  ].filter((item) => item.unlocked);

  const sorted = [...offers].sort((a, b) => {
    if (sort === 'votes') return (b.upvotes ?? 0) - (a.upvotes ?? 0);
    return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
  });
  const visible = showAll ? sorted : sorted.slice(0, 5);

  const label = getReputationLabel(level);
  const next = REPUTATION_LEVELS.find((item) => item.level === level + 1);
  const band = REPUTATION_LEVELS.find((item) => item.level === level);
  const pct = Math.round(getReputationProgress(score, level) * 100);
  const progressLine = band && band.maxScore !== Infinity ? `${score} / ${band.maxScore + 1} puntos` : `${score} puntos`;

  const copyLink = async () => {
    if (!sharePath || typeof window === 'undefined') return;
    const url = `${window.location.origin}${sharePath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast('Enlace copiado.');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      showToast('No se pudo copiar el enlace.');
    }
  };

  const toggleFavorite = async (offer: PublicProfileOffer) => {
    if (!session) {
      requestGuestSignIn(showToast, openRegisterModal, 'favorite');
      return;
    }
    if (savingId) return;
    setSavingId(offer.id);
    const result = await applyFavoriteToggle({
      client: createClient(),
      userId: session.user.id,
      offerId: offer.id,
      wasFavorite: Boolean(offer.isFavorite),
    });
    setSavingId(null);
    if (result.ok) onFavoriteChange?.(offer.id, result.isFavorite);
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-sm dark:border-white/10 dark:bg-[#141414]">
        <div className="relative h-36 bg-gradient-to-r from-[#5b4dff] via-[#c44bd4] to-[#ffb067] sm:h-44">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover opacity-70 blur-[2px]" />
          ) : null}
        </div>
        <div className="relative px-4 pb-5 sm:px-6">
          <div className="flex items-end justify-between gap-3">
            <div className="-mt-10 flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#1d1d1f] dark:border-[#141414]">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-8 w-8 text-white" aria-hidden />
              )}
            </div>
            <div className="mb-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copyLink()}
                disabled={!sharePath}
                className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-violet-700 disabled:opacity-50"
              >
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
                Compartir
              </button>
              <button
                type="button"
                onClick={() => void copyLink()}
                disabled={!sharePath}
                aria-label="Compartir perfil"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-[#1d1d1f] dark:border-white/15 dark:text-[#fafafa]"
              >
                <Share2 className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => void copyLink()}
                disabled={!sharePath}
                aria-label="Más acciones del perfil"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-[#1d1d1f] dark:border-white/15 dark:text-[#fafafa]"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          <h1 className="mt-3 text-[28px] font-semibold leading-none text-[#1d1d1f] dark:text-[#fafafa]">{displayName}</h1>
          {handle ? <p className="mt-1 text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">@{handle}</p> : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={<Send className="h-4 w-4" aria-hidden />} value={String(published.length)} label="Ofertas publicadas" />
        <StatTile icon={<ThumbsUp className="h-4 w-4" aria-hidden />} value={votesReceived == null ? '—' : String(votesReceived)} label="Votos recibidos" />
        <StatTile icon={<MessageCircle className="h-4 w-4" aria-hidden />} value={comments == null ? '—' : String(comments)} label="Comentarios" />
        <StatTile icon={<CalendarDays className="h-4 w-4" aria-hidden />} value={String(counts.size)} label="Días activo" />
        <StatTile icon={<Users className="h-4 w-4" aria-hidden />} value="—" label="Seguidores" />
        <StatTile icon={<UserPlus className="h-4 w-4" aria-hidden />} value="—" label="Siguiendo" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,0.85fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Secciones del perfil">
            {(
              [
                { id: 'ofertas' as const, label: 'Ofertas', icon: Send },
                { id: 'actividad' as const, label: 'Actividad', icon: CalendarDays },
                { id: 'comentarios' as const, label: 'Comentarios', icon: MessageCircle },
              ]
            ).map((item) => {
              const selected = panel === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setPanel(item.id)}
                  className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-medium ${
                    selected ? 'border-violet-600 text-violet-600 dark:text-violet-400' : 'border-transparent text-[#6e6e73] dark:text-[#a3a3a3]'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>

          {panel === 'ofertas' ? (
            <section className="rounded-2xl border border-black/[0.04] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#141414] sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
                    <Send className="h-4 w-4 text-violet-600" aria-hidden />
                    Ofertas de {displayName}
                  </h2>
                  <p className="mt-0.5 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Todas las ofertas que ha compartido con la comunidad.</p>
                </div>
                <label className="shrink-0 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
                  <span className="sr-only">Ordenar ofertas</span>
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as Sort)}
                    className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[13px] dark:border-white/15 dark:bg-[#141414]"
                  >
                    <option value="recent">Más recientes</option>
                    <option value="votes">Más votadas</option>
                  </select>
                </label>
              </div>
              {visible.length === 0 ? (
                <p className="py-8 text-[15px] text-[#6e6e73] dark:text-[#a3a3a3]">Todavía no hay hallazgos públicos.</p>
              ) : (
                <ul className="mt-2">
                  {visible.map((offer) => {
                    const discount = offerDiscountPercent(offer.discountPrice ?? null, offer.originalPrice ?? null);
                    const price = offer.discountPrice != null && offer.discountPrice > 0 ? formatPriceMXN(offer.discountPrice) : null;
                    const status = statusMeta(offer.dealStatus);
                    const when = relativeTime(offer.createdAt);
                    const openable = offer.dealStatus === 'approved' || offer.dealStatus === 'expired';
                    return (
                      <li key={offer.id} className="border-b border-black/5 last:border-0 dark:border-white/10">
                        <div className="flex items-center gap-3 py-3">
                          <button
                            type="button"
                            disabled={!openable}
                            onClick={openable ? () => onOpenOffer(offer) : undefined}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            {offer.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={offer.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                            ) : (
                              <span className="h-14 w-14 shrink-0 rounded-xl bg-black/5 dark:bg-white/10" aria-hidden />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">{offer.title}</span>
                              <span className="mt-0.5 block truncate text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
                                {offer.store || 'Tienda'}
                                {price ? ` · ${price}` : ''}
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-2">
                                {discount != null ? (
                                  <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-semibold text-white">-{discount}%</span>
                                ) : null}
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.className}`}>{status.label}</span>
                              </span>
                              <span className="mt-1 flex items-center gap-3 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
                                <span className="inline-flex items-center gap-1">
                                  <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                                  {offer.upvotes == null ? '—' : offer.upvotes}
                                </span>
                                {when ? <span>{when}</span> : null}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={offer.isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                            disabled={savingId === offer.id}
                            onClick={() => void toggleFavorite(offer)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6e6e73] hover:bg-black/5 dark:text-[#a3a3a3] dark:hover:bg-white/10"
                          >
                            <Bookmark className={`h-4 w-4 ${offer.isFavorite ? 'fill-violet-600 text-violet-600' : ''}`} aria-hidden />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {sorted.length > 5 && !showAll ? (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="mt-3 flex w-full items-center justify-center rounded-xl bg-violet-50 py-3 text-[13px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                >
                  Ver todas sus ofertas →
                </button>
              ) : null}
            </section>
          ) : null}

          {panel === 'actividad' ? <ActivityCard activity={activity} years={years} year={selectedYear} onYear={setYear} /> : null}

          {panel === 'comentarios' ? (
            <section className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
              <h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Comentarios</h2>
              <p className="mt-2 text-[15px] text-[#6e6e73] dark:text-[#a3a3a3]">
                {comments == null
                  ? 'Los comentarios se leen dentro de cada oferta.'
                  : `${comments} comentarios en sus ofertas. Se leen dentro de cada oferta.`}
              </p>
            </section>
          ) : null}
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Nivel Aventa</h2>
              {levelHref ? (
                <Link href={levelHref} className="text-[13px] text-violet-600 dark:text-violet-400">
                  Ver niveles
                </Link>
              ) : null}
            </div>
            <p className="mt-1 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">No es el programa de recompensas.</p>
            <div className="mt-4 flex items-center gap-3">
              <div
                className="flex h-14 w-12 shrink-0 items-center justify-center bg-violet-600 text-lg font-semibold text-white"
                style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
                aria-hidden
              >
                {level}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{label}</p>
                <p className="mt-1 text-[13px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">{progressLine}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-violet-600" style={{ width: `${pct}%` }} />
                </div>
                {next ? <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Siguiente nivel: {next.label}</p> : null}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Logros de {displayName}</h2>
              {levelHref ? (
                <Link href={levelHref} className="text-[13px] text-violet-600 dark:text-violet-400">
                  Ver todos
                </Link>
              ) : null}
            </div>
            {logros.length === 0 ? (
              <p className="mt-4 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Todavía no hay logros públicos.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-3 gap-2">
                {logros.map((logro) => {
                  const Icon = logro.icon;
                  return (
                    <li key={logro.title} className="rounded-xl bg-violet-50 px-2 py-3 text-center dark:bg-violet-950">
                      <Icon className="mx-auto h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden />
                      <p className="mt-2 text-[12px] font-medium leading-tight text-[#1d1d1f] dark:text-[#fafafa]">{logro.title}</p>
                      <p className="mt-1 text-[11px] leading-tight text-[#6e6e73] dark:text-[#a3a3a3]">{logro.detail}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {panel !== 'actividad' ? <ActivityCard activity={activity} years={years} year={selectedYear} onYear={setYear} /> : null}
        </div>
      </div>
    </div>
  );
}

type YearActivity = {
  weeks: Array<Array<{ key: string; count: number; month: number } | null>>;
  monthLabels: Array<{ index: number; label: string }>;
  busiestMonth: string | null;
  busiestDay: string | null;
  longestStreak: number;
};

function buildYearActivity(year: number, counts: Map<string, number>): YearActivity {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const pad = start.getDay();
  const cells: Array<{ key: string; count: number; month: number } | null> = Array.from({ length: pad }, () => null);
  const byMonth = new Map<number, number>();
  let bestDay: { key: string; count: number } | null = null;
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = dayKey(cursor);
    const count = counts.get(key) ?? 0;
    const month = cursor.getMonth();
    cells.push({ key, count, month });
    if (count > 0) byMonth.set(month, (byMonth.get(month) ?? 0) + count);
    if (!bestDay || count > bestDay.count) bestDay = { key, count };
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: YearActivity['weeks'] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const monthLabels: Array<{ index: number; label: string }> = [];
  let lastMonth = -1;
  weeks.forEach((week, index) => {
    const day = week.find((item) => item);
    if (!day || day.month === lastMonth) return;
    lastMonth = day.month;
    monthLabels.push({ index, label: MONTHS[day.month] });
  });

  let longest = 0;
  let run = 0;
  for (const cell of cells) {
    if (cell && cell.count > 0) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (cell) {
      run = 0;
    }
  }

  let busiestMonth: string | null = null;
  let busiestCount = 0;
  for (const [month, count] of byMonth) {
    if (count > busiestCount) {
      busiestCount = count;
      busiestMonth = new Date(year, month, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    }
  }
  const busiestDay =
    bestDay && bestDay.count > 0
      ? new Date(`${bestDay.key}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
      : null;

  return { weeks, monthLabels, busiestMonth, busiestDay, longestStreak: longest };
}

function heatClass(count: number): string {
  if (count <= 0) return 'bg-violet-100/70 dark:bg-white/10';
  if (count === 1) return 'bg-violet-300';
  if (count === 2) return 'bg-violet-500';
  return 'bg-violet-700';
}

function ActivityCard({
  activity,
  years,
  year,
  onYear,
}: {
  activity: YearActivity;
  years: number[];
  year: number;
  onYear: (year: number) => void;
}) {
  return (
    <section className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Actividad</h2>
        <label>
          <span className="sr-only">Año</span>
          <select
            value={year}
            onChange={(event) => onYear(Number(event.target.value))}
            className="rounded-full border border-black/10 bg-white px-3 py-1 text-[13px] dark:border-white/15 dark:bg-[#141414]"
          >
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[280px]">
          <div className="mb-1 grid" style={{ gridTemplateColumns: `repeat(${activity.weeks.length}, minmax(0, 1fr))` }}>
            {activity.weeks.map((_, index) => {
              const label = activity.monthLabels.find((item) => item.index === index);
              return (
                <span key={index} className="h-4 text-[10px] text-[#6e6e73] dark:text-[#a3a3a3]">
                  {label?.label ?? ''}
                </span>
              );
            })}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ gridAutoColumns: 'minmax(8px, 1fr)' }}>
            {activity.weeks.flatMap((week, column) =>
              week.map((day, row) => (
                <span
                  key={day?.key ?? `pad-${column}-${row}`}
                  title={day ? `${day.key}: ${day.count}` : undefined}
                  className={`aspect-square rounded-[2px] ${day ? heatClass(day.count) : 'bg-transparent'}`}
                />
              )),
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-[11px] text-[#6e6e73] dark:text-[#a3a3a3]">
        <span>Menos</span>
        <span className="h-2.5 w-2.5 rounded-[2px] bg-violet-100 dark:bg-white/10" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-violet-300" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-violet-500" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-violet-700" />
        <span>Más</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
        <p>
          <span className="block font-medium capitalize text-[#1d1d1f] dark:text-[#fafafa]">{activity.busiestMonth ?? '—'}</span>
          <span className="text-[#6e6e73] dark:text-[#a3a3a3]">Mes más activo</span>
        </p>
        <p>
          <span className="block font-medium text-[#1d1d1f] dark:text-[#fafafa]">{activity.busiestDay ?? '—'}</span>
          <span className="text-[#6e6e73] dark:text-[#a3a3a3]">Día de mayor actividad</span>
        </p>
        <p>
          <span className="block font-medium text-[#1d1d1f] dark:text-[#fafafa]">{activity.longestStreak} días</span>
          <span className="text-[#6e6e73] dark:text-[#a3a3a3]">Racha más larga</span>
        </p>
      </div>
    </section>
  );
}
