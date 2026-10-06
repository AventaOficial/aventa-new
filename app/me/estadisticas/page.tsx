'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, MessageSquare, Send, ThumbsUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { ACHIEVEMENTS_HREF } from '@/app/components/notifications/notificationKinds';
import MeSectionPage, { meCardClass } from '@/app/me/dashboard/MeSectionPage';
import { getReputationLabel, getReputationProgress, REPUTATION_LEVELS } from '@/lib/reputation';

type Stats = {
  level: number;
  score: number;
  offersApproved: number;
  votesCast: number;
  favorites: number;
  commentsCount: number;
};

function remainingCopy(level: number, score: number): string | null {
  const next = REPUTATION_LEVELS.find((item) => item.level === level + 1);
  if (!next) return 'Ya estás en el nivel máximo de Aventa.';
  const remaining = Math.max(0, next.minScore - score);
  return `Te faltan ${remaining} ${remaining === 1 ? 'punto' : 'puntos'} para convertirte en ${next.label}.`;
}

function EstadisticasInner() {
  const router = useRouter();
  const { session, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!session?.user?.id) {
      router.replace('/');
      return;
    }
    const load = async () => {
      const supabase = createClient();
      const uid = session.user.id;
      const [{ data: profile }, offersRes, votesRes, favRes, impactRes] = await Promise.all([
        supabase.from('profiles').select('reputation_level, reputation_score').eq('id', uid).maybeSingle(),
        supabase.from('offers').select('status').eq('created_by', uid),
        supabase.from('offer_votes').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('offer_favorites').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        fetch('/api/me/impact-stats', { headers: { Authorization: `Bearer ${session.access_token}` } }).then((response) =>
          response.ok ? (response.json() as Promise<{ commentsCount?: number }>) : { commentsCount: 0 },
        ),
      ]);
      const offers = (offersRes.data ?? []) as { status?: string | null }[];
      const approved = offers.filter((offer) => (offer.status ?? '').toLowerCase() === 'approved').length;
      setStats({
        level: Math.max(1, (profile as { reputation_level?: number } | null)?.reputation_level ?? 1),
        score: Math.max(0, (profile as { reputation_score?: number } | null)?.reputation_score ?? 0),
        offersApproved: approved,
        votesCast: votesRes.count ?? 0,
        favorites: favRes.count ?? 0,
        commentsCount: Number(impactRes.commentsCount ?? 0),
      });
      setLoading(false);
    };
    void load();
  }, [session, router, authLoading]);

  if (authLoading || loading || !stats) {
    return (
      <MeSectionPage title="Tu actividad" lede="Todo lo que has conseguido en Aventa y cómo seguir avanzando.">
        <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3]">Cargando tu actividad…</p>
      </MeSectionPage>
    );
  }

  const next = REPUTATION_LEVELS.find((item) => item.level === stats.level + 1);
  const progress = Math.round(getReputationProgress(stats.score, stats.level) * 100);
  const label = getReputationLabel(stats.level);
  const scoreLine = next ? `${stats.score} / ${next.minScore} pts` : `${stats.score} pts`;
  const metrics = [
    {
      icon: Send,
      value: stats.offersApproved,
      label: 'Ofertas publicadas',
      detail: 'Hallazgos tuyos que ya están publicados.',
    },
    {
      icon: ThumbsUp,
      value: stats.votesCast,
      label: 'Votos emitidos',
      detail: 'Ayudaste a la comunidad a decidir qué ofertas merecen atención.',
    },
    {
      icon: MessageSquare,
      value: stats.commentsCount,
      label: 'Comentarios',
      detail: 'Comentarios publicados en tus ofertas.',
    },
    {
      icon: Heart,
      value: stats.favorites,
      label: 'Favoritos',
      detail: 'Ofertas que guardaste para volver a ellas.',
    },
  ];

  return (
    <MeSectionPage title="Tu actividad" lede="Todo lo que has conseguido en Aventa y cómo seguir avanzando.">
      <section className={`${meCardClass} p-5 sm:p-6`}>
        <p className="text-[13px] font-medium text-[#6e6e73] dark:text-[#a3a3a3]">Progreso destacado</p>
        <p className="mt-2 text-[22px] font-semibold tracking-tight">
          Nivel {stats.level} · {label}
        </p>
        <p className="mt-1 text-[15px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">{scoreLine}</p>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-[#ececf1] dark:bg-[#2c2c2e]"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso de nivel"
        >
          <div className="h-full rounded-full bg-[#1d1d1f] dark:bg-[#fafafa]" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 text-[15px] leading-relaxed">{remainingCopy(stats.level, stats.score)}</p>
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/me/nivel" className="text-[14px] font-medium text-violet-700 hover:text-violet-800 dark:text-violet-300">
            Ver mi nivel →
          </Link>
          <Link href={ACHIEVEMENTS_HREF} className="text-[14px] font-medium text-violet-700 hover:text-violet-800 dark:text-violet-300">
            Ver mis logros →
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[20px] font-semibold tracking-tight">Tu actividad</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {metrics.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label} className={`${meCardClass} p-5`}>
                <Icon className="h-4 w-4 text-[#6e6e73] dark:text-[#a3a3a3]" aria-hidden />
                <p className="mt-3 text-[32px] font-semibold tabular-nums leading-none">{item.value}</p>
                <p className="mt-2 text-[15px] font-medium">{item.label}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{item.detail}</p>
              </article>
            );
          })}
        </div>
      </section>
    </MeSectionPage>
  );
}

export default function EstadisticasPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a]" />}>
      <EstadisticasInner />
    </Suspense>
  );
}
