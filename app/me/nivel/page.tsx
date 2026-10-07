'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  Crown,
  FileText,
  Heart,
  Lock,
  MessageCircle,
  MessageCircleOff,
  Rocket,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import HunterActivityBoard from '@/app/me/dashboard/HunterActivityBoard';
import { MeSpaceShell } from '@/app/me/dashboard/MeSectionPage';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { REPUTATION_LEVELS, getReputationLabel } from '@/lib/reputation';

const POINT_RULES = [
  { title: 'Oferta aprobada', detail: '+10 puntos', icon: FileText, tone: 'bg-violet-100 text-violet-600' },
  { title: 'Oferta rechazada', detail: '−15 puntos', icon: X, tone: 'bg-rose-100 text-rose-500' },
  { title: 'Comentario aprobado', detail: '+2 puntos', icon: MessageCircle, tone: 'bg-sky-100 text-sky-500' },
  { title: 'Comentario rechazado', detail: '−5 puntos', icon: MessageCircleOff, tone: 'bg-orange-100 text-orange-500' },
  { title: 'Like en tu comentario', detail: '+1 punto', icon: Heart, tone: 'bg-pink-100 text-pink-500' },
] as const;

const LEVEL_VISUAL = {
  1: { icon: Check, shell: 'bg-linear-to-br from-emerald-400 to-emerald-700 text-white', card: 'from-[#12352a] to-[#0c241c] text-white' },
  2: { icon: Crown, shell: 'bg-linear-to-br from-violet-400 to-fuchsia-700 text-white', card: 'from-[#3a1d78] to-[#241048] text-white' },
  3: { icon: Rocket, shell: 'bg-white/10 text-white', card: 'from-[#1a1c2e] to-[#12131c] text-white' },
  4: { icon: Crown, shell: 'bg-linear-to-br from-amber-300 to-amber-600 text-white', card: 'from-[#241c10] to-[#14110c] text-white' },
} as const;

type ActivityStats = {
  offersApproved: number;
  votesCast: number;
  favorites: number;
  commentsCount: number;
  dates: Array<string | null>;
};

function rangeLabel(minScore: number, maxScore: number): string {
  if (maxScore === Infinity) return `Desde ${minScore} pts`;
  return `${minScore} – ${maxScore} pts`;
}

function stateLabel(level: number, current: number): 'Completado' | 'Actual' | 'Siguiente' | 'Futuro' {
  if (level < current) return 'Completado';
  if (level === current) return 'Actual';
  if (level === current + 1) return 'Siguiente';
  return 'Futuro';
}

export default function NivelPage() {
  const router = useRouter();
  const { session, isLoading: authLoading } = useAuth();
  const [level, setLevel] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [activity, setActivity] = useState<ActivityStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!session?.user?.id) {
      router.replace('/');
      return;
    }
    let active = true;
    const uid = session.user.id;
    (async () => {
      const supabase = createClient();
      const [profileRes, offersRes, votesRes, favRes, impactRes] = await Promise.all([
        supabase.from('profiles').select('reputation_level, reputation_score').eq('id', uid).maybeSingle(),
        supabase.from('offers').select('status, created_at').eq('created_by', uid),
        supabase.from('offer_votes').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('offer_favorites').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        fetch('/api/me/impact-stats', { headers: { Authorization: `Bearer ${session.access_token}` } }).then((response) =>
          response.ok ? (response.json() as Promise<{ commentsCount?: number }>) : { commentsCount: 0 },
        ),
      ]);
      if (!active) return;
      if (profileRes.error || !profileRes.data) {
        setError(true);
        return;
      }
      const offers = (offersRes.data ?? []) as { status?: string | null; created_at?: string | null }[];
      setLevel((profileRes.data as { reputation_level?: number }).reputation_level ?? 1);
      setScore((profileRes.data as { reputation_score?: number }).reputation_score ?? 0);
      setActivity({
        offersApproved: offers.filter((offer) => (offer.status ?? '').toLowerCase() === 'approved').length,
        votesCast: votesRes.count ?? 0,
        favorites: favRes.count ?? 0,
        commentsCount: Number(impactRes.commentsCount ?? 0),
        dates: offers.map((offer) => offer.created_at ?? null),
      });
    })();
    return () => {
      active = false;
    };
  }, [authLoading, router, session]);

  const currentLevel = level ?? 1;
  const next = REPUTATION_LEVELS.find((item) => item.level === currentLevel + 1) ?? null;
  const progress = next ? Math.min(100, Math.floor((score / next.minScore) * 100)) : 100;
  const remaining = next ? Math.max(0, next.minScore - score) : 0;
  const metrics = [
    { label: 'Ofertas publicadas', value: activity?.offersApproved ?? 0 },
    { label: 'Votos emitidos', value: activity?.votesCast ?? 0 },
    { label: 'Comentarios', value: activity?.commentsCount ?? 0 },
    { label: 'Favoritos', value: activity?.favorites ?? 0 },
  ];

  return (
    <MeSpaceShell
      title="Nivel"
      accent="Aventa"
      lede="Tu progreso dentro de la comunidad. Sube de nivel publicando, comentando y ayudando a otros cazadores."
      note="No es el programa de recompensas."
      aside={
        <>
          <div className="flex items-start justify-between gap-3">
            <BarChart3 className="h-4 w-4 text-violet-300" aria-hidden />
            <Sparkles className="h-4 w-4 text-violet-200" aria-hidden />
          </div>
          <p className="mt-3 text-[15px] font-semibold leading-snug">Entre más aportas, más beneficios desbloqueas.</p>
          <p className="mt-2 text-[13px] leading-relaxed text-white/70">
            Publica ofertas, participa en la comunidad y sube de nivel para acceder a recompensas exclusivas.
          </p>
        </>
      }
    >
          {error ? <p className="text-sm text-[#6e6e73]">No se pudo cargar tu nivel.</p> : null}
          {level == null && !error ? <p className="text-sm text-[#6e6e73]">Cargando nivel…</p> : null}
          {level != null ? (
            <div className="space-y-10">
              <section className="grid gap-4 rounded-[28px] bg-white p-4 shadow-sm dark:bg-[#141414] lg:grid-cols-[minmax(0,1fr)_280px] lg:p-6">
                <div className="flex gap-4">
                  <div
                    className="flex h-20 w-20 shrink-0 items-center justify-center bg-linear-to-br from-violet-500 to-fuchsia-700 text-white shadow-lg"
                    style={{ clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}
                    aria-hidden
                  >
                    <Crown className="h-7 w-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Nivel actual</p>
                    <p className="mt-1 text-[28px] font-semibold tracking-tight">
                      Nivel {level} · {getReputationLabel(level)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2.5 py-1 font-semibold text-white">
                        <Sparkles className="h-3 w-3" aria-hidden />
                        {score} puntos
                      </span>
                      <span className="text-[#6e6e73] dark:text-[#a3a3a3]">
                        {next ? `de ${next.minScore} para el siguiente nivel` : 'nivel más alto'}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#ece8f6] dark:bg-white/10" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de nivel">
                        <div className="h-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-[13px] font-medium tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">{progress}%</span>
                    </div>
                    {next ? (
                      <p className="mt-3 flex flex-wrap items-center gap-2 text-[14px]">
                        <ArrowRight className="h-4 w-4 text-violet-500" aria-hidden />
                        <span className="font-medium text-violet-700 dark:text-violet-300">Siguiente: {next.label}</span>
                        <span className="text-[#6e6e73] dark:text-[#a3a3a3]">Te faltan {remaining} puntos.</span>
                      </p>
                    ) : (
                      <p className="mt-3 text-[14px]">Este es el nivel más alto de Aventa.</p>
                    )}
                  </div>
                </div>
                <aside className="rounded-2xl bg-linear-to-br from-violet-50 to-fuchsia-50 p-4 dark:from-violet-950/40 dark:to-fuchsia-950/20">
                  <BarChart3 className="h-4 w-4 text-violet-500" aria-hidden />
                  <p className="mt-3 text-[16px] font-semibold leading-snug">Tu actividad impulsa a toda la comunidad.</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-[#5c5670] dark:text-[#c4b8de]">
                    Cada oferta, comentario y like ayuda a que más personas encuentren grandes ofertas.
                  </p>
                </aside>
              </section>

              <section id="actividad" aria-label="Actividad">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-violet-600" aria-hidden />
                  <h2 className="text-[22px] font-semibold tracking-tight">Actividad</h2>
                </div>
                <p className="mt-1 text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">Lo que ya aportaste y el ritmo de tus publicaciones.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {metrics.map((item) => (
                    <article key={item.label} className="rounded-2xl bg-white px-4 py-4 shadow-sm dark:bg-[#141414]">
                      <p className="text-[28px] font-semibold tabular-nums leading-none">{item.value}</p>
                      <p className="mt-2 text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">{item.label}</p>
                    </article>
                  ))}
                </div>
                <div className="mt-3">
                  <HunterActivityBoard dates={activity?.dates ?? []} />
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-violet-600" aria-hidden />
                  <h2 className="text-[22px] font-semibold tracking-tight">Cómo ganas puntos</h2>
                </div>
                <p className="mt-1 text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">Estas son las acciones que suman o restan puntos a tu nivel.</p>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {POINT_RULES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.title} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-3 shadow-sm dark:bg-[#141414]">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span>
                          <span className="block text-[13px] font-medium leading-tight">{item.title}</span>
                          <span className="mt-0.5 block text-[13px] font-semibold tabular-nums text-[#3a3550] dark:text-[#fafafa]">{item.detail}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section>
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-violet-600" aria-hidden />
                  <h2 className="text-[22px] font-semibold tracking-tight">Camino de niveles</h2>
                </div>
                <p className="mt-1 text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">Cada nivel te acerca a más reconocimiento, logros y beneficios.</p>
                <ol className="mt-4 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {REPUTATION_LEVELS.map((step) => {
                    const visual = LEVEL_VISUAL[step.level as 1 | 2 | 3 | 4];
                    const Icon = visual.icon;
                    const state = stateLabel(step.level, level);
                    return (
                      <li key={step.level} className={`relative min-w-55 flex-1 overflow-hidden rounded-2xl bg-linear-to-br p-4 ${visual.card}`}>
                        <div className="flex items-start gap-3">
                          <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${visual.shell}`}>
                            <Icon className="h-5 w-5" aria-hidden />
                          </span>
                          <div>
                            <p className="text-[12px] text-white/60">Nivel {step.level}</p>
                            <p className="text-[16px] font-semibold leading-tight">{step.label}</p>
                            <p className="mt-1 text-[12px] text-white/55">{rangeLabel(step.minScore, step.maxScore)}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${state === 'Actual' ? 'bg-white text-[#241048]' : 'bg-white/10 text-white'}`}>
                            {state}
                          </span>
                          {state === 'Futuro' ? <Lock className="h-3.5 w-3.5 text-white/50" aria-hidden /> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          ) : null}
    </MeSpaceShell>
  );
}
