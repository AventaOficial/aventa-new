'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Crosshair, RefreshCw, Shuffle, Target } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';
import { createClient } from '@/lib/supabase/client';
import { formatPriceMXN } from '@/lib/formatPrice';
import { REPUTATION_LEVELS, getReputationLabel, getReputationProgress } from '@/lib/reputation';
import type { AchievementCard } from '@/lib/achievements/present';
import { requestHuntHref, type PlazaRequestItem } from '@/app/plaza/plazaShared';

type Challenge = Pick<AchievementCard, 'code' | 'name' | 'remainingLabel' | 'progress' | 'target' | 'percent' | 'xpReward'>;

type ChallengeState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; challenge: Challenge; poolSize: number }
  | { kind: 'empty' }
  | { kind: 'error' };

type ProgressState =
  | { kind: 'loading' }
  | { kind: 'ready'; level: number; score: number }
  | { kind: 'error' };

const actionButton =
  'group flex w-full min-h-[3.5rem] items-center gap-3 rounded-2xl border border-black/[0.06] bg-white px-3.5 py-3 text-left transition-colors duration-150 hover:border-violet-200 hover:bg-violet-50/60 active:bg-violet-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-black/[0.06] disabled:hover:bg-white dark:border-white/10 dark:bg-[#1a1a1a] dark:hover:border-violet-800 dark:hover:bg-violet-950/30 dark:active:bg-violet-950/50 dark:disabled:hover:border-white/10 dark:disabled:hover:bg-[#1a1a1a]';

function pickRandom<T>(items: T[], avoid?: (item: T) => boolean): T | null {
  const pool = avoid && items.length > 1 ? items.filter((item) => !avoid(item)) : items;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export default function HuntCenter({
  requests,
  requestsLoading,
  requestsFailed,
}: {
  requests: PlazaRequestItem[];
  requestsLoading: boolean;
  requestsFailed: boolean;
}) {
  const { session } = useAuth();
  const { openRegisterModal } = useUI();
  const [hunt, setHunt] = useState<PlazaRequestItem | null>(null);
  const [challenge, setChallenge] = useState<ChallengeState>({ kind: 'idle' });
  const [progress, setProgress] = useState<ProgressState>({ kind: 'loading' });
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    createClient()
      .from('profiles')
      .select('reputation_level, reputation_score')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) {
          setProgress({ kind: 'error' });
          return;
        }
        const row = data as { reputation_level?: number | null; reputation_score?: number | null };
        setProgress({
          kind: 'ready',
          level: Math.max(1, row.reputation_level ?? 1),
          score: Math.max(0, row.reputation_score ?? 0),
        });
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const giveHunt = () => {
    setHunt((current) => pickRandom(requests, (item) => item.id === current?.id));
  };

  const giveChallenge = async () => {
    if (!session?.access_token) {
      openRegisterModal('signup');
      return;
    }
    const previous = challenge.kind === 'ready' ? challenge.challenge.code : null;
    setChallenge({ kind: 'loading' });
    try {
      const res = await fetch('/api/me/achievements', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('achievements');
      const body = (await res.json()) as { next?: Challenge[] };
      const pool = Array.isArray(body.next) ? body.next : [];
      const picked = pickRandom(pool, (item) => item.code === previous);
      setChallenge(picked ? { kind: 'ready', challenge: picked, poolSize: pool.length } : { kind: 'empty' });
    } catch {
      setChallenge({ kind: 'error' });
    }
  };

  const huntDisabled = requestsLoading || requests.length === 0;

  return (
    <section
      aria-labelledby="hunt-center-title"
      className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm dark:border-violet-900/40 dark:bg-[#141414]"
    >
      <div className="bg-gradient-to-br from-violet-600 to-violet-700 px-5 pb-5 pt-4 text-white dark:from-violet-700 dark:to-violet-900">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15" aria-hidden>
            <Crosshair className="h-4 w-4" />
          </span>
          <h2 id="hunt-center-title" className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/90">
            Centro de Caza
          </h2>
        </div>
        <p className="mt-3 text-[19px] font-semibold leading-tight">¿Qué vamos a cazar hoy?</p>
        <p className="mt-1 text-[13px] leading-snug text-white/80">
          Recibe una solicitud de la comunidad y encuentra la mejor oferta.
        </p>
      </div>

      <div className="space-y-2.5 p-4">
        <button type="button" onClick={giveHunt} disabled={huntDisabled} className={actionButton}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" aria-hidden>
            <Shuffle className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
              {hunt ? 'Dame otra caza' : 'Dame una caza'}
            </span>
            <span className="block text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
              {requestsLoading
                ? 'Cargando solicitudes…'
                : requestsFailed
                  ? 'No pudimos cargar las solicitudes'
                  : requests.length === 0
                  ? 'Aún no hay solicitudes para cazar'
                  : 'Recibe una solicitud aleatoria'}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-[#6e6e73] transition-colors duration-150 group-hover:text-violet-600 dark:text-[#a3a3a3] dark:group-hover:text-violet-400" aria-hidden />
        </button>

        {hunt ? (
          <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-3.5 dark:border-violet-900/40 dark:bg-violet-950/30" aria-live="polite">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">Tu caza</p>
            <p className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug text-[#1d1d1f] dark:text-[#fafafa]">{hunt.title}</p>
            {hunt.budget_max || hunt.preferred_store ? (
              <p className="mt-1 truncate text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
                {hunt.budget_max ? `Hasta ${formatPriceMXN(hunt.budget_max)}` : null}
                {hunt.budget_max && hunt.preferred_store ? ' · ' : null}
                {hunt.preferred_store}
              </p>
            ) : null}
            <Link
              href={requestHuntHref(hunt)}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-violet-600 px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-violet-700 active:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#141414] sm:min-h-0 sm:py-2"
            >
              Ayudar a cazar
            </Link>
          </div>
        ) : null}

        <button type="button" onClick={giveChallenge} disabled={challenge.kind === 'loading'} className={actionButton}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" aria-hidden>
            {challenge.kind === 'loading' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
              {challenge.kind === 'ready' && challenge.poolSize > 1 ? 'Dame otro reto' : 'Dame un reto'}
            </span>
            <span className="block text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
              {session ? 'Acepta un reto y gana XP' : 'Inicia sesión para recibir retos'}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-[#6e6e73] transition-colors duration-150 group-hover:text-violet-600 dark:text-[#a3a3a3] dark:group-hover:text-violet-400" aria-hidden />
        </button>

        {challenge.kind === 'ready' ? (
          <div className="rounded-2xl border border-black/[0.06] p-3.5 dark:border-white/10" aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">Tu reto</p>
              {challenge.challenge.xpReward > 0 ? (
                <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  +{challenge.challenge.xpReward} XP
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[14px] font-semibold leading-snug text-[#1d1d1f] dark:text-[#fafafa]">{challenge.challenge.name}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">{challenge.challenge.remainingLabel}</p>
            <div className="mt-2.5 flex items-center gap-2">
              <div
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950"
                role="progressbar"
                aria-valuenow={challenge.challenge.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progreso del reto ${challenge.challenge.percent}%`}
              >
                <div className="h-full rounded-full bg-violet-600" style={{ width: `${challenge.challenge.percent}%` }} />
              </div>
              <span className="shrink-0 text-[12px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">
                {challenge.challenge.progress} / {challenge.challenge.target}
              </span>
            </div>
          </div>
        ) : null}
        {challenge.kind === 'empty' ? (
          <p className="px-1 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">No tienes retos pendientes por ahora. Revisa tus logros en tu perfil.</p>
        ) : null}
        {challenge.kind === 'error' ? (
          <p className="px-1 text-[12px] text-red-600 dark:text-red-400">No pudimos cargar un reto. Inténtalo de nuevo.</p>
        ) : null}
      </div>

      <div className="border-t border-black/[0.05] px-4 py-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Tu progreso de cazador</h3>
          {session ? (
            <Link
              href="/me/nivel"
              className="inline-flex min-h-11 items-center rounded-md text-[12px] font-medium text-violet-600 transition-colors duration-150 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400 dark:hover:text-violet-300 sm:min-h-0"
            >
              Ver niveles
            </Link>
          ) : null}
        </div>
        {!session ? (
          <div className="mt-2">
            <p className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">Crea tu cuenta para subir de nivel mientras cazas.</p>
            <button
              type="button"
              onClick={() => openRegisterModal('signup')}
              className="mt-2 inline-flex min-h-11 items-center rounded-full border border-violet-200 px-4 text-[13px] font-semibold text-violet-700 transition-colors duration-150 hover:bg-violet-50 active:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/40 sm:min-h-0 sm:py-2"
            >
              Crear cuenta
            </button>
          </div>
        ) : progress.kind === 'loading' ? (
          <div className="mt-3 space-y-2" aria-hidden>
            <div className="h-4 w-28 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
            <div className="h-1.5 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
          </div>
        ) : progress.kind === 'error' ? (
          <p className="mt-2 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">No pudimos cargar tu nivel en este momento.</p>
        ) : (
          <ProgressBlock level={progress.level} score={progress.score} />
        )}
      </div>
    </section>
  );
}

function ProgressBlock({ level, score }: { level: number; score: number }) {
  const pct = Math.round(getReputationProgress(score, level) * 100);
  const band = REPUTATION_LEVELS.find((item) => item.level === level);
  const next = REPUTATION_LEVELS.find((item) => item.level === level + 1);
  const line = band && band.maxScore !== Infinity ? `${score} / ${band.maxScore + 1} puntos` : `${score} puntos`;
  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
          Nivel {level} <span className="font-normal text-[#6e6e73] dark:text-[#a3a3a3]">· {getReputationLabel(level)}</span>
        </p>
        <p className="shrink-0 text-[12px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">{line}</p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso de nivel ${pct}%`}
      >
        <div className="h-full rounded-full bg-violet-600" style={{ width: `${pct}%` }} />
      </div>
      {next ? <p className="mt-1.5 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">Siguiente nivel: {next.label}</p> : null}
    </div>
  );
}
