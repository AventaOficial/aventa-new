'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useTheme } from '@/app/providers/ThemeProvider';
import { MAX_FEATURED_ACHIEVEMENTS, type AchievementCategory } from '@/lib/achievements/types';
import type { AchievementCard } from '@/lib/achievements/present';
import AchievementSigil, { type AchievementSigilState } from './AchievementSigil';
import { CATEGORY_TONE, achievementDefinition } from './achievementVisuals';
import LogrosBoard from '@/app/me/logros/LogrosBoard';

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

type Filter = 'all' | 'secrets' | AchievementCategory;

function sigilState(card: AchievementCard): AchievementSigilState {
  if (card.concealed) return 'concealed';
  return card.unlocked ? 'unlocked' : 'locked';
}

function toneInk(code: string): string | undefined {
  const definition = achievementDefinition(code);
  return definition ? CATEGORY_TONE[definition.category].ink : undefined;
}

function Bar({ percent, color, label }: { percent: number; color?: string; label: string }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-[var(--me-chip)]"
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
  const tone = definition ? CATEGORY_TONE[definition.category] : CATEGORY_TONE.caza;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
      role="status"
      aria-live="polite"
      className="relative overflow-hidden rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-[var(--me-line)] dark:bg-[#141414]"
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
            <span className="inline-flex items-center rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-[#515154] dark:bg-[var(--me-chip)] dark:text-[#d1d1d6]">
              {card.rarity}
            </span>
            {card.xpReward > 0 ? (
              <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-violet-700 dark:bg-violet-950 dark:text-violet-600 dark:text-violet-300">
                +{card.xpReward} XP
              </span>
            ) : null}
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
  appearance = 'day',
  preview = 'list',
}: {
  variant?: 'full' | 'compact';
  onViewAll?: () => void;
  appearance?: 'day' | 'night';
  preview?: 'list' | 'sigils';
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

  const { isDark } = useTheme();
  void appearance;
  const night = isDark;

  if (error) {
    return (
      <section className={night ? 'rounded-2xl border border-white/10 bg-[#140c24] p-5 text-white' : 'rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]'}>
        <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Tu colección</h2>
        <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            void load();
          }}
          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-black/10 px-4 text-[13px] font-medium text-[#1d1d1f] transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-[var(--me-line)] dark:text-[#fafafa] dark:hover:bg-white/[0.06] sm:min-h-9"
        >
          Reintentar
        </button>
      </section>
    );
  }

  if (!payload) {
    return (
      <section
        className={night ? 'rounded-2xl border border-white/10 bg-[#140c24] p-5' : 'rounded-2xl border border-black/[0.04] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#141414] sm:p-5'}
        aria-busy="true"
        aria-label="Cargando logros"
      >
        <div className="h-4 w-28 animate-pulse rounded bg-black/[0.06] dark:bg-[var(--me-chip)]" />
        <div className="mt-4 flex gap-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-14 w-14 animate-pulse rounded-2xl bg-black/[0.05] dark:bg-white/[0.08]" />
          ))}
        </div>
      </section>
    );
  }

  const celebration = payload.celebration;
  const previewCards = (payload.next.length > 0 ? payload.next : payload.cards.filter((card) => !card.concealed)).slice(0, 3);
  const sigils = [...payload.cards.filter((card) => card.unlocked), ...payload.cards.filter((card) => !card.unlocked && !card.concealed)].slice(0, 5);

  return (
    <div className="space-y-4">
      {celebration ? (
        <Celebration
          card={celebration}
          onView={() => void viewCelebrated(celebration.code)}
          onClose={() => void dismiss(celebration.code)}
        />
      ) : null}

      {variant === 'compact' ? (
      <section className={night ? 'rounded-2xl border border-white/10 bg-[#120a22] p-4 text-white sm:p-5' : 'rounded-2xl border border-black/[0.04] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#141414] sm:p-5'}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`text-[15px] font-semibold ${night ? 'text-[var(--me-ink)]' : 'text-[#1d1d1f] dark:text-[#fafafa]'}`}>
              {preview === 'sigils' ? 'Logros recientes' : 'Logros'}
            </h2>
            <p className={`mt-0.5 text-[13px] tabular-nums ${night ? 'text-[var(--me-muted)]' : 'text-[#6e6e73] dark:text-[#a3a3a3]'}`}>
              {payload.unlockedCount} / {payload.total} desbloqueados
            </p>
          </div>
          {variant === 'compact' && onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className={`-my-2 inline-flex min-h-11 shrink-0 items-center rounded-md text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${night ? 'text-violet-600 dark:text-violet-300' : 'text-violet-600 dark:text-violet-400'}`}
            >
              Ver todos
            </button>
          ) : (
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#1d1d1f] dark:text-[#fafafa]">{payload.percent}%</span>
          )}
        </div>
        {preview === 'sigils' ? null : (
        <div className="mt-3">
          <Bar percent={payload.percent} label="Colección completada" />
        </div>
        )}
        {!payload.ready ? (
          <p className="mt-3 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
            La colección aparece cuando la migración de logros ya está aplicada.
          </p>
        ) : null}

        {variant === 'compact' && preview === 'sigils' ? (
          sigils.length > 0 ? (
            <ul className="mt-4 grid grid-cols-5 gap-2">
              {sigils.map((card) => (
                <li key={card.code} className="min-w-0 text-center">
                  <div className="flex justify-center">
                    <AchievementSigil code={card.code} rarity={card.rarityKey} state={sigilState(card)} percent={card.percent} size="sm" />
                  </div>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-tight text-[var(--me-muted)]">{card.name}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-[var(--me-muted)]">Tu colección aparece aquí.</p>
          )
        ) : variant === 'compact' ? (
          previewCards.length > 0 ? (
            <ul className="mt-3 divide-y divide-black/5 dark:divide-[var(--me-line)]">
              {previewCards.map((card) => (
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
      ) : null}

      {variant === 'full' ? (
        <LogrosBoard
          payload={payload}
          filter={filter}
          onFilter={setFilter}
          saving={saving}
          onToggleFeatured={(code) => void toggleFeatured(code)}
        />
      ) : null}
    </div>
  );
}
