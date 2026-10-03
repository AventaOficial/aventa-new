'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, EyeOff, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { CATEGORY_LABEL, MAX_FEATURED_ACHIEVEMENTS } from '@/lib/achievements/types';
import type { AchievementCard } from '@/lib/achievements/present';
import AchievementSigil, { type AchievementSigilState } from './AchievementSigil';
import { CATEGORY_TONE, achievementDefinition, formatAchievementDate } from './achievementVisuals';

type Payload = {
  ready: boolean;
  total: number;
  unlockedCount: number;
  percent: number;
  featured: string[];
  next: AchievementCard[];
  cards: AchievementCard[];
  celebration: AchievementCard | null;
};

type Filter = 'all' | 'unlocked' | 'locked';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'unlocked', label: 'Conseguidos' },
  { id: 'locked', label: 'Por conseguir' },
];

function sigilState(card: AchievementCard): AchievementSigilState {
  if (card.concealed) return 'concealed';
  return card.unlocked ? 'unlocked' : 'locked';
}

function categoryLabel(card: AchievementCard): string {
  if (card.concealed) return 'Oculto';
  const definition = achievementDefinition(card.code);
  return definition ? CATEGORY_LABEL[definition.category] : card.category;
}

function toneInk(code: string): string | undefined {
  const definition = achievementDefinition(code);
  return definition ? CATEGORY_TONE[definition.category].ink : undefined;
}

function Bar({ percent, color, label }: { percent: number; color?: string; label: string }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10"
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-violet-600 transition-[width] duration-300"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}

function StatusChip({ card }: { card: AchievementCard }) {
  if (card.concealed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-[#6e6e73] dark:bg-white/10 dark:text-[#a3a3a3]">
        <EyeOff className="h-3 w-3" aria-hidden /> Oculto
      </span>
    );
  }
  if (card.unlocked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        <Check className="h-3 w-3" aria-hidden /> Conseguido
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-[#515154] dark:bg-white/10 dark:text-[#d1d1d6]">
      <Lock className="h-3 w-3" aria-hidden /> Por conseguir
    </span>
  );
}

function XpChip({ xp }: { xp: number }) {
  if (xp <= 0) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-violet-700 dark:bg-violet-950 dark:text-violet-300">
      +{xp} XP
    </span>
  );
}

function ProgressMeter({ card }: { card: AchievementCard }) {
  if (card.concealed) return null;
  if (card.unlocked) {
    const date = formatAchievementDate(card.unlockedAt);
    return (
      <p className="mt-3 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
        {date ? `Conseguido el ${date}` : 'Conseguido'}
      </p>
    );
  }
  const tone = toneInk(card.code);
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12px] tabular-nums">
        <span className="font-medium text-[#1d1d1f] dark:text-[#fafafa]">
          {card.progress} / {card.target}
        </span>
        <span className="text-[#6e6e73] dark:text-[#a3a3a3]">{card.percent === 0 ? 'Sin empezar' : `${card.percent}%`}</span>
      </div>
      <Bar percent={card.percent} color={tone} label={`Progreso de ${card.name}`} />
      {card.remainingLabel && card.remainingLabel !== card.description ? (
        <p className="mt-2 text-[12px] leading-snug text-[#515154] dark:text-[#c7c7cc]">{card.remainingLabel}</p>
      ) : null}
    </div>
  );
}

function AchievementTile({
  card,
  featured,
  saving,
  anchor = false,
  onToggleFeatured,
}: {
  card: AchievementCard;
  featured: boolean;
  saving: boolean;
  anchor?: boolean;
  onToggleFeatured: (code: string) => void;
}) {
  return (
    <article
      id={anchor ? `logro-${card.code}` : undefined}
      className={`flex h-full flex-col rounded-2xl border p-4 shadow-sm transition-colors ${
        card.unlocked
          ? 'border-black/[0.04] bg-white dark:border-white/10 dark:bg-[#141414]'
          : 'border-dashed border-black/[0.1] bg-white/70 dark:border-white/15 dark:bg-[#141414]/70'
      }`}
    >
      <div className="flex items-start gap-3.5">
        <AchievementSigil code={card.code} rarity={card.rarityKey} state={sigilState(card)} percent={card.percent} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#86868b] dark:text-[#8e8e93]">
            {categoryLabel(card)}
            {card.concealed ? null : <span aria-hidden> · </span>}
            {card.concealed ? null : card.rarity}
          </p>
          <h4
            className={`mt-0.5 text-[15px] font-semibold leading-snug ${
              card.unlocked ? 'text-[#1d1d1f] dark:text-[#fafafa]' : 'text-[#3a3a3c] dark:text-[#e5e5ea]'
            }`}
          >
            {card.name}
          </h4>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusChip card={card} />
            <XpChip xp={card.xpReward} />
          </div>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">{card.description}</p>
      <ProgressMeter card={card} />
      {card.unlocked ? (
        <button
          type="button"
          disabled={saving}
          aria-pressed={featured}
          onClick={() => onToggleFeatured(card.code)}
          className="mt-auto inline-flex min-h-11 items-center self-start rounded-md pt-2 text-[13px] font-medium text-violet-600 transition-colors hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-300 sm:min-h-0"
        >
          {featured ? 'Quitar del perfil' : 'Mostrar en mi perfil'}
        </button>
      ) : null}
    </article>
  );
}

function Celebration({
  card,
  onView,
  onClose,
}: {
  card: AchievementCard;
  onView: () => void;
  onClose: () => void;
}) {
  const definition = achievementDefinition(card.code);
  const tone = definition ? CATEGORY_TONE[definition.category] : CATEGORY_TONE.caceria;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
      role="status"
      aria-live="polite"
      className="relative overflow-hidden rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12] dark:opacity-[0.2]"
        style={{ background: `radial-gradient(120% 90% at 0% 0%, ${tone.from}, transparent 60%)` }}
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
        <AchievementSigil code={card.code} rarity={card.rarityKey} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: tone.ink }}>
            Logro desbloqueado
          </p>
          <h3 className="mt-1 text-[20px] font-semibold leading-tight text-[#1d1d1f] dark:text-[#fafafa]">{card.name}</h3>
          <p className="mt-1.5 text-[14px] leading-snug text-[#515154] dark:text-[#c7c7cc]">{card.unlockLine}</p>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
            <span className="inline-flex items-center rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-[#515154] dark:bg-white/10 dark:text-[#d1d1d6]">
              {card.rarity}
            </span>
            <XpChip xp={card.xpReward} />
          </div>
        </div>
      </div>
      <div className="relative mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-[13px] font-medium text-[#515154] transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-[#d1d1d6] dark:hover:bg-white/[0.06] sm:min-h-10"
        >
          Cerrar
        </button>
        <button
          type="button"
          onClick={onView}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#1d1d1f] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 dark:bg-white dark:text-[#1d1d1f] dark:hover:bg-[#f5f5f7] sm:min-h-10"
        >
          Ver en mi colección
        </button>
      </div>
    </motion.section>
  );
}

export default function AchievementCollection({
  variant = 'full',
  onViewAll,
}: {
  variant?: 'full' | 'compact';
  onViewAll?: () => void;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    try {
      const response = await fetch('/api/me/achievements', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        setError('No se pudo cargar tu colección.');
        return;
      }
      setError(null);
      setPayload((await response.json()) as Payload);
    } catch {
      setError('No se pudo cargar tu colección.');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const authorized = async (path: string, init: RequestInit) => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    return fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  };

  const dismiss = async (code: string) => {
    setPayload((current) => (current ? { ...current, celebration: null } : current));
    await authorized('/api/me/achievements', { method: 'POST', body: JSON.stringify({ code }) });
  };

  const viewCelebrated = async (code: string) => {
    if (variant === 'compact' && onViewAll) {
      await dismiss(code);
      onViewAll();
      return;
    }
    setFilter('all');
    document.getElementById(`logro-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await dismiss(code);
  };

  const toggleFeatured = async (code: string) => {
    if (!payload || saving) return;
    const has = payload.featured.includes(code);
    const next = has
      ? payload.featured.filter((item) => item !== code)
      : [...payload.featured, code].slice(0, MAX_FEATURED_ACHIEVEMENTS);
    if (!has && payload.featured.length >= MAX_FEATURED_ACHIEVEMENTS) return;
    setSaving(true);
    const response = await authorized('/api/me/achievements', { method: 'PATCH', body: JSON.stringify({ codes: next }) });
    setSaving(false);
    if (response?.ok) setPayload({ ...payload, featured: next });
  };

  const groups = useMemo(() => {
    if (!payload) return [];
    const visible = payload.cards.filter((card) =>
      filter === 'all' ? true : filter === 'unlocked' ? card.unlocked : !card.unlocked,
    );
    const map = new Map<string, AchievementCard[]>();
    for (const card of visible) {
      const key = categoryLabel(card);
      const list = map.get(key) ?? [];
      list.push(card);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [payload, filter]);

  if (error) {
    return (
      <section className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
        <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Tu colección</h2>
        <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            void load();
          }}
          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-black/10 px-4 text-[13px] font-medium text-[#1d1d1f] transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-white/15 dark:text-[#fafafa] dark:hover:bg-white/[0.06] sm:min-h-9"
        >
          Reintentar
        </button>
      </section>
    );
  }

  if (!payload) {
    return (
      <section
        className="rounded-2xl border border-black/[0.04] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#141414] sm:p-5"
        aria-busy="true"
        aria-label="Cargando logros"
      >
        <div className="h-4 w-28 animate-pulse rounded bg-black/[0.06] dark:bg-white/10" />
        <div className="mt-4 flex gap-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-14 w-14 animate-pulse rounded-2xl bg-black/[0.05] dark:bg-white/[0.08]" />
          ))}
        </div>
      </section>
    );
  }

  const celebration = payload.celebration;
  const preview = (payload.next.length > 0 ? payload.next : payload.cards.filter((card) => !card.concealed)).slice(0, 3);
  const unlockedTotal = payload.cards.filter((card) => card.unlocked).length;
  const filterCount: Record<Filter, number> = {
    all: payload.cards.length,
    unlocked: unlockedTotal,
    locked: payload.cards.length - unlockedTotal,
  };

  return (
    <div className="space-y-4">
      {celebration ? (
        <Celebration
          card={celebration}
          onView={() => void viewCelebrated(celebration.code)}
          onClose={() => void dismiss(celebration.code)}
        />
      ) : null}

      <section className="rounded-2xl border border-black/[0.04] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#141414] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
              {variant === 'compact' ? 'Logros' : 'Tu colección'}
            </h2>
            <p className="mt-0.5 text-[13px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">
              {payload.unlockedCount} de {payload.total} conseguidos
            </p>
          </div>
          {variant === 'compact' && onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className="-my-2 inline-flex min-h-11 shrink-0 items-center rounded-md text-[13px] font-medium text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400"
            >
              Ver todos
            </button>
          ) : (
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#1d1d1f] dark:text-[#fafafa]">{payload.percent}%</span>
          )}
        </div>
        <div className="mt-3">
          <Bar percent={payload.percent} label="Colección completada" />
        </div>
        {!payload.ready ? (
          <p className="mt-3 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
            La colección aparece cuando la migración de logros ya está aplicada.
          </p>
        ) : null}

        {variant === 'compact' ? (
          preview.length > 0 ? (
            <ul className="mt-3 divide-y divide-black/5 dark:divide-white/10">
              {preview.map((card) => (
                <li key={card.code} className="flex items-center gap-3 py-2.5">
                  <AchievementSigil code={card.code} rarity={card.rarityKey} state={sigilState(card)} percent={card.percent} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">{card.name}</p>
                    {card.concealed ? null : (
                      <div className="mt-1">
                        <Bar
                          percent={card.percent}
                          color={toneInk(card.code)}
                          label={`Progreso de ${card.name}`}
                        />
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-[12px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">
                    {card.concealed ? '—' : card.unlocked ? 'Conseguido' : `${card.progress} / ${card.target}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Tu colección aparece aquí.</p>
          )
        ) : null}
      </section>

      {variant === 'full' && payload.next.length > 0 ? (
        <section className="space-y-3" aria-labelledby="logros-proximos">
          <h3 id="logros-proximos" className="text-[13px] font-semibold uppercase tracking-wide text-[#6e6e73] dark:text-[#a3a3a3]">
            Más cerca de conseguir
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {payload.next.map((card) => (
              <AchievementTile
                key={`next-${card.code}`}
                card={card}
                featured={payload.featured.includes(card.code)}
                saving={saving}
                onToggleFeatured={(code) => void toggleFeatured(code)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {variant === 'full' ? (
        <section className="space-y-4" aria-labelledby="logros-coleccion">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 id="logros-coleccion" className="text-[13px] font-semibold uppercase tracking-wide text-[#6e6e73] dark:text-[#a3a3a3]">
              Colección
            </h3>
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrar logros">
              {FILTERS.map((item) => {
                const active = filter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(item.id)}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:min-h-9 ${
                      active
                        ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]'
                        : 'border border-black/10 bg-white text-[#515154] hover:bg-black/[0.03] dark:border-white/15 dark:bg-[#141414] dark:text-[#d1d1d6] dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    {item.label}
                    <span className={`tabular-nums ${active ? 'opacity-70' : 'text-[#86868b] dark:text-[#8e8e93]'}`}>{filterCount[item.id]}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {groups.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-black/10 p-5 text-center text-[13px] text-[#6e6e73] dark:border-white/15 dark:text-[#a3a3a3]">
              {filter === 'unlocked' ? 'Todavía no consigues logros. Los que tienes más cerca aparecen arriba.' : 'No hay logros en esta vista.'}
            </p>
          ) : (
            groups.map(([label, cards]) => (
              <div key={label} className="space-y-2.5">
                <h4 className="text-[14px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
                  {label}{' '}
                  <span className="text-[12px] font-normal tabular-nums text-[#86868b] dark:text-[#8e8e93]">
                    {cards.filter((card) => card.unlocked).length}/{cards.length}
                  </span>
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {cards.map((card) => (
                    <AchievementTile
                      key={card.code}
                      card={card}
                      anchor
                      featured={payload.featured.includes(card.code)}
                      saving={saving}
                      onToggleFeatured={(code) => void toggleFeatured(code)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
          <p className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">Puedes destacar hasta {MAX_FEATURED_ACHIEVEMENTS} logros en tu perfil público.</p>
        </section>
      ) : null}
    </div>
  );
}
