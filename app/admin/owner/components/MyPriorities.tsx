'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import GlassCard from '@/app/components/panel/GlassCard';
import SectionHeader from '@/app/components/panel/SectionHeader';
import { cn } from '@/app/components/panel/utils';

type Priority = 'alta' | 'media' | 'baja';

type PriorityItem = {
  id: string;
  text: string;
  priority: Priority;
};

const STORAGE_KEY = 'aventa-owner-priorities';

const PRIORITY_STYLE: Record<Priority, string> = {
  alta: 'border-l-red-400',
  media: 'border-l-amber-400',
  baja: 'border-l-white/20',
};

export default function MyPriorities({ suggested }: { suggested?: { title: string; priority: Priority }[] }) {
  const [items, setItems] = useState<PriorityItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as PriorityItem[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (items.length === 0 && suggested && suggested.length > 0) {
      const seeded = suggested.slice(0, 3).map((s, i) => ({
        id: `suggested-${i}`,
        text: s.title,
        priority: s.priority,
      }));
      setItems(seeded);
    }
  }, [suggested, items.length]);

  const persist = useCallback((next: PriorityItem[]) => {
    setItems(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const addItem = () => {
    if (!draft.trim()) return;
    persist(
      ([
        ...items,
        { id: `p-${Date.now()}`, text: draft.trim(), priority: 'media' as Priority },
      ] as PriorityItem[]).slice(0, 5)
    );
    setDraft('');
    setAdding(false);
  };

  const removeItem = (id: string) => persist(items.filter((i) => i.id !== id));

  return (
    <GlassCard variant="dark" padding="lg">
      <SectionHeader title="Tus prioridades de hoy" subtitle="Personal · máximo 5" variant="dark" />
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              'flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] border-l-2 bg-white/[0.02] px-3 py-2.5',
              PRIORITY_STYLE[item.priority]
            )}
          >
            <div>
              <p className="text-sm text-white/80">{item.text}</p>
              <p className="text-[10px] uppercase text-white/30 mt-0.5">{item.priority} prioridad</p>
            </div>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="text-white/25 hover:text-white/50 p-1"
              aria-label="Eliminar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {items.length < 5 && (
        adding ? (
          <div className="mt-3 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              placeholder="Nueva prioridad…"
              className="flex-1 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-violet-500/40"
              autoFocus
            />
            <button
              type="button"
              onClick={addItem}
              className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-500"
            >
              Añadir
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar prioridad
          </button>
        )
      )}
    </GlassCard>
  );
}
