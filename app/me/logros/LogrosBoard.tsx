'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Crown, Gift, Lock, Trophy } from 'lucide-react';
import AchievementSigil, { type AchievementSigilState } from '@/app/components/achievements/AchievementSigil';
import { achievementDefinition } from '@/app/components/achievements/achievementVisuals';
import type { AchievementCard } from '@/lib/achievements/present';
import { CATEGORY_LABEL, type AchievementCategory } from '@/lib/achievements/types';
import { REPUTATION_LEVELS, getReputationLabel } from '@/lib/reputation';
import { createClient } from '@/lib/supabase/client';

type Payload = {
  total: number;
  unlockedCount: number;
  featured: string[];
  next: AchievementCard[];
  cards: AchievementCard[];
};

type Filter = 'all' | 'secrets' | AchievementCategory;
type Order = 'progress' | 'catalog';
type CardState = 'done' | 'progress' | 'locked';

const STATE_LABEL: Record<CardState, string> = {
  done: 'Completado',
  progress: 'En progreso',
  locked: 'Bloqueado',
};

function cardState(card: AchievementCard): CardState {
  if (card.unlocked) return 'done';
  if (!card.concealed && card.progress > 0) return 'progress';
  return 'locked';
}

function sigilState(card: AchievementCard): AchievementSigilState {
  if (card.concealed) return 'concealed';
  return card.unlocked ? 'unlocked' : 'locked';
}

function LogroCard({
  card,
  featured,
  saving,
  onToggleFeatured,
}: {
  card: AchievementCard;
  featured: boolean;
  saving: boolean;
  onToggleFeatured: (code: string) => void;
}) {
  const state = cardState(card);
  const bar =
    state === 'done'
      ? 'bg-linear-to-r from-fuchsia-500 to-violet-400'
      : state === 'progress'
        ? 'bg-linear-to-r from-sky-400 to-blue-500'
        : 'bg-[var(--me-chip)]';
  const shell =
    state === 'done'
      ? 'border-fuchsia-400/40 shadow-[0_0_24px_rgba(192,38,211,0.18)]'
      : state === 'progress'
        ? 'border-sky-400/25'
        : 'border-[var(--me-line)]';
  return (
    <article id={`logro-${card.code}`} className={`relative min-w-0 rounded-2xl border bg-[var(--me-card)] p-4 ${shell}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="relative">
          <AchievementSigil code={card.code} rarity={card.rarityKey} state={sigilState(card)} percent={card.percent} size="md" />
          {state === 'done' ? (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white">
              <Check className="h-3 w-3" aria-hidden />
            </span>
          ) : null}
          {state === 'locked' ? (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--me-chip)] text-[var(--me-muted)]">
              <Lock className="h-3 w-3" aria-hidden />
            </span>
          ) : null}
        </div>
      </div>
      <h3 className="mt-3 text-[15px] font-semibold leading-tight">{card.name}</h3>
      <p className="mt-1 min-h-10 text-[12px] leading-snug text-[var(--me-muted)]">{card.description}</p>
      {card.concealed ? null : (
        <>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--me-chip)]"
            role="progressbar"
            aria-valuenow={card.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progreso de ${card.name}`}
          >
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${card.percent}%` }} />
          </div>
          <p className="mt-1.5 text-[12px] tabular-nums text-[var(--me-muted)]">
            {card.progress}/{card.target}
          </p>
        </>
      )}
      <p className={`mt-2 text-[12px] font-medium ${state === 'done' ? 'text-fuchsia-700 dark:text-fuchsia-300' : state === 'progress' ? 'text-sky-700 dark:text-sky-300' : 'text-[var(--me-faint)]'}`}>
        {STATE_LABEL[state]}
      </p>
      {card.unlocked ? (
        <button
          type="button"
          disabled={saving}
          aria-pressed={featured}
          onClick={() => onToggleFeatured(card.code)}
          className="mt-2 text-[12px] font-medium text-violet-600 dark:text-violet-300 hover:text-violet-800 dark:hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50"
        >
          {featured ? 'Quitar del perfil' : 'Mostrar en mi perfil'}
        </button>
      ) : null}
    </article>
  );
}

function Donut({ completed, active, locked }: { completed: number; active: number; locked: number }) {
  const total = Math.max(1, completed + active + locked);
  const doneEnd = (completed / total) * 100;
  const activeEnd = ((completed + active) / total) * 100;
  const remaining = active + locked;
  return (
    <div
      className="relative mx-auto h-36 w-36 rounded-full"
      style={{
        background: `conic-gradient(#c026d3 0 ${doneEnd}%, #38bdf8 ${doneEnd}% ${activeEnd}%, #4b4563 ${activeEnd}% 100%)`,
      }}
      role="img"
      aria-label={`${remaining} de ${completed + active + locked} logros por completar`}
    >
      <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-[var(--me-card)] text-center">
        <span className="text-[28px] font-semibold leading-none tabular-nums">{remaining}</span>
        <span className="mt-1 text-[11px] text-[var(--me-muted)]">de {completed + active + locked} logros</span>
      </div>
    </div>
  );
}

export default function LogrosBoard({
  payload,
  filter,
  onFilter,
  saving,
  onToggleFeatured,
}: {
  payload: Payload;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  saving: boolean;
  onToggleFeatured: (code: string) => void;
}) {
  const [order, setOrder] = useState<Order>('progress');
  const [level, setLevel] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from('profiles').select('reputation_level, reputation_score').eq('id', auth.user.id).maybeSingle();
      if (!active || !data) return;
      setLevel((data as { reputation_level?: number }).reputation_level ?? 1);
      setScore((data as { reputation_score?: number }).reputation_score ?? 0);
    })();
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const byCategory = Object.fromEntries((Object.keys(CATEGORY_LABEL) as AchievementCategory[]).map((key) => [key, 0])) as Record<AchievementCategory, number>;
    let inProgress = 0;
    let blocked = 0;
    let secrets = 0;
    for (const card of payload.cards) {
      const definition = achievementDefinition(card.code);
      if (definition?.isHidden) secrets += 1;
      if (!card.concealed && definition) byCategory[definition.category] += 1;
      const state = cardState(card);
      if (state === 'progress') inProgress += 1;
      if (state === 'locked') blocked += 1;
    }
    return { byCategory, inProgress, blocked, secrets };
  }, [payload.cards]);

  const visible = useMemo(() => {
    const rows = payload.cards.filter((card) => {
      if (filter === 'all') return true;
      if (filter === 'secrets') return achievementDefinition(card.code)?.isHidden === true;
      return !card.concealed && achievementDefinition(card.code)?.category === filter;
    });
    return rows.sort((a, b) => {
      if (order === 'catalog') return a.displayOrder - b.displayOrder;
      return b.percent - a.percent || a.displayOrder - b.displayOrder;
    });
  }, [filter, order, payload.cards]);

  const next = payload.next[0] ?? payload.cards.find((card) => !card.unlocked && !card.concealed) ?? null;
  const currentLevel = level ?? 1;
  const nextLevel = REPUTATION_LEVELS.find((item) => item.level === currentLevel + 1) ?? null;
  const levelProgress = nextLevel ? Math.min(100, Math.floor((score / nextLevel.minScore) * 100)) : 100;
  const remainingPoints = nextLevel ? Math.max(0, nextLevel.minScore - score) : 0;
  const collectionProgress = payload.total === 0 ? 0 : Math.round((payload.unlockedCount / payload.total) * 100);

  return (
    <div className="min-w-0 space-y-4 overflow-x-clip text-[var(--me-ink)]">
      <section className="grid gap-3 rounded-[28px] border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-5">
        <div className="flex gap-4">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center bg-linear-to-br from-violet-400 to-fuchsia-600 text-white shadow-[0_0_24px_rgba(168,85,247,0.45)]"
            style={{ clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}
            aria-hidden
          >
            <Crown className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-[var(--me-muted)]">Nivel actual</p>
            <p className="text-[28px] font-semibold leading-none tracking-tight">Nivel {level ?? '—'}</p>
            <p className="mt-1 text-[14px] text-fuchsia-700 dark:text-fuchsia-300">{level == null ? 'Cargando nivel…' : getReputationLabel(currentLevel)}</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--me-chip)]" role="progressbar" aria-valuenow={levelProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de nivel">
                <div className="h-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500" style={{ width: `${levelProgress}%` }} />
              </div>
              <span className="text-[13px] font-medium tabular-nums text-[var(--me-muted)]">{levelProgress}%</span>
            </div>
            <p className="mt-2 text-[13px] text-[var(--me-muted)]">
              <span className="font-semibold tabular-nums text-[var(--me-ink)]">{score}</span>
              {nextLevel ? ` / ${nextLevel.minScore} puntos` : ' puntos'}
            </p>
            <p className="mt-1 text-[13px] text-[var(--me-muted)]">
              {nextLevel ? `Te faltan ${remainingPoints} puntos para el siguiente nivel` : 'Este es el nivel más alto de Aventa.'}
            </p>
          </div>
        </div>
        <aside className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card-2)] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium">Tu progreso de logros</p>
            <span className="text-[13px] tabular-nums text-[var(--me-muted)]">
              {payload.unlockedCount} / {payload.total}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--me-chip)]" role="progressbar" aria-valuenow={collectionProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de logros">
            <div className="h-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500" style={{ width: `${collectionProgress}%` }} />
          </div>
          <p className="sr-only">
            {payload.unlockedCount} / {payload.total} desbloqueados
          </p>
          <ul className="mt-4 grid grid-cols-3 gap-2 text-center">
            <li>
              <Trophy className="mx-auto h-4 w-4 text-fuchsia-700 dark:text-fuchsia-300" aria-hidden />
              <p className="mt-1 text-[18px] font-semibold tabular-nums">{payload.unlockedCount}</p>
              <p className="text-[11px] text-[var(--me-muted)]">Logros</p>
            </li>
            <li>
              <span className="mx-auto block h-4 w-4 rounded-full border-2 border-sky-400" aria-hidden />
              <p className="mt-1 text-[18px] font-semibold tabular-nums">{counts.inProgress}</p>
              <p className="text-[11px] text-[var(--me-muted)]">En progreso</p>
            </li>
            <li>
              <Lock className="mx-auto h-4 w-4 text-[var(--me-faint)]" aria-hidden />
              <p className="mt-1 text-[18px] font-semibold tabular-nums">{counts.blocked}</p>
              <p className="text-[11px] text-[var(--me-muted)]">Bloqueados</p>
            </li>
          </ul>
        </aside>
      </section>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrar logros">
              <FilterPill active={filter === 'all'} onClick={() => onFilter('all')} label={`Todos (${payload.cards.length})`} />
              {(Object.keys(CATEGORY_LABEL) as AchievementCategory[]).map((category) => (
                <FilterPill
                  key={category}
                  active={filter === category}
                  onClick={() => onFilter(category)}
                  label={`${CATEGORY_LABEL[category]} (${counts.byCategory[category]})`}
                />
              ))}
              <FilterPill active={filter === 'secrets'} onClick={() => onFilter('secrets')} label={`Secretos (${counts.secrets})`} />
            </div>
            <label className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none px-3 py-2 text-[12px] text-[var(--me-muted)]">
              Orden
              <select
                value={order}
                onChange={(event) => setOrder(event.target.value as Order)}
                className="bg-transparent font-medium text-[var(--me-ink)] focus:outline-none"
                aria-label="Orden"
              >
                <option value="progress">Progreso</option>
                <option value="catalog">Catálogo</option>
              </select>
            </label>
          </div>
          {visible.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-[var(--me-line)] p-5 text-center text-[13px] text-[var(--me-muted)]">No hay logros en esta vista.</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((card) => (
                <li key={card.code}>
                  <LogroCard
                    card={card}
                    featured={payload.featured.includes(card.code)}
                    saving={saving}
                    onToggleFeatured={onToggleFeatured}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="space-y-3">
          <section className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-4">
            <h2 className="text-[14px] font-semibold">Tu siguiente logro</h2>
            {next ? (
              <div className="mt-3">
                <div className="flex items-center gap-3">
                  <AchievementSigil code={next.code} rarity={next.rarityKey} state={sigilState(next)} percent={next.percent} size="sm" />
                  <div>
                    <p className="text-[14px] font-semibold">{next.name}</p>
                    <p className="text-[12px] text-[var(--me-muted)]">{next.description}</p>
                  </div>
                </div>
                {next.concealed ? null : (
                  <p className="mt-3 text-[12px] tabular-nums text-[var(--me-muted)]">
                    {next.progress}/{next.target}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onFilter('all');
                    window.setTimeout(() => {
                      document.getElementById(`logro-${next.code}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 0);
                  }}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-[var(--me-line)] px-3 py-2 text-[13px] font-medium hover:bg-[var(--me-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  Ver detalles
                </button>
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-[var(--me-muted)]">Ya completaste los logros visibles.</p>
            )}
          </section>

          <section className="rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none p-4">
            <h2 className="text-[14px] font-semibold">Logros por completar</h2>
            <div className="mt-4">
              <Donut completed={payload.unlockedCount} active={counts.inProgress} locked={counts.blocked} />
            </div>
            <ul className="mt-4 space-y-1.5 text-[12px] text-[var(--me-muted)]">
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-fuchsia-500" aria-hidden /> Completados</span>
                <span className="tabular-nums">{payload.unlockedCount}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-400" aria-hidden /> En progreso</span>
                <span className="tabular-nums">{counts.inProgress}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--me-chip)]" aria-hidden /> Bloqueados</span>
                <span className="tabular-nums">{counts.blocked}</span>
              </li>
            </ul>
          </section>

          <Link
            href="/me/recompensas"
            className="flex items-center gap-3 rounded-2xl bg-linear-to-r from-violet-600 to-fuchsia-600 p-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            <Gift className="h-5 w-5 shrink-0" aria-hidden />
            <span>
              <span className="block text-[14px] font-semibold">¡Desbloquea más recompensas!</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-white/80">Completa logros para acceder a beneficios exclusivos en Aventa.</span>
            </span>
          </Link>
        </aside>
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center rounded-full px-3 py-2 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
        active ? 'bg-violet-600 text-white' : 'bg-[var(--me-chip)] text-[var(--me-muted)] hover:bg-[var(--me-soft)]'
      }`}
    >
      {label}
    </button>
  );
}

export function LogrosHeroAside() {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <Trophy className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden />
        Reconocimiento
      </p>
      <p className="mt-2 text-[15px] font-semibold leading-snug">Pequeñas acciones, grandes recompensas.</p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--me-muted)]">
        Cada logro te acerca a más niveles y beneficios dentro de la comunidad.
      </p>
    </div>
  );
}
