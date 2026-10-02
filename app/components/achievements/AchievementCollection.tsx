'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MAX_FEATURED_ACHIEVEMENTS } from '@/lib/achievements/types';

type Card = {
  code: string;
  name: string;
  description: string;
  unlockLine: string;
  icon: string;
  category: string;
  rarity: string;
  rarityKey: string;
  xpReward: number;
  progress: number;
  target: number;
  percent: number;
  unlocked: boolean;
  unlockedAt: string | null;
  concealed: boolean;
  remainingLabel: string;
};

type Payload = {
  ready: boolean;
  total: number;
  unlockedCount: number;
  percent: number;
  featured: string[];
  next: Card[];
  cards: Card[];
  celebration: Card | null;
};

function Bar({ percent }: { percent: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-violet-600 transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
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

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const response = await fetch('/api/me/achievements', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      setError('No se pudo cargar tu colección.');
      return;
    }
    setPayload((await response.json()) as Payload);
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
    document.getElementById(`logro-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPayload((current) => (current ? { ...current, celebration: null } : current));
    await authorized('/api/me/achievements', { method: 'POST', body: JSON.stringify({ code }) });
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

  if (error) {
    return (
      <section className="rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414]">
        <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Tu colección</h2>
        <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{error}</p>
      </section>
    );
  }

  if (!payload) {
    return (
      <section className="rounded-2xl border border-black/[0.04] bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#141414] sm:p-5">
        <h2 className={`text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa] ${variant === 'compact' ? 'sm:hidden' : ''}`}>
          {variant === 'compact' ? 'Logros' : 'Tu colección'}
        </h2>
        {variant === 'compact' ? <h2 className="hidden text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa] sm:block">Tu colección</h2> : null}
        <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Cargando logros…</p>
      </section>
    );
  }

  const celebration = payload.celebration;
  const strong = celebration?.rarityKey === 'epic' || celebration?.rarityKey === 'legendary' || celebration?.rarityKey === 'mythic';

  const preview = (payload.next.length > 0 ? payload.next : payload.cards.filter((card) => !card.concealed)).slice(0, 3);

  return (
    <div className="space-y-4">
      {celebration ? (
        <section className={`rounded-2xl border bg-white p-5 shadow-sm dark:bg-[#141414] ${strong ? 'border-violet-300 dark:border-violet-700' : 'border-black/[0.04] dark:border-white/10'}`}>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">¡Logro desbloqueado!</p>
          <h3 className="mt-2 text-[20px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
            {celebration.icon} {celebration.name}
          </h3>
          <p className="mt-2 text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">{celebration.unlockLine}</p>
          {celebration.xpReward > 0 ? (
            <p className="mt-2 text-[13px] font-medium text-violet-700 dark:text-violet-300">+{celebration.xpReward} XP</p>
          ) : null}
          <button
            type="button"
            onClick={() => void dismiss(celebration.code)}
            className="mt-4 rounded-full bg-[#1d1d1f] px-4 py-2 text-[13px] font-medium text-white dark:bg-white dark:text-[#1d1d1f]"
          >
            Ver logro
          </button>
        </section>
      ) : null}

      {variant === 'compact' ? (
        <section className="rounded-2xl border border-black/[0.04] bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#141414] sm:hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Logros</h2>
              <p className="mt-0.5 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{payload.unlockedCount} de {payload.total}</p>
            </div>
            {onViewAll ? (
              <button type="button" onClick={onViewAll} className="inline-flex min-h-11 items-center text-[13px] font-medium text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400">
                Ver todos
              </button>
            ) : null}
          </div>
          {preview.length > 0 ? (
            <ul className="mt-2">
              {preview.map((card) => (
                <li key={card.code} className="flex items-center justify-between gap-3 border-b border-black/5 py-2.5 last:border-0 dark:border-white/10">
                  <span className="min-w-0 truncate text-[14px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">{card.icon} {card.name}</span>
                  <span className="shrink-0 text-[13px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">{card.concealed ? '—' : `${card.progress} / ${card.target}`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Tu colección aparece aquí.</p>
          )}
        </section>
      ) : null}

      <section className={`rounded-2xl border border-black/[0.04] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#141414] ${variant === 'compact' ? 'hidden sm:block' : ''}`}>
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Tu colección</h2>
          <p className="text-[13px] tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">
            {payload.unlockedCount} / {payload.total} desbloqueados
          </p>
        </div>
        <div className="mt-3">
          <Bar percent={payload.percent} />
        </div>
        {!payload.ready ? (
          <p className="mt-3 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">
            La colección aparece cuando la migración de logros ya está aplicada.
          </p>
        ) : null}
      </section>

      {payload.next.length > 0 ? (
        <section className={`space-y-3 ${variant === 'compact' ? 'hidden sm:block' : ''}`}>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#6e6e73] dark:text-[#a3a3a3]">Próximos</h3>
          {payload.next.map((card) => (
            <article key={card.code} id={`logro-${card.code}`} className="rounded-2xl border border-black/[0.04] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#141414]">
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{card.icon} {card.name}</h4>
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-violet-600 dark:text-violet-300">{card.rarity}</span>
              </div>
              <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{card.description}</p>
              <p className="mt-3 text-[13px] tabular-nums text-[#1d1d1f] dark:text-[#fafafa]">{card.progress} / {card.target}</p>
              <div className="mt-2">
                <Bar percent={card.percent} />
              </div>
              <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{card.remainingLabel}</p>
              {card.xpReward > 0 ? <p className="mt-1 text-[12px] font-medium text-violet-700 dark:text-violet-300">+{card.xpReward} XP</p> : null}
            </article>
          ))}
        </section>
      ) : null}

      {variant === 'compact' ? null : (
        <section className="space-y-3">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#6e6e73] dark:text-[#a3a3a3]">Colección</h3>
          {payload.cards.map((card) => (
            <article key={card.code} id={`logro-${card.code}`} className="rounded-2xl border border-black/[0.04] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#141414]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">{card.category}</p>
                  <h4 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{card.icon} {card.name}</h4>
                </div>
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-violet-600 dark:text-violet-300">{card.rarity}</span>
              </div>
              <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{card.description}</p>
              {card.concealed ? null : (
                <>
                  <p className="mt-3 text-[13px] tabular-nums text-[#1d1d1f] dark:text-[#fafafa]">{card.progress} / {card.target}</p>
                  <div className="mt-2"><Bar percent={card.percent} /></div>
                  <p className="mt-2 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{card.remainingLabel}</p>
                  {card.xpReward > 0 ? <p className="mt-1 text-[12px] font-medium text-violet-700 dark:text-violet-300">+{card.xpReward} XP</p> : null}
                </>
              )}
              {card.unlocked ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void toggleFeatured(card.code)}
                  className="mt-3 text-[13px] font-medium text-violet-600 dark:text-violet-300"
                >
                  {payload.featured.includes(card.code) ? 'Quitar del perfil' : 'Mostrar en mi perfil'}
                </button>
              ) : null}
            </article>
          ))}
          <p className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">Puedes destacar hasta {MAX_FEATURED_ACHIEVEMENTS} logros en tu perfil público.</p>
        </section>
      )}
    </div>
  );
}
