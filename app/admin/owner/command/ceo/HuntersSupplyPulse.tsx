'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Metrics = {
  pending?: number;
  needsReview?: number;
  approved?: number;
  rejected?: number;
  published?: number;
};

export default function HuntersSupplyPulse() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/hunters-ai?status=ALL&page=1', { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok || !body.metrics) {
          setState('missing');
          return;
        }
        setMetrics(body.metrics as Metrics);
        setState('ready');
      } catch {
        if (active) setState('missing');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const cells: Array<[string, number | undefined]> = [
    ['Pendientes', metrics?.pending],
    ['En revisión', metrics?.needsReview],
    ['Aprobadas', metrics?.approved],
    ['Rechazadas', metrics?.rejected],
    ['Publicadas', metrics?.published],
  ];

  return (
    <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3" aria-label="Hunters IA">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Hunters IA</p>
        <Link href="/admin/hunters-ai" className="text-xs font-medium text-violet-300 hover:underline">
          Revisar candidatos
        </Link>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {cells.map(([label, value]) => (
          <div key={label}>
            <p className="text-[11px] text-white/40">{label}</p>
            <p className="text-lg font-semibold tabular-nums text-white">{state === 'ready' ? value ?? 0 : 'Sin dato'}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
