'use client';

import { useEffect, useState } from 'react';
import { Compass, Gift, Share2, Sparkles, Unlock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MeSpaceShell, meCardClass, meHeroAccentClass, meHeroActionClass } from '@/app/me/dashboard/MeSectionPage';
import MyRewardsHistory from '@/app/me/MyRewardsHistory';
import RewardsBetaOnboarding from '@/app/me/RewardsBetaOnboarding';
import { REWARDS_LEVEL_COUNT, REWARDS_WELCOME_DAYS, rewardsLevelShareBps } from '@/lib/rewards/levels';

type Progression = {
  phase: 'welcome' | 'level';
  shareBps: number;
  level: number | null;
  nextShareBps: number | null;
  welcomeDaysLeft: number | null;
  title: string;
  detail: string;
};

type BetaStatus = {
  audience: 'closed' | 'program' | 'beta';
  needsOnboarding: boolean;
  payoutEnabled: boolean;
  steps: { id: string; title: string; body: string[] }[];
  progression: Progression | null;
};

const HOW_STEPS = [
  { title: 'Caza', body: 'Encuentra ofertas que valgan la pena.', icon: Compass },
  { title: 'Comparte', body: 'Ayuda a otros cazadores a encontrarlas.', icon: Share2 },
  { title: 'Contribuye', body: 'Tus aportes construyen tu trayectoria.', icon: Sparkles },
  { title: 'Desbloquea', body: 'Tu progreso puede abrir nuevas posibilidades.', icon: Unlock },
] as const;

function HowItWorks({ open }: { open: boolean }) {
  return (
    <section className={`${meCardClass} p-5 sm:p-6`} aria-labelledby="how-rewards">
      <div className="min-w-0">
        <h2 id="how-rewards" className="text-[18px] font-semibold">Cómo funciona</h2>
        {open ? null : (
          <p className="mt-1 text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">
            Tu actividad en Aventa puede abrir nuevas posibilidades.
          </p>
        )}
      </div>
      <div
        id="how-rewards-panel"
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <ol className="grid gap-3 pt-4 sm:grid-cols-2">
            {HOW_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="rounded-2xl bg-[#f6f4fb] p-4 dark:bg-white/5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <p className="mt-3 text-[15px] font-semibold">{step.title}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-[#5c5670] dark:text-[#c4b8de]">{step.body}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

function percent(bps: number): number {
  return Math.round(bps / 100);
}

function RewardsSpace() {
  const [beta, setBeta] = useState<BetaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (active) setLoading(false);
        return;
      }
      const response = await fetch('/api/me/rewards/status', { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json().catch(() => null);
      if (!active) return;
      const raw = body?.beta;
      setBeta(
        raw && typeof raw === 'object'
          ? {
              audience: raw.audience === 'beta' || raw.audience === 'program' ? raw.audience : 'closed',
              needsOnboarding: Boolean(raw.needsOnboarding),
              payoutEnabled: Boolean(raw.payoutEnabled),
              steps: Array.isArray(raw.steps) ? raw.steps : [],
              progression: raw.progression ?? null,
            }
          : { audience: 'closed', needsOnboarding: false, payoutEnabled: false, steps: [], progression: null },
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  if (loading) return <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3]">Cargando recompensas…</p>;
  if (!beta || beta.audience !== 'beta') {
    return (
      <section className={`${meCardClass} p-6`}>
        <p className="text-[17px] font-medium">Rewards todavía no está disponible para tu cuenta.</p>
      </section>
    );
  }

  if (beta.needsOnboarding) {
    return <RewardsBetaOnboarding steps={beta.steps} onDone={() => setReloadKey((value) => value + 1)} />;
  }

  const progression = beta.progression;
  const welcome = progression?.phase === 'welcome' ? progression : null;
  const level = progression?.phase === 'level' ? progression.level : null;
  const currentShare = progression?.phase === 'level' ? progression.shareBps : rewardsLevelShareBps(1);
  const nextShare = progression?.phase === 'level' ? progression.nextShareBps : rewardsLevelShareBps(2);
  const levelNumber = level ?? 1;
  const levelProgress = Math.round((levelNumber / REWARDS_LEVEL_COUNT) * 100);
  const daysLeft = welcome?.welcomeDaysLeft ?? null;
  const welcomeElapsed = daysLeft == null ? 0 : Math.max(0, REWARDS_WELCOME_DAYS - daysLeft);
  const welcomeProgress = Math.round((welcomeElapsed / REWARDS_WELCOME_DAYS) * 100);

  return (
    <div className="space-y-8">
      {welcome ? (
        <section className={`${meCardClass} p-5 sm:p-6`}>
          <p className="text-[13px] font-medium text-[#6e6e73] dark:text-[#a3a3a3]">Tu bienvenida</p>
          <p className="mt-2 text-[40px] font-semibold tabular-nums leading-none">{percent(welcome.shareBps)}%</p>
          <p className="mt-3 text-[17px] font-medium">Tu primera recompensa</p>
          <p className="mt-2 text-[15px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{welcome.detail}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#ececf1] dark:bg-[#2c2c2e]" role="progressbar" aria-valuenow={welcomeProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Ventana de bienvenida">
            <div className="h-full rounded-full bg-[#1d1d1f] dark:bg-[#fafafa]" style={{ width: `${welcomeProgress}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
            {welcomeElapsed} de {REWARDS_WELCOME_DAYS} días de la ventana.
          </p>
        </section>
      ) : null}

      {progression ? (
      <section className={`${meCardClass} p-5 sm:p-6`}>
        <h2 className="text-[20px] font-semibold tracking-tight">Tu nivel de recompensas</h2>
        {welcome ? (
          <p className="mt-4 text-[15px] leading-relaxed">
            Después de la bienvenida, el nivel 1 es {percent(rewardsLevelShareBps(1))}% y el siguiente es {percent(rewardsLevelShareBps(2))}%.
          </p>
        ) : (
          <>
            <p className="mt-4 text-[15px]">
              Nivel actual: <span className="font-semibold tabular-nums">{percent(currentShare)}%</span>
            </p>
            {nextShare != null ? (
              <p className="mt-1 text-[15px]">
                Siguiente: <span className="font-semibold tabular-nums">{percent(nextShare)}%</span>
              </p>
            ) : (
              <p className="mt-1 text-[15px]">Este es el máximo.</p>
            )}
          </>
        )}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#ececf1] dark:bg-[#2c2c2e]" role="progressbar" aria-valuenow={levelProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de nivel de recompensas">
          <div className="h-full rounded-full bg-violet-600" style={{ width: `${levelProgress}%` }} />
        </div>
        {welcome ? null : progression.detail ? <p className="mt-3 text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">{progression.detail}</p> : null}
        {beta.payoutEnabled ? null : (
          <p className="mt-3 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Esto todavía no puede pagarse.</p>
        )}
      </section>
      ) : null}

      <MyRewardsHistory />
    </div>
  );
}

export default function RecompensasPage() {
  const [open, setOpen] = useState(false);
  return (
    <MeSpaceShell
      wide
      integrated
      accentClassName={meHeroAccentClass}
      title="Hay algo"
      accent="esperándote."
      lede="Tu actividad en Aventa puede abrir nuevas posibilidades."
      note={
        <button
          type="button"
          aria-expanded={open}
          aria-controls="how-rewards-panel"
          onClick={() => setOpen((value) => !value)}
          className={meHeroActionClass}
        >
          {open ? 'Ocultar' : 'Descubrir cómo funciona'}
        </button>
      }
      aside={
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <Gift className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden />
            Cómo funciona
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--me-muted)]">Caza, comparte, contribuye y desbloquea. El programa sigue en su estado real.</p>
        </div>
      }
    >
      <div className="space-y-6">
        <HowItWorks open={open} />
        <RewardsSpace />
      </div>
    </MeSpaceShell>
  );
}
