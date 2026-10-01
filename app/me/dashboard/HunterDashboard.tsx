'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bookmark, Flame, MessageCircle, Send, ThumbsUp } from 'lucide-react';
import HunterProgress from '@/app/me/dashboard/HunterProgress';
import HunterHeader from '@/app/me/dashboard/HunterHeader';
import HunterRewardSummary from '@/app/me/dashboard/HunterRewardSummary';
import HunterOffersPreview from '@/app/me/dashboard/HunterOffersPreview';
import HunterActivityBoard, { activityFromDates } from '@/app/me/dashboard/HunterActivityBoard';
import { useMyRewards } from '@/app/me/dashboard/useMyRewards';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';

type MePanel = 'resumen' | 'ofertas' | 'guardados' | 'actividad';

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
      className="flex items-center gap-3 rounded-2xl border border-black/[0.04] bg-white p-4 shadow-sm transition-colors duration-150 hover:bg-black/[0.02] dark:border-white/10 dark:bg-[#141414] dark:hover:bg-white/[0.03]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[22px] font-semibold tabular-nums leading-none text-[#1d1d1f] dark:text-[#fafafa]">{value}</span>
        <span className="mt-1 block truncate text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{label}</span>
      </span>
      <span className="ml-auto text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]" aria-hidden>›</span>
    </Link>
  );
}

export default function HunterDashboard(props: HunterDashboardProps) {
  const rewards = useMyRewards();
  const [panel, setPanel] = useState<MePanel>('resumen');
  const dates = props.offers.map((offer) => offer.createdAt);
  const activity = useMemo(() => activityFromDates(dates), [dates]);
  const logros = [
    props.published >= 1
      ? { title: 'Primera oferta', detail: 'Publicaste tu primera oferta', icon: Send }
      : null,
    props.positiveVotes != null && props.positiveVotes >= 10
      ? { title: '10 votos', detail: 'Recibiste 10 votos en tus ofertas', icon: ThumbsUp }
      : null,
    activity.longest >= 7
      ? { title: 'Racha de 7 días', detail: 'Publicaste ofertas 7 días seguidos', icon: Flame }
      : null,
  ].flatMap((item) => (item ? [item] : []));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,0.9fr)]">
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

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={<Send className="h-4 w-4" aria-hidden />} value={String(props.published)} label="Ofertas publicadas" href="/me/ofertas" />
        <StatCard icon={<Bookmark className="h-4 w-4" aria-hidden />} value="—" label="Guardadas" href="/me/favorites" />
        <StatCard icon={<ThumbsUp className="h-4 w-4" aria-hidden />} value={props.positiveVotes == null ? '—' : String(props.positiveVotes)} label="Votos recibidos" href="/me/estadisticas" />
        <StatCard icon={<MessageCircle className="h-4 w-4" aria-hidden />} value={props.comments == null ? '—' : String(props.comments)} label="Comentarios" href="/me/estadisticas" />
      </div>

      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Secciones de tu espacio">
        {panels.map((item) => {
          const selected = panel === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setPanel(item.id)}
              className={`shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
                selected
                  ? 'border-violet-600 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-[#6e6e73] hover:text-[#1d1d1f] dark:text-[#a3a3a3] dark:hover:text-[#fafafa]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
        <Link href="/me/nivel" className="shrink-0 border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-[#6e6e73] dark:text-[#a3a3a3]">
          Logros
        </Link>
        <Link href="/settings" className="shrink-0 border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-[#6e6e73] dark:text-[#a3a3a3]">
          Configuración
        </Link>
      </div>

      {panel === 'resumen' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,0.9fr)] lg:items-start">
          <div className="order-1 space-y-4">
            <HunterOffersPreview offers={props.offers} published={props.published} approved={props.approved} />
            <HunterRewardSummary state={rewards} />
          </div>
          <div className="order-2 space-y-4">
            <HunterActivityBoard dates={dates} />
            <section className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Logros recientes</h2>
                <Link href="/me/nivel" className="text-[13px] font-medium text-violet-600 dark:text-violet-400">
                  Ver todos
                </Link>
              </div>
              {logros.length === 0 ? (
                <p className="mt-4 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Todavía no hay logros para mostrar.</p>
              ) : (
                <ul className="mt-4 grid grid-cols-2 gap-2">
                  {logros.map((logro) => {
                    const Icon = logro.icon;
                    return (
                      <li key={logro.title} className="rounded-xl bg-black/[0.03] px-3 py-3 dark:bg-white/[0.04]">
                        <Icon className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden />
                        <p className="mt-2 text-[13px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">{logro.title}</p>
                        <p className="mt-1 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">{logro.detail}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {panel === 'ofertas' ? (
        <HunterOffersPreview offers={props.offers} published={props.published} approved={props.approved} limit={8} />
      ) : null}

      {panel === 'guardados' ? (
        <section className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
          <h2 className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Guardados</h2>
          <p className="mt-2 text-[15px] text-[#6e6e73] dark:text-[#a3a3a3]">Tus guardados viven en Favoritos. Esta pantalla no trae el total.</p>
          <Link href="/me/favorites" className="mt-4 inline-flex text-[13px] font-medium text-violet-600 dark:text-violet-400">
            Ver todos
          </Link>
        </section>
      ) : null}

      {panel === 'actividad' ? <HunterActivityBoard dates={dates} /> : null}
    </div>
  );
}
