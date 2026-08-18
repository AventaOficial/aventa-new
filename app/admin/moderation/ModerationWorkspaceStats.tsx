'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { cn } from '@/app/components/panel/utils';

type Pulse = {
  pendingTotal: number;
  pendingBot: number;
  pendingHuman: number;
  pendingReports: number;
  priceChanged: number;
  outOfStock: number;
};

export default function ModerationWorkspaceStats() {
  const { session } = useAuth();
  const [pulse, setPulse] = useState<Pulse | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    fetch('/api/staff/home?department=moderacion', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((body) => {
        const p = body?.pulse as Pulse | undefined;
        if (p) setPulse(p);
      })
      .catch(() => {});
  }, [session?.access_token]);

  if (!pulse) return null;

  const items = [
    { label: 'Pendientes', value: pulse.pendingTotal, tone: pulse.pendingTotal > 15 ? 'attention' : 'ok' },
    { label: 'Bot', value: pulse.pendingBot, tone: 'info' },
    { label: 'Cazadores', value: pulse.pendingHuman, tone: 'info' },
    { label: 'Reportes', value: pulse.pendingReports, tone: pulse.pendingReports > 0 ? 'attention' : 'ok' },
    { label: 'Precio', value: pulse.priceChanged, tone: pulse.priceChanged > 0 ? 'attention' : 'ok' },
    { label: 'Agotadas', value: pulse.outOfStock, tone: pulse.outOfStock > 0 ? 'critical' : 'ok' },
  ] as const;

  const toneClass = {
    ok: 'text-emerald-600 dark:text-emerald-400',
    attention: 'text-amber-600 dark:text-amber-400',
    critical: 'text-red-600 dark:text-red-400',
    info: 'text-gray-700 dark:text-gray-300',
  };

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.03] px-3 py-1.5"
        >
          <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{item.label}</span>
          <span className={cn('ml-2 text-sm font-semibold tabular-nums', toneClass[item.tone])}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
