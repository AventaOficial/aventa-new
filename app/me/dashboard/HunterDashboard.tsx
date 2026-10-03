'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Award, Bookmark, CalendarDays, MessageCircle, Send, ThumbsUp } from 'lucide-react';
import HunterProgress from '@/app/me/dashboard/HunterProgress';
import HunterHeader from '@/app/me/dashboard/HunterHeader';
import HunterRewardSummary from '@/app/me/dashboard/HunterRewardSummary';
import HunterOffersPreview from '@/app/me/dashboard/HunterOffersPreview';
import HunterActivityBoard from '@/app/me/dashboard/HunterActivityBoard';
import { useMyRewards, useRewardGoal } from '@/app/me/dashboard/useMyRewards';
import AchievementCollection from '@/app/components/achievements/AchievementCollection';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';

type MePanel = 'resumen' | 'ofertas' | 'guardados' | 'actividad' | 'logros';

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
  offers: Array<{
    id: string;
    title: string;
    dealStatus: DealStatus;
    discountPrice?: number | null;
    originalPrice?: number | null;
    image?: string | null;
    store?: string | null;
    createdAt?: string | null;
    upvotes?: number | null;
  }>;
};

const panels: Array<{ id: MePanel; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'ofertas', label: 'Ofertas' },
  { id: 'guardados', label: 'Guardados' },
  { id: 'actividad', label: 'Actividad' },
  { id: 'logros', label: 'Logros' },
];

function StatCard({
  icon,
  value,
  label,
  href,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-full min-h-11 items-center gap-2.5 rounded-2xl border border-black/[0.04] bg-white p-3 shadow-sm transition-colors duration-150 hover:bg-black/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-white/10 dark:bg-[#141414] dark:hover:bg-white/[0.03] sm:min-h-[4.5rem] sm:gap-3 sm:p-4"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300 sm:h-10 sm:w-10">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[20px] font-semibold tabular-nums leading-none text-[#1d1d1f] dark:text-[#fafafa] sm:text-[22px]">{value}</span>
        <span className="mt-1 block text-[12px] leading-tight text-[#6e6e73] dark:text-[#a3a3a3] sm:mt-1.5 sm:truncate">{label}</span>
      </span>
      <span className="ml-auto hidden text-[13px] text-[#6e6e73] dark:text-[#a3a3a3] sm:block" aria-hidden>›</span>
    </Link>
  );
}

export default function HunterDashboard(props: HunterDashboardProps) {
  const rewards = useMyRewards();
  const rewardGoal = useRewardGoal();
  const [panel, setPanel] = useState<MePanel>('resumen');
  const dates = props.offers.map((offer) => offer.createdAt);

  return (
    <div className="min-w-0 space-y-3 sm:space-y-5">
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,0.9fr)]">
        <HunterHeader
          displayName={props.displayName}
          avatarUrl={props.avatarUrl}
          level={props.level}
          score={props.score}
          publicHref={props.publicHref}
          avatarUploading={props.avatarUploading}
          onPickAvatar={props.onPickAvatar}
        />
        <HunterProgress level={props.level} score={props.score} />
      </div>

      <div className="grid grid-cols-2 items-stretch gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard icon={<Send className="h-4 w-4" aria-hidden />} value={String(props.published)} label="Ofertas publicadas" href="/me/ofertas" />
        <StatCard icon={<Bookmark className="h-4 w-4" aria-hidden />} value={props.saved == null ? '—' : String(props.saved)} label="Guardadas" href="/me/favorites" />
        <StatCard icon={<ThumbsUp className="h-4 w-4" aria-hidden />} value={props.positiveVotes == null ? '—' : String(props.positiveVotes)} label="Votos recibidos" href="/me/estadisticas" />
        <StatCard icon={<MessageCircle className="h-4 w-4" aria-hidden />} value={props.comments == null ? '—' : String(props.comments)} label="Comentarios" href="/me/estadisticas" />
      </div>

      <div className="flex w-full min-w-0 gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Secciones de tu espacio">
        {panels.map((item) => {
          const selected = panel === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setPanel(item.id)}
              className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-3.5 text-[14px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:inline sm:min-h-0 sm:px-3 sm:py-2.5 sm:text-[13px] ${
                selected
                  ? 'border-violet-600 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#a3a3a3] dark:hover:text-[#fafafa]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {panel === 'resumen' ? (
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,0.9fr)] lg:items-start">
          <div className="order-1 min-w-0 space-y-3 sm:space-y-4">
            <nav className="sm:hidden" aria-label="Accesos rápidos">
              <h2 className="mb-2 text-[13px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Accesos rápidos</h2>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'ofertas' as const, label: 'Mis ofertas', icon: <Send className="h-4 w-4" aria-hidden /> },
                    { id: 'guardados' as const, label: 'Guardados', icon: <Bookmark className="h-4 w-4" aria-hidden /> },
                    { id: 'actividad' as const, label: 'Actividad', icon: <CalendarDays className="h-4 w-4" aria-hidden /> },
                    { id: 'logros' as const, label: 'Logros', icon: <Award className="h-4 w-4" aria-hidden /> },
                  ]
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPanel(item.id)}
                    className="flex min-h-11 items-center gap-2 rounded-2xl border border-black/[0.04] bg-white px-3 py-2.5 text-left shadow-sm transition-colors duration-150 hover:bg-black/[0.02] active:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-white/10 dark:bg-[#141414] dark:hover:bg-white/[0.03] dark:active:bg-white/[0.06]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
                      {item.icon}
                    </span>
                    <span className="text-[13px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">{item.label}</span>
                  </button>
                ))}
              </div>
            </nav>
            <HunterOffersPreview offers={props.offers} published={props.published} approved={props.approved} onPublish={props.onPublish} />
            <HunterRewardSummary state={rewards} goal={rewardGoal.goal} goalPending={rewardGoal.pending} />
          </div>
          <div className="order-2 min-w-0 space-y-3 sm:space-y-4">
            <div className="sm:hidden">
              <HunterActivityBoard dates={dates} variant="summary" onOpen={() => setPanel('actividad')} />
            </div>
            <div className="hidden sm:block">
              <HunterActivityBoard dates={dates} />
            </div>
            <AchievementCollection variant="compact" onViewAll={() => setPanel('logros')} />
          </div>
        </div>
      ) : null}

      {panel === 'ofertas' ? (
        <HunterOffersPreview offers={props.offers} published={props.published} approved={props.approved} limit={8} onPublish={props.onPublish} />
      ) : null}

      {panel === 'guardados' ? (
        <section className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
          <h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Guardados</h2>
          <p className="mt-2 text-[15px] text-[#6e6e73] dark:text-[#a3a3a3]">
            {props.saved == null
              ? 'Las ofertas que guardas viven en Favoritos.'
              : props.saved === 0
                ? 'Aún no guardas ofertas. Usa el marcador en cualquier oferta para tenerla a mano.'
                : `Tienes ${props.saved} ${props.saved === 1 ? 'oferta guardada' : 'ofertas guardadas'} en Favoritos.`}
          </p>
          <Link href="/me/favorites" className="mt-3 inline-flex min-h-11 items-center rounded-md text-[13px] font-medium text-violet-600 transition-colors duration-150 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400 dark:hover:text-violet-300 sm:mt-4 sm:inline sm:min-h-0">
            Ver guardados
          </Link>
        </section>
      ) : null}

      {panel === 'actividad' ? <HunterActivityBoard dates={dates} /> : null}

      {panel === 'logros' ? <AchievementCollection variant="full" /> : null}
    </div>
  );
}
