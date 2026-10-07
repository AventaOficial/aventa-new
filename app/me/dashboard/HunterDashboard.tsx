'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, Eye, Gift, MessageCircle, Send, ThumbsUp } from 'lucide-react';
import HunterProgress from '@/app/me/dashboard/HunterProgress';
import HunterHeader from '@/app/me/dashboard/HunterHeader';
import HunterActivityBoard from '@/app/me/dashboard/HunterActivityBoard';
import AchievementCollection from '@/app/components/achievements/AchievementCollection';

type DealStatus = 'pending' | 'approved' | 'rejected' | 'expired';

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
  offers: Array<{
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
  }>;
};

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
      className="flex h-full min-h-11 items-center gap-3 rounded-2xl border border-white/10 bg-[#160c28] px-4 py-4 text-white hover:bg-[#1d1233] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-violet-200">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[22px] font-semibold tabular-nums leading-none">{value}</span>
        <span className="mt-1 block text-[12px] text-white/60">{label}</span>
      </span>
      <span className="ml-auto text-white/40" aria-hidden>›</span>
    </Link>
  );
}

function ImpactStat({
  icon,
  value,
  label,
  tone,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  tone: string;
}) {
  return (
    <div className={`rounded-2xl p-3 ${tone}`}>
      <span className="text-violet-600">{icon}</span>
      <p className="mt-2 text-[22px] font-semibold tabular-nums leading-none text-[#1d1d1f]">{value}</p>
      <p className="mt-1 text-[12px] text-[#6e6e73]">{label}</p>
    </div>
  );
}

export default function HunterDashboard(props: HunterDashboardProps) {
  const router = useRouter();
  const dates = props.offers.map((offer) => offer.createdAt);

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,0.9fr)]">
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
        <HunterProgress level={props.level} score={props.score} />
      </div>

      <div className="grid grid-cols-2 items-stretch gap-3 xl:grid-cols-4">
        <StatCard icon={<Send className="h-4 w-4" aria-hidden />} value={String(props.published)} label="Ofertas publicadas" href="/me/ofertas" />
        <StatCard icon={<Bookmark className="h-4 w-4" aria-hidden />} value={props.saved == null ? '—' : String(props.saved)} label="Guardadas" href="/me/favorites" />
        <StatCard icon={<ThumbsUp className="h-4 w-4" aria-hidden />} value={props.positiveVotes == null ? '—' : String(props.positiveVotes)} label="Votos recibidos" href="/me/nivel#actividad" />
        <StatCard icon={<MessageCircle className="h-4 w-4" aria-hidden />} value={props.comments == null ? '—' : String(props.comments)} label="Comentarios" href="/me/nivel#actividad" />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(220px,0.8fr)]">
        <HunterActivityBoard dates={dates} />
        <AchievementCollection variant="compact" onViewAll={() => router.push('/me/logros')} />
        <div className="space-y-3">
          <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-[#141414]">
            <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Tu impacto</h2>
            <p className="mt-0.5 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">Totales de tu cuenta. En total.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ImpactStat icon={<Send className="h-4 w-4" aria-hidden />} value={String(props.published)} label="Ofertas publicadas" tone="bg-violet-50" />
              <ImpactStat icon={<Eye className="h-4 w-4" aria-hidden />} value={props.views == null ? '—' : String(props.views)} label="Vistas en tus ofertas" tone="bg-sky-50" />
              <ImpactStat icon={<ThumbsUp className="h-4 w-4" aria-hidden />} value={props.positiveVotes == null ? '—' : String(props.positiveVotes)} label="Votos recibidos" tone="bg-emerald-50" />
              <ImpactStat icon={<MessageCircle className="h-4 w-4" aria-hidden />} value={props.comments == null ? '—' : String(props.comments)} label="Comentarios" tone="bg-fuchsia-50" />
            </div>
          </section>
          <button
            type="button"
            onClick={props.onPublish}
            className="flex w-full items-center gap-3 rounded-2xl bg-linear-to-r from-violet-100 to-fuchsia-100 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Gift className="h-5 w-5 shrink-0 text-violet-600" aria-hidden />
            <span>
              <span className="block text-[14px] font-semibold text-[#1d1d1f]">Sigue contribuyendo</span>
              <span className="mt-0.5 block text-[12px] text-[#5c5670]">Tus publicaciones ayudan a que más personas encuentren grandes ofertas.</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
