'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  CalendarDays,
  Camera,
  Check,
  Loader2,
  MessageCircle,
  Send,
  Share2,
  ThumbsUp,
  User,
} from 'lucide-react';
import { REPUTATION_LEVELS, getReputationLabel, getReputationProgress } from '@/lib/reputation';
import { formatPriceMXN } from '@/lib/formatPrice';
import { offerDiscountPercent } from '@/lib/me/offerPresentation';
import { applyFavoriteToggle } from '@/lib/offers/applyFavoriteToggle';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';
import { requestGuestSignIn } from '@/lib/auth/guestAccessPrompt';
import AchievementSigil from '@/app/components/achievements/AchievementSigil';
import OfferMedia from '@/app/components/offers/OfferMedia';
import HunterActivityBoard from '@/app/me/dashboard/HunterActivityBoard';
import { achievementByCode } from '@/lib/achievements/catalog';

const HERO_FEATURED_LIMIT = 4;

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
  showcase?: Array<{ code?: string; name: string; icon: string }>;
  showcaseLoading?: boolean;
  unlockedPreview?: Array<{ code?: string; name: string; icon: string }>;
  owner?: PublicProfileOwnerActions | null;
  onOpenOffer: (offer: PublicProfileOffer) => void;
  onFavoriteChange?: (offerId: string, isFavorite: boolean) => void;
};

export type PublicProfileOwnerActions = {
  onPickAvatar: () => void;
  avatarUploading: boolean;
  achievementsHref: string;
  onOpenAchievements?: () => void;
};

type Panel = 'ofertas' | 'actividad' | 'comentarios';
type Sort = 'recent' | 'votes';

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
        <span className="mt-1 line-clamp-2 block text-[12px] leading-tight text-[#6e6e73] dark:text-[#a3a3a3]">{label}</span>
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
  showcase = [],
  showcaseLoading = false,
  unlockedPreview = [],
  owner = null,
  onOpenOffer,
  onFavoriteChange,
}: PublicProfileViewProps) {
  const { session } = useAuth();
  const { showToast, openRegisterModal } = useUI();
  const [panel, setPanel] = useState<Panel>('ofertas');
  const [sort, setSort] = useState<Sort>('recent');
  const [showAll, setShowAll] = useState(false);
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
  const featured = showcase.slice(0, HERO_FEATURED_LIMIT).map((logro) => ({
    ...logro,
    xp: logro.code ? achievementByCode(logro.code)?.xpReward ?? null : null,
  }));

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
    else showToast('No se pudo actualizar tus favoritos. Inténtalo de nuevo.');
  };

  return (
    <div className="space-y-4">
      <section aria-label={`Perfil de ${displayName}`} className="overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-sm dark:border-white/10 dark:bg-[#141414]">
        <div className="relative h-36 overflow-hidden bg-gradient-to-r from-[#5b4dff] via-[#c44bd4] to-[#ffb067] sm:h-48 lg:h-56">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover opacity-70 blur-[2px]" />
          ) : null}
        </div>
        <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="flex items-end justify-between gap-3">
            <div className="relative -mt-12 h-24 w-24 shrink-0 sm:-mt-14 sm:h-28 sm:w-28">
              <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#1d1d1f] shadow-sm dark:border-[#141414]">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={`Foto de perfil de ${displayName}`} className="h-full w-full object-cover" />
                ) : (
                  <User className="h-9 w-9 text-white" aria-hidden />
                )}
              </div>
              {owner ? (
                <button
                  type="button"
                  onClick={owner.onPickAvatar}
                  disabled={owner.avatarUploading}
                  aria-busy={owner.avatarUploading}
                  aria-label={owner.avatarUploading ? 'Subiendo foto de perfil' : 'Cambiar foto de perfil'}
                  className="group absolute inset-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 disabled:cursor-wait dark:focus-visible:ring-offset-[#141414]"
                >
                  <span
                    className={`absolute inset-1 flex items-center justify-center rounded-full bg-black/55 text-white transition-opacity duration-150 ${
                      owner.avatarUploading
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100'
                    }`}
                    aria-hidden
                  >
                    {owner.avatarUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                  </span>
                  {owner.avatarUploading ? null : (
                    <span
                      className="absolute bottom-0.5 right-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-white shadow-sm transition-colors duration-150 group-hover:bg-violet-700 dark:border-[#141414]"
                      aria-hidden
                    >
                      <Camera className="h-4 w-4" />
                    </span>
                  )}
                </button>
              ) : null}
            </div>
            <div className="mb-1 flex items-center">
              <button
                type="button"
                onClick={() => void copyLink()}
                disabled={!sharePath}
                aria-label={copied ? 'Enlace del perfil copiado' : 'Copiar enlace del perfil'}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-600 px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-[#141414] sm:min-h-10"
              >
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
                {copied ? 'Copiado' : 'Compartir'}
              </button>
            </div>
          </div>
          <h1 className="mt-3 break-words text-[26px] font-semibold leading-tight text-[#1d1d1f] dark:text-[#fafafa] sm:text-[28px]">{displayName}</h1>
          {handle ? <p className="mt-0.5 break-all text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">@{handle}</p> : null}

          {featured.length > 0 ? (
            <div className="mt-5 border-t border-black/5 pt-4 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#6e6e73] dark:text-[#a3a3a3]">Logros destacados</h2>
                {owner ? (
                  <Link
                    href={owner.achievementsHref}
                    onClick={owner.onOpenAchievements}
                    className="-my-3 inline-flex min-h-11 items-center rounded-lg px-1 text-[13px] font-medium text-violet-600 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400 dark:hover:text-violet-300"
                  >
                    Ver todos →
                  </Link>
                ) : null}
              </div>
              <ul className="-mx-4 mt-3 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0">
                {featured.map((logro) => (
                  <li
                    key={logro.code ?? logro.name}
                    className="flex min-w-[10.5rem] snap-start items-center gap-2.5 rounded-xl border border-black/[0.04] bg-[#f5f5f7] px-2.5 py-2.5 dark:border-white/10 dark:bg-white/[0.04] sm:min-w-0"
                  >
                    <AchievementSigil code={logro.code} size="sm" />
                    <span className="min-w-0">
                      <span className="line-clamp-2 block text-[13px] font-medium leading-tight text-[#1d1d1f] dark:text-[#fafafa]">{logro.name}</span>
                      {logro.xp != null ? (
                        <span className="mt-0.5 block text-[12px] font-medium tabular-nums text-violet-600 dark:text-violet-400">+{logro.xp} XP</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : owner && !showcaseLoading ? (
            <div className="mt-5 flex flex-col gap-3 rounded-xl border border-dashed border-black/10 px-4 py-3.5 dark:border-white/15 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
                  {unlockedPreview.length > 0
                    ? 'Ya tienes logros conseguidos, pero los visitantes aún no los ven. Elige cuáles mostrar aquí. Solo tú ves este aviso.'
                    : 'Cuando consigas logros podrás elegir cuáles mostrar aquí. Solo tú ves este aviso.'}
                </p>
                {unlockedPreview.length > 0 ? (
                  <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Logros conseguidos, aún no visibles para otros">
                    {unlockedPreview.map((logro) => (
                      <li
                        key={logro.code ?? logro.name}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#f5f5f7] py-1 pl-1 pr-2.5 text-[12px] font-medium text-[#1d1d1f] dark:bg-white/[0.06] dark:text-[#fafafa]"
                      >
                        <AchievementSigil code={logro.code} size="xs" />
                        <span className="truncate">{logro.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <Link
                href={owner.achievementsHref}
                onClick={owner.onOpenAchievements}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-violet-200 px-4 text-[13px] font-semibold text-violet-700 transition-colors duration-150 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950 sm:min-h-10"
              >
                Elegir logros
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={<Send className="h-4 w-4" aria-hidden />} value={String(published.length)} label="Ofertas publicadas" />
        <StatTile icon={<ThumbsUp className="h-4 w-4" aria-hidden />} value={votesReceived == null ? '—' : String(votesReceived)} label="Votos recibidos" />
        <StatTile icon={<MessageCircle className="h-4 w-4" aria-hidden />} value={comments == null ? '—' : String(comments)} label="Comentarios" />
        <StatTile icon={<CalendarDays className="h-4 w-4" aria-hidden />} value={String(counts.size)} label="Días activo" />
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
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 ${
                    selected
                      ? 'border-violet-600 text-violet-600 dark:text-violet-400'
                      : 'border-transparent text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#a3a3a3] dark:hover:text-[#fafafa]'
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
                    className="min-h-11 rounded-full border border-black/10 bg-white px-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-white/15 dark:bg-[#141414] sm:min-h-9"
                  >
                    <option value="recent">Más recientes</option>
                    <option value="votes">Más votadas</option>
                  </select>
                </label>
              </div>
              {visible.length === 0 ? (
                <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-black/10 px-6 py-10 text-center dark:border-white/15">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
                    <Send className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-3 text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Todavía no hay hallazgos públicos</p>
                  <p className="mt-1 max-w-xs text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
                    Cuando una oferta de {displayName} se apruebe, aparecerá aquí.
                  </p>
                </div>
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
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-default"
                          >
                            <OfferMedia
                              src={offer.image}
                              alt=""
                              sizes="56px"
                              ratioClass="aspect-square"
                              compact
                              className="h-14 w-14 shrink-0 rounded-xl"
                            />
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
                            aria-label={offer.isFavorite ? `Quitar ${offer.title} de favoritos` : `Guardar ${offer.title} en favoritos`}
                            aria-pressed={Boolean(offer.isFavorite)}
                            aria-busy={savingId === offer.id}
                            disabled={savingId === offer.id}
                            onClick={() => void toggleFavorite(offer)}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#6e6e73] transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-60 dark:text-[#a3a3a3] dark:hover:bg-white/10 md:h-9 md:w-9"
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
                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-violet-50 text-[13px] font-medium text-violet-700 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:bg-violet-950 dark:text-violet-300 dark:hover:bg-violet-900"
                >
                  Ver todas sus ofertas →
                </button>
              ) : null}
            </section>
          ) : null}

          {panel === 'actividad' ? <HunterActivityBoard dates={published.map((offer) => offer.createdAt)} /> : null}

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
                <Link
                  href={levelHref}
                  className="-my-3 inline-flex min-h-11 items-center rounded-lg px-1 text-[13px] text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400"
                >
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

          {panel !== 'actividad' ? <HunterActivityBoard dates={published.map((offer) => offer.createdAt)} /> : null}
        </div>
      </div>
    </div>
  );
}
