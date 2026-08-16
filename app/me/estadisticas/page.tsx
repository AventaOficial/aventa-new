'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Shield, TrendingUp, MessageSquare, Heart, Target } from 'lucide-react';
import ClientLayout from '@/app/ClientLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { getReputationLabel, getReputationProgress, REPUTATION_LEVELS } from '@/lib/reputation';

type Stats = {
  level: number;
  score: number;
  offersApproved: number;
  offersPending: number;
  offersRejected: number;
  votesCast: number;
  favorites: number;
  positiveVotesTotal: number;
  commentsCount: number;
  cazadoresAyudados: number;
};

function nextHint(level: number, score: number): string {
  const next = REPUTATION_LEVELS.find((l) => l.level === level + 1);
  if (!next) return 'Ya estás en el nivel máximo. Sigue publicando calidad: tu voto pesa más en el ranking.';
  const remaining = Math.max(0, next.minScore - score);
  return `Te faltan ${remaining} puntos para el nivel ${next.level} (${next.label}).`;
}

function improveTips(level: number, stats: Stats): string[] {
  const tips: string[] = [];
  if (stats.offersApproved + stats.offersPending === 0) {
    tips.push('Publica tu primera oferta. Cada hallazgo aprobado suma reputación.');
  }
  if (stats.votesCast < 5) {
    tips.push('Vota en el feed. Ayudas a ordenar el listado y te vuelves parte de la comunidad.');
  }
  if (level < 3) {
    tips.push('Ofertas claras, con precio y enlace correcto, se aprueban más rápido.');
  }
  if (stats.favorites < 3) {
    tips.push('Guarda favoritos de lo que sí comprarías. Así “Para ti” aprende de ti.');
  }
  if (tips.length === 0) {
    tips.push('Sigue cazando con constancia. El nivel sube con ofertas y comentarios aprobados.');
  }
  return tips.slice(0, 4);
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
        fetch('/api/me/impact-stats', { headers: { Authorization: `Bearer ${session.access_token}` } }).then((r) =>
          r.ok ? r.json() : {},
        ),
      ]);
      const offers = (offersRes.data ?? []) as { status?: string | null }[];
      const statusOf = (s: string) => offers.filter((o) => (o.status ?? '').toLowerCase() === s).length;
      setStats({
        level: Math.max(1, (profile as { reputation_level?: number } | null)?.reputation_level ?? 1),
        score: Math.max(0, (profile as { reputation_score?: number } | null)?.reputation_score ?? 0),
        offersApproved: statusOf('approved'),
        offersPending: statusOf('pending'),
        offersRejected: statusOf('rejected'),
        votesCast: votesRes.count ?? 0,
        favorites: favRes.count ?? 0,
        positiveVotesTotal: Number(impactRes.positiveVotesTotal ?? 0),
        commentsCount: Number(impactRes.commentsCount ?? 0),
        cazadoresAyudados: Number(impactRes.cazadoresAyudados ?? 0),
      });
      setLoading(false);
    };
    void load();
  }, [session, router, authLoading]);

  if (authLoading || loading || !stats) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-[#6e6e73]">Cargando estadísticas…</div>
    );
  }

  const progress = Math.round(getReputationProgress(stats.score, stats.level) * 100);
  const label = getReputationLabel(stats.level);
  const tips = improveTips(stats.level, stats);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-28 md:pb-12">
      <Link
        href="/me"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al perfil
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[#1d1d1f] dark:text-[#fafafa]">Estadísticas</h1>
      <p className="mt-1 text-sm text-[#6e6e73] dark:text-[#a3a3a3]">
        Tu progreso en Aventa y cómo subir de nivel.
      </p>

      <section className="mt-6 rounded-3xl border border-violet-100 bg-white p-5 dark:border-violet-900/40 dark:bg-[#141414]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-400">
            <Shield className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-lg font-semibold text-violet-700 dark:text-violet-300">
              Nivel {stats.level} · {label}
            </p>
            <p className="text-sm tabular-nums text-[#1d1d1f] dark:text-[#fafafa]">{stats.score} puntos</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8e8ed] dark:bg-[#2c2c2e]">
          <div className="h-full rounded-full bg-violet-600" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-[#6e6e73] dark:text-[#a3a3a3]">{nextHint(stats.level, stats.score)}</p>
      </section>

      <section className="mt-4 rounded-3xl border border-[#e8e8ed] bg-white p-5 dark:border-[#2a2a2a] dark:bg-[#141414]">
        <h2 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Camino de niveles</h2>
        <ul className="mt-3 space-y-2">
          {REPUTATION_LEVELS.map((item) => {
            const current = item.level === stats.level;
            const done = item.level < stats.level;
            return (
              <li
                key={item.level}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                  current ? 'bg-violet-50 dark:bg-violet-950/40' : ''
                }`}
              >
                <span className={current ? 'font-semibold text-violet-700 dark:text-violet-300' : 'text-[#1d1d1f] dark:text-[#fafafa]'}>
                  Nivel {item.level} · {item.label}
                </span>
                <span className="text-xs tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">
                  {done ? 'Listo' : current ? `${stats.score} pts` : `Desde ${item.minScore} pts`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {[
          { icon: Target, label: 'Ofertas activas', value: stats.offersApproved },
          { icon: TrendingUp, label: 'Votos recibidos', value: stats.positiveVotesTotal },
          { icon: MessageSquare, label: 'Comentarios', value: stats.commentsCount },
          { icon: Heart, label: 'Favoritos', value: stats.favorites },
        ].map(({ icon: Icon, label: l, value }) => (
          <div key={l} className="rounded-2xl border border-[#e8e8ed] bg-white p-4 dark:border-[#2a2a2a] dark:bg-[#141414]">
            <Icon className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
            <p className="mt-2 text-xl font-semibold tabular-nums text-[#1d1d1f] dark:text-[#fafafa]">{value}</p>
            <p className="text-xs text-[#6e6e73] dark:text-[#a3a3a3]">{l}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-[#6e6e73] dark:text-[#a3a3a3]">
        En revisión: {stats.offersPending} · Rechazadas: {stats.offersRejected} · Votos que emitiste: {stats.votesCast} ·
        Cazadores que te ayudaron: {stats.cazadoresAyudados}
      </p>

      <section className="mt-6 rounded-3xl border border-[#e8e8ed] bg-white p-5 dark:border-[#2a2a2a] dark:bg-[#141414]">
        <h2 className="text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Cómo mejorar</h2>
        <ul className="mt-3 space-y-2">
          {tips.map((tip) => (
            <li key={tip} className="text-sm leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">
              {tip}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/subir" className="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white">
            Subir oferta
          </Link>
          <Link href="/plaza" className="rounded-full border border-[#e5e5e7] px-4 py-2 text-xs font-semibold text-[#1d1d1f] dark:border-[#333] dark:text-[#fafafa]">
            Ir a Plaza
          </Link>
          <Link href="/descubre" className="rounded-full border border-[#e5e5e7] px-4 py-2 text-xs font-semibold text-[#1d1d1f] dark:border-[#333] dark:text-[#fafafa]">
            Ver guías
          </Link>
        </div>
      </section>
    </div>
  );
}

export default function EstadisticasPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F5F7]" />}>
      <ClientLayout>
        <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <EstadisticasInner />
        </div>
      </ClientLayout>
    </Suspense>
  );
}
