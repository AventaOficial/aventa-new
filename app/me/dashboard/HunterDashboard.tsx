'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bookmark, Eye, MessageCircle, Search, Send, Tag, ThumbsUp } from 'lucide-react';
import HunterHeader from '@/app/me/dashboard/HunterHeader';
import HunterActivityBoard from '@/app/me/dashboard/HunterActivityBoard';
import HunterFirstHunt from '@/app/me/dashboard/HunterFirstHunt';
import AchievementCollection from '@/app/components/achievements/AchievementCollection';
import { buildOfferPublicPath } from '@/lib/offerPath';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';

type HunterOffer = {
  id: string;
  title: string;
  dealStatus: DealStatus;
  discountPrice?: number | null;
  originalPrice?: number | null;
  image?: string | null;
  store?: string | null;
  sourceCurrency?: string | null;
  createdAt?: string | null;
  upvotes?: number | null;
  views?: number | null;
};

type HunterDashboardProps = {
  displayName: string;
  avatarUrl: string | null;
  level: number;
  score: number;
  publicHref: string | null;
  avatarUploading: boolean;
  onPickAvatar: () => void;
  onPublish: () => void;
  published: number;
  approved: number;
  pending: number;
  rejected: number;
  expired: number;
  positiveVotes: number | null;
  comments: number | null;
  views: number | null;
  saved: number | null;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  joinedAt?: string | null;
  trusted?: boolean;
  offers: HunterOffer[];
};

const STATUS_LABEL: Record<DealStatus, string> = {
  approved: 'Aprobada',
  pending: 'En revisión',
  rejected: 'Rechazada',
  expired: 'Expirada',
};

function Spark({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 72 28" className="h-7 w-16 shrink-0" aria-hidden>
      <path d="M2 20 C12 18 16 8 26 12 C36 16 40 6 50 8 C58 10 62 4 70 6" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function ago(iso: string | null | undefined): string | null {
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
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function countText(value: number | null | undefined): string {
  return value == null ? '—' : String(value);
}

function StatCard({
  icon,
  value,
  label,
  href,
  detail,
  spark,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  href: string;
  detail?: string;
  spark: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-full min-h-11 items-center gap-3 rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none px-4 py-4 text-[var(--me-ink)] hover:bg-[#f4f1fb] dark:hover:bg-[#1a1030] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-200">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[28px] font-semibold tabular-nums leading-none tracking-tight">{value}</span>
        <span className="mt-1 block text-[13px] font-medium text-[var(--me-ink)]">{label}</span>
        {detail ? <span className="mt-1 block text-[11px] font-medium text-emerald-600 dark:text-emerald-400">{detail}</span> : null}
      </span>
      <Spark color={spark} />
    </Link>
  );
}

function ImpactStat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card-2)] text-[var(--me-ink)] p-3">
      <span className="text-violet-600 dark:text-violet-300">{icon}</span>
      <p className="mt-2 text-[22px] font-semibold tabular-nums leading-none text-[var(--me-ink)]">{value}</p>
      <p className="mt-1 text-[12px] text-[var(--me-muted)]">{label}</p>
    </div>
  );
}

function RecentOffers({ offers }: { offers: HunterOffer[] }) {
  const recent = offers.slice(0, 4);
  return (
    <section className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-4 text-[var(--me-ink)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Ofertas recientes</h2>
        <Link href="/me/ofertas" className="inline-flex items-center gap-1 text-[13px] text-violet-600 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-200">
          Ver todas
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="mt-4 text-[13px] text-[var(--me-muted)]">Todavía no has publicado ofertas.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--me-line)]">
          {recent.map((offer) => {
            const tone =
              offer.dealStatus === 'approved'
                ? 'bg-emerald-500 text-white'
                : offer.dealStatus === 'pending'
                  ? 'bg-amber-400 text-[#1a1204]'
                  : offer.dealStatus === 'rejected'
                    ? 'bg-rose-500 text-white'
                    : 'bg-[var(--me-chip)] text-[var(--me-ink)]';
            return (
              <li key={offer.id} className="flex items-center gap-3 py-3">
                <Link href={buildOfferPublicPath(offer.id, offer.title)} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[var(--me-soft)]">
                    {offer.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={offer.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[var(--me-faint)]">
                        <Tag className="h-4 w-4" aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{offer.title}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-[var(--me-muted)]">
                      {offer.store ?? 'Tienda'}
                      {ago(offer.createdAt) ? ` · ${ago(offer.createdAt)}` : ''}
                    </span>
                  </span>
                </Link>
                <span className={`hidden shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold sm:inline-flex ${tone}`}>
                  {STATUS_LABEL[offer.dealStatus]}
                </span>
                <span className="hidden items-center gap-3 text-[12px] text-[var(--me-muted)] lg:flex">
                  <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" aria-hidden />{countText(offer.views)}</span>
                  <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" aria-hidden />{countText(offer.upvotes)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function HunterDashboard(props: HunterDashboardProps) {
  const router = useRouter();
  const dates = props.offers.map((offer) => offer.createdAt);
  const [weekAgo] = useState(() => Date.now() - 7 * 86_400_000);
  const publishedThisWeek = props.offers.filter((offer) => {
    const created = offer.createdAt ? new Date(offer.createdAt).getTime() : NaN;
    return !Number.isNaN(created) && created >= weekAgo;
  }).length;

  return (
    <div className="min-w-0 space-y-4">
      <HunterHeader
        displayName={props.displayName}
        avatarUrl={props.avatarUrl}
        level={props.level}
        score={props.score}
        publicHref={props.publicHref}
        avatarUploading={props.avatarUploading}
        onPickAvatar={props.onPickAvatar}
        bio={props.bio}
        city={props.city}
        state={props.state}
        joinedAt={props.joinedAt}
        trusted={props.trusted}
      />

      <div className="grid grid-cols-2 items-stretch gap-3 xl:grid-cols-4">
        <StatCard
          icon={<Send className="h-4 w-4" aria-hidden />}
          value={String(props.published)}
          label="Ofertas publicadas"
          href="/me/ofertas"
          detail={`+${publishedThisWeek} esta semana`}
          spark="#34d399"
        />
        <StatCard icon={<Bookmark className="h-4 w-4" aria-hidden />} value={countText(props.saved)} label="Guardadas" href="/me/favorites" spark="#a78bfa" />
        <StatCard icon={<ThumbsUp className="h-4 w-4" aria-hidden />} value={countText(props.positiveVotes)} label="Votos recibidos" href="/me/nivel#actividad" spark="#fb7185" />
        <StatCard icon={<MessageCircle className="h-4 w-4" aria-hidden />} value={countText(props.comments)} label="Comentarios" href="/me/nivel#actividad" spark="#c4b5fd" />
      </div>
      <p className="text-[13px] leading-relaxed text-[var(--me-muted)]">
        {props.approved + props.rejected > 0
          ? `${props.approved} aprobadas y ${props.rejected} rechazadas. ${Math.round((props.approved / (props.approved + props.rejected)) * 100)}% de las ya decididas se aprobaron. Publicar más no sube esa tasa.`
          : 'Cuando una oferta se apruebe o se rechace, aquí verás la tasa. Publicar más no sustituye una oferta aceptada.'}
      </p>

      <div className="grid min-w-0 items-start gap-3 lg:grid-cols-3">
        <div className="min-w-0 space-y-3 overflow-hidden">
          <HunterActivityBoard dates={dates} tone="night" />
          {props.published <= 0 ? <HunterFirstHunt /> : null}
          <button
            type="button"
            onClick={props.onPublish}
            className="flex w-full items-center gap-3 rounded-2xl bg-linear-to-r from-violet-600 to-fuchsia-600 p-4 text-left text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
              <Send className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              {props.published <= 0 ? (
                <>
                  <span className="block text-[14px] font-semibold">Conviértete en cazador</span>
                  <span className="mt-0.5 block text-[12px] text-white/80">
                    Publica un precio real, con enlace y datos claros. Si se rechaza, el motivo te dice qué corregir.
                  </span>
                </>
              ) : (
                <>
                  <span className="block text-[14px] font-semibold">Publica otra oferta que valga la pena</span>
                  <span className="mt-0.5 block text-[12px] text-white/80">
                    Una oferta aprobada ayuda más que varios envíos rechazados.
                  </span>
                </>
              )}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </button>
        </div>

        <div className="min-w-0 space-y-3 overflow-hidden">
          <RecentOffers offers={props.offers} />
          <AchievementCollection
            variant="compact"
            appearance="night"
            preview="sigils"
            onViewAll={() => router.push('/me/logros')}
          />
        </div>

        <div className="min-w-0 space-y-3 overflow-hidden">
          <section className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-4 text-[var(--me-ink)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">Tu impacto</h2>
              <p className="text-[12px] text-[var(--me-muted)]">En total</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ImpactStat icon={<Send className="h-4 w-4" aria-hidden />} value={String(props.published)} label="Ofertas publicadas" />
              <ImpactStat icon={<Eye className="h-4 w-4" aria-hidden />} value={countText(props.views)} label="Vistas en tus ofertas" />
              <ImpactStat icon={<ThumbsUp className="h-4 w-4" aria-hidden />} value={countText(props.positiveVotes)} label="Votos recibidos" />
              <ImpactStat icon={<MessageCircle className="h-4 w-4" aria-hidden />} value={countText(props.comments)} label="Comentarios" />
            </div>
          </section>
          <section className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-4 text-[var(--me-ink)]">
            <h2 className="text-[15px] font-semibold">Acciones rápidas</h2>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={props.onPublish}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-violet-600 px-4 py-3 text-[14px] font-semibold text-white hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              >
                <Send className="h-4 w-4" aria-hidden />
                Publicar nueva oferta
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <Link
                href="/"
                className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--me-line)] px-4 py-3 text-[14px] font-medium text-[var(--me-ink)] hover:bg-[var(--me-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              >
                <Search className="h-4 w-4" aria-hidden />
                Explorar ofertas
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
