'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Bookmark,
  CalendarDays,
  Camera,
  Check,
  Crown,
  Info,
  Loader2,
  Send,
  MessageCircle,
  Share2,
  ThumbsUp,
  Trophy,
  User,
} from 'lucide-react';
import { REPUTATION_LEVELS, getReputationLabel } from '@/lib/reputation';
import { ALL_CATEGORIES } from '@/lib/categories';
import { offerDiscountPercent } from '@/lib/me/offerPresentation';
import { applyFavoriteToggle } from '@/lib/offers/applyFavoriteToggle';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';
import { requestGuestSignIn } from '@/lib/auth/guestAccessPrompt';
import AchievementSigil from '@/app/components/achievements/AchievementSigil';
import { MAX_FEATURED_ACHIEVEMENTS } from '@/lib/achievements/types';
import OfferMedia from '@/app/components/offers/OfferMedia';
import HunterActivityBoard from '@/app/me/dashboard/HunterActivityBoard';
import { achievementByCode } from '@/lib/achievements/catalog';

const HERO_FEATURED_LIMIT = MAX_FEATURED_ACHIEVEMENTS;

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
  category?: string | null;
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
  bio?: string | null;
  location?: string | null;
  coverUrl?: string | null;
  joinedAt?: string | null;
  trusted?: boolean;
  activityVisible?: boolean;
  levelHref?: string | null;
  showcase?: Array<{ code?: string; name: string; icon: string }>;
  showcaseLoading?: boolean;
  unlockedPreview?: Array<{ code?: string; name: string; icon: string }>;
  showcaseChoices?: Array<{ code: string; name: string; icon: string }>;
  onSaveShowcase?: (codes: string[]) => Promise<string | null>;
  owner?: PublicProfileOwnerActions | null;
  onOpenOffer: (offer: PublicProfileOffer) => void;
  onFavoriteChange?: (offerId: string, isFavorite: boolean) => void;
};

export type PublicProfileOwnerActions = {
  onPickAvatar: () => void;
  avatarUploading: boolean;
  onPickCover?: () => void;
  coverUploading?: boolean;
  achievementsHref: string;
  onOpenAchievements?: () => void;
};

type Panel = 'ofertas' | 'actividad' | 'logros' | 'listas' | 'sobre';
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
  if (status === 'approved') return { label: 'Aprobada', className: 'bg-emerald-500 text-white' };
  if (status === 'pending') return { label: 'En revisión', className: 'bg-amber-400 text-[#1a1204]' };
  if (status === 'expired') return { label: 'Expirada', className: 'bg-[var(--me-chip)] text-[var(--me-ink)]' };
  return { label: 'Rechazada', className: 'bg-rose-500 text-white' };
}

function categoryName(value: string): string {
  return ALL_CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

function BannerStat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex min-w-[7.5rem] items-center gap-2 rounded-2xl border border-[var(--me-line)] bg-black/25 px-3 py-3">
      <span className="text-violet-700 dark:text-violet-200">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[18px] font-semibold tabular-nums leading-none">{value}</span>
        <span className="mt-1 block text-[11px] leading-tight text-[var(--me-muted)]">{label}</span>
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
  bio = null,
  location = null,
  coverUrl = null,
  joinedAt = null,
  activityVisible = true,
  levelHref,
  showcase = [],
  showcaseLoading = false,
  unlockedPreview = [],
  showcaseChoices = [],
  onSaveShowcase,
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pickerSaving, setPickerSaving] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerSaved, setPickerSaved] = useState(false);

  function openPicker() {
    const current = showcase.map((item) => item.code).filter((code): code is string => Boolean(code));
    setPicked(current);
    setPickerError(null);
    setPickerSaved(false);
    setPickerOpen(true);
  }

  function togglePicked(code: string) {
    setPickerSaved(false);
    setPicked((current) => {
      if (current.includes(code)) return current.filter((item) => item !== code);
      if (current.length >= MAX_FEATURED_ACHIEVEMENTS) return current;
      return [...current, code];
    });
  }

  async function savePicked() {
    if (!onSaveShowcase) return;
    setPickerSaving(true);
    setPickerError(null);
    const error = await onSaveShowcase(picked);
    setPickerSaving(false);
    if (error) {
      setPickerError(error);
      return;
    }
    setPickerSaved(true);
    setPickerOpen(false);
  }

  const published = useMemo(
    () => offers.filter((offer) => offer.dealStatus === 'approved' || offer.dealStatus === 'expired'),
    [offers],
  );

  const sorted = [...offers].sort((a, b) => {
    if (sort === 'votes') return (b.upvotes ?? 0) - (a.upvotes ?? 0);
    return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
  });
  const visible = showAll ? sorted : sorted.slice(0, 5);

  const label = getReputationLabel(level);
  const next = REPUTATION_LEVELS.find((item) => item.level === level + 1);
  const pct = next ? Math.min(100, Math.floor((score / next.minScore) * 100)) : 100;
  const progressLine = next ? `${score} / ${next.minScore} puntos` : `${score} puntos`;
  const remaining = next ? Math.max(0, next.minScore - score) : 0;
  const joined = joinedAt ? new Date(joinedAt) : null;
  const joinedYear = joined && !Number.isNaN(joined.getTime()) ? joined.getFullYear() : null;
  const categoryValues = [...new Set(offers.map((offer) => offer.category).filter((value): value is string => Boolean(value)))];
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

  const activitySource = owner ? offers : published;
  const activeDays = new Set(
    activitySource
      .map((offer) => {
        if (!offer.createdAt) return null;
        const date = new Date(offer.createdAt);
        return Number.isNaN(date.getTime()) ? null : dayKey(date);
      })
      .filter((key): key is string => Boolean(key)),
  ).size;
  const shownCategories = categoryValues.slice(0, 3);
  const sigils = (featured.length > 0 ? featured : unlockedPreview).slice(0, 4);

  return (
    <div className="space-y-4">
      <section aria-label={`Perfil de ${displayName}`} className="relative overflow-hidden rounded-[28px] border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none text-[var(--me-ink)]">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25" />
        ) : null}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -right-8 top-6 h-40 w-56 rotate-12 rounded-4xl bg-violet-600/30" />
          <div className="absolute right-24 top-16 h-28 w-40 -rotate-6 rounded-4xl bg-fuchsia-700/25" />
          <p className="absolute right-8 top-8 hidden text-right text-[22px] font-medium italic leading-tight text-violet-700 dark:text-violet-200/80 sm:block">
            Cazar
            <span className="block">Comparar</span>
            <span className="block">Ahorrar</span>
          </p>
          <div
            className="absolute right-44 top-6 hidden h-16 w-16 items-center justify-center bg-violet-400/70 text-white shadow-[0_0_24px_rgba(167,139,250,0.55)] lg:flex"
            style={{ clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}
          >
            <Crown className="h-6 w-6" />
          </div>
        </div>
        <div className="relative p-4 sm:p-6">
          <div className="mb-4 flex justify-end gap-2">
            {owner?.onPickCover ? (
              <button
                type="button"
                onClick={owner.onPickCover}
                disabled={owner.coverUploading}
                className="inline-flex min-h-10 items-center rounded-full border border-[var(--me-line)] bg-white px-3 text-[13px] font-medium text-[var(--me-ink)] shadow-sm disabled:opacity-50 dark:bg-black/30 dark:shadow-none"
              >
                {owner.coverUploading ? 'Subiendo portada…' : 'Cambiar portada'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void copyLink()}
              disabled={!sharePath}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--me-line)] bg-white px-3 text-[13px] font-medium text-[var(--me-ink)] shadow-sm hover:bg-[var(--me-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-50 dark:bg-black/30 dark:shadow-none"
            >
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
              {copied ? 'Copiado' : 'Compartir perfil'}
            </button>
          </div>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24">
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-violet-950 ring-2 ring-violet-300/40">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={`Foto de perfil de ${displayName}`} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-8 w-8" aria-hidden />
                  )}
                </div>
                {owner ? (
                  <button
                    type="button"
                    onClick={owner.onPickAvatar}
                    disabled={owner.avatarUploading}
                    aria-busy={owner.avatarUploading}
                    aria-label={owner.avatarUploading ? 'Subiendo foto de perfil' : 'Cambiar foto de perfil'}
                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-60"
                  >
                    {owner.avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
                  </button>
                ) : null}
              </div>
              <div className="min-w-0">
                <h1 className="break-words text-[28px] font-semibold leading-none sm:text-[34px]">
                  {displayName}
                </h1>
                {bio ? <p className="mt-2 max-w-xl whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--me-ink)]">{bio}</p> : null}
                {location ? <p className="mt-2 text-[14px] text-[var(--me-muted)]">{location}</p> : null}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--me-muted)]">
                  {joinedYear ? <span>Se unió en {joinedYear}</span> : null}
                  {sharePath ? (
                    <Link href={sharePath} className="break-all text-violet-700 hover:underline dark:text-violet-300">
                      {sharePath}
                    </Link>
                  ) : handle ? (
                    <span className="break-all">@{handle}</span>
                  ) : null}
                  <span>Nivel {level} · {label}</span>
                </p>
                {shownCategories.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {shownCategories.map((value) => (
                      <span key={value} className="rounded-full border border-[var(--me-line)] bg-[var(--me-chip)] px-3 py-1 text-[12px] text-[var(--me-ink)]">
                        {categoryName(value)}
                      </span>
                    ))}
                    {categoryValues.length > shownCategories.length ? (
                      <span className="rounded-full border border-[var(--me-line)] px-3 py-1 text-[12px] text-[var(--me-muted)]">Más categorías</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            {activityVisible ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-xl">
                <BannerStat icon={<Send className="h-4 w-4" aria-hidden />} value={String(offers.length)} label="Ofertas publicadas" />
                <BannerStat icon={<ThumbsUp className="h-4 w-4" aria-hidden />} value={votesReceived == null ? '—' : String(votesReceived)} label="Votos recibidos" />
                <BannerStat icon={<MessageCircle className="h-4 w-4" aria-hidden />} value={comments == null ? '—' : String(comments)} label="Comentarios" />
                <BannerStat icon={<CalendarDays className="h-4 w-4" aria-hidden />} value={String(activeDays)} label="Días activo" />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {activityVisible ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.8fr)]">
          <div className="min-w-0 space-y-4">
            <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-2 [scrollbar-width:none]" role="tablist" aria-label="Secciones del perfil">
              {(
                [
                  { id: 'ofertas' as const, label: 'Ofertas', icon: Send },
                  { id: 'actividad' as const, label: 'Actividad', icon: CalendarDays },
                  { id: 'logros' as const, label: 'Logros', icon: Trophy },
                  { id: 'listas' as const, label: 'Listas', icon: Bookmark },
                  { id: 'sobre' as const, label: 'Sobre mí', icon: Info },
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
                    className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                      selected ? 'bg-[var(--me-chip)] text-[var(--me-ink)]' : 'text-[var(--me-muted)] hover:bg-[var(--me-soft)] hover:text-[var(--me-ink)]'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {item.label}
                  </button>
                );
              })}
            </div>

            {panel === 'ofertas' ? (
              <section className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-4 text-[var(--me-ink)] sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-[17px] font-semibold">
                      <Send className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden />
                      Últimas ofertas
                    </h2>
                    <p className="mt-0.5 text-[13px] text-[var(--me-muted)]">Todas las ofertas que ha compartido con la comunidad.</p>
                  </div>
                  <label className="shrink-0 text-[13px] text-[var(--me-muted)]">
                    <span className="sr-only">Ordenar ofertas</span>
                    <select
                      value={sort}
                      onChange={(event) => setSort(event.target.value as Sort)}
                      className="min-h-11 rounded-full border border-[var(--me-line)] bg-[var(--me-soft)] px-3 text-[13px] text-[var(--me-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:min-h-9"
                    >
                      <option value="recent">Más recientes</option>
                      <option value="votes">Más votadas</option>
                    </select>
                  </label>
                </div>
                {visible.length === 0 ? (
                  <p className="mt-6 text-[14px] text-[var(--me-muted)]">Todavía no hay hallazgos públicos. Cuando una oferta de {displayName} se apruebe, aparecerá aquí.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-[var(--me-line)]">
                    {visible.map((offer) => {
                      const discount = offerDiscountPercent(offer.discountPrice ?? null, offer.originalPrice ?? null);
                      const status = statusMeta(offer.dealStatus);
                      const when = relativeTime(offer.createdAt);
                      const openable = offer.dealStatus === 'approved' || offer.dealStatus === 'expired';
                      return (
                        <li key={offer.id} className="flex items-center gap-3 py-3">
                          <button
                            type="button"
                            disabled={!openable}
                            onClick={openable ? () => onOpenOffer(offer) : undefined}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-default"
                          >
                            <OfferMedia src={offer.image} alt="" sizes="56px" ratioClass="aspect-square" compact className="h-14 w-14 shrink-0 rounded-xl" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-medium">{offer.title}</span>
                              <span className="mt-0.5 block truncate text-[12px] text-[var(--me-muted)]">
                                {offer.store || 'Tienda'}
                                {offer.category ? ` · ${categoryName(offer.category)}` : ''}
                              </span>
                              {when ? <span className="mt-0.5 block text-[12px] text-[var(--me-faint)]">{when}</span> : null}
                            </span>
                            <span className="hidden shrink-0 items-center gap-2 sm:flex">
                              {discount != null ? <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-semibold">-{discount}%</span> : null}
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>{status.label}</span>
                            </span>
                            <span className="hidden items-center gap-1 text-[13px] text-[var(--me-muted)] md:inline-flex">
                              <ThumbsUp className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" aria-hidden />
                              {offer.upvotes == null ? '—' : offer.upvotes}
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={offer.isFavorite ? `Quitar ${offer.title} de favoritos` : `Guardar ${offer.title} en favoritos`}
                            aria-pressed={Boolean(offer.isFavorite)}
                            aria-busy={savingId === offer.id}
                            disabled={savingId === offer.id}
                            onClick={() => void toggleFavorite(offer)}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--me-muted)] hover:bg-[var(--me-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-60"
                          >
                            <Bookmark className={`h-4 w-4 ${offer.isFavorite ? 'fill-violet-400 text-violet-600 dark:text-violet-300' : ''}`} aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {sorted.length > 5 && !showAll ? (
                  <button type="button" onClick={() => setShowAll(true)} className="mt-3 min-h-11 w-full rounded-xl bg-[var(--me-soft)] text-[13px] font-medium text-violet-700 dark:text-violet-200 hover:bg-[var(--me-soft)]">
                    Ver todas sus ofertas →
                  </button>
                ) : null}
              </section>
            ) : null}

            {panel === 'actividad' ? <HunterActivityBoard dates={activitySource.map((offer) => offer.createdAt)} tone="night" /> : null}

            {panel === 'logros' ? (
              <section className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-5 text-[var(--me-ink)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[17px] font-semibold">Logros</h2>
                  {owner && onSaveShowcase ? (
                    <button type="button" onClick={openPicker} className="text-[13px] font-medium text-violet-600 dark:text-violet-300">Elegir logros</button>
                  ) : null}
                </div>
                {sigils.length === 0 ? (
                  <p className="mt-3 text-[14px] text-[var(--me-muted)]">
                    {owner ? 'Cuando consigas logros podrás elegir cuáles mostrar aquí.' : 'Todavía no hay logros visibles.'}
                  </p>
                ) : (
                  <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {sigils.map((logro) => (
                      <li key={logro.code ?? logro.name} className="text-center">
                        <div className="flex justify-center"><AchievementSigil code={logro.code} size="md" /></div>
                        <p className="mt-2 line-clamp-2 text-[12px] text-[var(--me-muted)]">{logro.name}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {panel === 'listas' ? (
              <section className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-5 text-[var(--me-ink)]">
                <h2 className="text-[17px] font-semibold">Listas</h2>
                <p className="mt-2 text-[14px] text-[var(--me-muted)]">Aún no hay listas públicas.</p>
              </section>
            ) : null}

            {panel === 'sobre' ? (
              <section className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-5 text-[var(--me-ink)]">
                <h2 className="text-[17px] font-semibold">Sobre mí</h2>
                {bio ? <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--me-ink)]">{bio}</p> : <p className="mt-3 text-[14px] text-[var(--me-muted)]">Todavía no hay una presentación.</p>}
                {location ? <p className="mt-3 text-[14px] text-[var(--me-muted)]">{location}</p> : null}
                {joinedYear ? <p className="mt-2 text-[13px] text-[var(--me-muted)]">Se unió en {joinedYear}</p> : null}
              </section>
            ) : null}
          </div>

          <div className="space-y-4">
            <section aria-label="Nivel base de Aventa" className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-5 text-[var(--me-ink)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold">Nivel Aventa</h2>
                {levelHref ? <Link href={levelHref} className="text-[13px] text-violet-600 dark:text-violet-300">Ver todos</Link> : null}
              </div>
              <p className="mt-1 text-[12px] text-[var(--me-muted)]">No es el programa de recompensas.</p>
              <div className="mt-4 flex items-center gap-3">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center bg-linear-to-br from-violet-400 to-fuchsia-600 shadow-[0_0_18px_rgba(168,85,247,0.45)]"
                  style={{ clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}
                  aria-hidden
                >
                  <Crown className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold">Nivel {level} · {label}</p>
                  <p className="mt-1 text-[13px] tabular-nums text-[var(--me-muted)]">{progressLine}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--me-chip)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[12px] tabular-nums text-[var(--me-muted)]">{pct}%</span>
                  </div>
                </div>
              </div>
              {next ? (
                <p className="mt-3 text-[13px] text-[var(--me-muted)]">
                  <span className="block text-[var(--me-ink)]">Siguiente: {next.label}</span>
                  <span className="block text-[12px] text-[var(--me-muted)]">Te faltan {remaining} puntos.</span>
                </p>
              ) : (
                <p className="mt-3 text-[13px] text-[var(--me-muted)]">Este es el nivel más alto de Aventa.</p>
              )}
            </section>

            <section className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-5 text-[var(--me-ink)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold">Logros</h2>
                {owner ? (
                  <Link href={owner.achievementsHref} onClick={owner.onOpenAchievements} className="text-[13px] text-violet-600 dark:text-violet-300">Ver todos</Link>
                ) : null}
              </div>
              {sigils.length === 0 ? (
                <p className="mt-3 text-[13px] text-[var(--me-muted)]">Todavía no hay logros visibles.</p>
              ) : (
                <ul className="mt-4 grid grid-cols-4 gap-2">
                  {sigils.map((logro) => (
                    <li key={`side-${logro.code ?? logro.name}`} className="min-w-0 text-center">
                      <div className="flex justify-center"><AchievementSigil code={logro.code} size="sm" /></div>
                      <p className="mt-2 line-clamp-2 text-[11px] leading-tight text-[var(--me-muted)]">{logro.name}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {panel !== 'actividad' ? <HunterActivityBoard dates={activitySource.map((offer) => offer.createdAt)} tone="night" /> : null}
          </div>
        </div>
      ) : null}

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="presentation" onClick={() => setPickerOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="showcase-picker-title"
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-[#141414]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="showcase-picker-title" className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Logros en tu perfil</h2>
            <p className="mt-1 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Elige hasta {MAX_FEATURED_ACHIEVEMENTS}. Solo se guardan logros que ya conseguiste.</p>
            {showcaseChoices.length === 0 ? (
              <p className="mt-4 text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">Todavía no hay logros desbloqueados para mostrar.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {showcaseChoices.map((logro) => {
                  const on = picked.includes(logro.code);
                  const blocked = !on && picked.length >= MAX_FEATURED_ACHIEVEMENTS;
                  return (
                    <li key={logro.code}>
                      <button
                        type="button"
                        disabled={blocked}
                        aria-pressed={on}
                        onClick={() => togglePicked(logro.code)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${on ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40' : 'border-black/10 dark:border-[var(--me-line)]'} disabled:opacity-40`}
                      >
                        <AchievementSigil code={logro.code} size="sm" />
                        <span className="min-w-0 flex-1 text-[14px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">{logro.name}</span>
                        {on ? <Check className="h-4 w-4 text-violet-600" aria-hidden /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {pickerError ? <p className="mt-3 text-[13px] text-red-600">{pickerError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPickerOpen(false)} className="min-h-11 rounded-full px-4 text-[13px] font-medium text-[#6e6e73]">Cancelar</button>
              <button type="button" disabled={pickerSaving || !onSaveShowcase} onClick={() => void savePicked()} className="inline-flex min-h-11 items-center rounded-full bg-violet-600 px-4 text-[13px] font-semibold text-white disabled:opacity-50">
                {pickerSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                Guardar
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {pickerSaved ? <p className="sr-only">Logros guardados en el perfil público.</p> : null}
    </div>
  );
}
