'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, Info } from 'lucide-react';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { getYmdInTz } from '@/lib/owner/mxTime';
import type { FounderModule } from '@/lib/founderOs/modules';
import { moduleStatus, type ModuleStatus, type ModuleStatusLabel } from '@/lib/founderOs/moduleStatus';
import { cn } from '@/app/components/panel/utils';
import { deriveHealth, derivePriorities } from '../command/derive';
import { fetchJson, getToken } from '../command/useCommandCenter';

const TONE: Record<ModuleStatusLabel, string> = {
  Healthy: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  Atención: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  Crítico: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
  'Sin datos': 'border-white/15 bg-white/[0.04] text-white/60',
  Congelado: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  Informativo: 'border-white/15 bg-white/[0.04] text-white/60',
};

type LoadState = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; value: ModuleStatus; at: number };

function formatInstant(ms: number | string): string {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(ms),
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{label}</dt>
      <dd className="mt-0.5 text-[13px] leading-relaxed text-white/75">{children}</dd>
    </div>
  );
}

export default function ModuleBrief({ module }: { module: FounderModule }) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<LoadState>({ status: 'idle' });

  const loadStatus = async () => {
    if (module.healthArea == null && module.teams.length === 0) {
      setLoad({ status: 'ready', value: moduleStatus(module, [], []), at: Date.now() });
      return;
    }
    setLoad({ status: 'loading' });
    try {
      const token = await getToken();
      if (!token) throw new Error('Sin sesión');
      const [base, cmd] = await Promise.all([
        fetchJson<OwnerDashboardPayload>('/api/admin/owner-dashboard', token),
        fetchJson<OwnerCommandPayload>('/api/admin/owner-dashboard?view=command&range=today', token),
      ]);
      const now = Date.now();
      const today = getYmdInTz(new Date(now));
      const value = moduleStatus(module, deriveHealth(base, cmd, today, now), derivePriorities(base, cmd, today, now));
      setLoad({ status: 'ready', value, at: now });
    } catch {
      setLoad({ status: 'error' });
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && load.status === 'idle') void loadStatus();
  };

  const panelId = `module-brief-${module.href.replace(/\W+/g, '-')}`;

  return (
    <section data-module-brief={module.href} className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-white">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2.5 rounded-2xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
      >
        <Info className="h-4 w-4 shrink-0 text-violet-300" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-white/90">{module.name} · ¿Qué es esto?</span>
          <span className="block truncate text-[12px] text-white/45">{module.whyExists}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-white/40 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open ? (
        <div id={panelId} className="grid gap-5 border-t border-white/[0.06] px-4 py-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-4">
            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Qué es</h2>
              <div className="mt-1 space-y-1 text-[13px] leading-relaxed text-white/75">
                {module.whatIs.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Por qué existe">{module.whyExists}</Field>
              <Field label="Qué protege">{module.protects}</Field>
              <Field label="Qué mide">{module.measures}</Field>
              <Field label="Cómo interpretarlo">{module.howToRead}</Field>
            </dl>
          </div>

          <div className="space-y-3 rounded-xl border border-white/[0.06] bg-black/20 p-3.5" aria-live="polite">
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Estado">
                {load.status === 'ready' ? (
                  <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold', TONE[load.value.label])}>
                    {load.value.label}
                  </span>
                ) : load.status === 'error' ? (
                  <span className="text-white/50">No disponible</span>
                ) : (
                  <span className="text-white/50">Revisando…</span>
                )}
              </Field>
              <Field label="Responsable">{module.owner}</Field>
            </dl>
            {load.status === 'ready' && load.value.summary ? <p className="text-[12px] text-white/60">{load.value.summary}</p> : null}

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Qué requiere atención</p>
              {load.status === 'ready' ? (
                load.value.attention.length === 0 ? (
                  <p className="mt-1 text-[12px] text-white/55">Nada pendiente en este momento.</p>
                ) : (
                  <ul className="mt-1 space-y-1.5">
                    {load.value.attention.slice(0, 3).map((p) => (
                      <li key={p.id}>
                        <Link href={p.href} className="group flex items-start gap-1.5 text-[12px] text-white/75 hover:text-white">
                          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden />
                          <span>
                            <span className="font-medium">{p.problem}</span>
                            <span className="text-white/45"> — {p.action}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )
              ) : load.status === 'error' ? (
                <button type="button" onClick={() => void loadStatus()} className="mt-1 text-[12px] font-medium text-violet-300 hover:text-violet-200">
                  No se pudo cargar el estado. Reintentar
                </button>
              ) : (
                <p className="mt-1 text-[12px] text-white/45">Revisando…</p>
              )}
            </div>

            <p className="text-[11px] text-white/40">
              Última actualización:{' '}
              {load.status === 'ready'
                ? load.value.updatedAt
                  ? formatInstant(load.value.updatedAt)
                  : `consultado ${formatInstant(load.at)}`
                : '—'}
            </p>

            <details className="group">
              <summary className="cursor-pointer list-none text-[11px] font-medium text-white/40 hover:text-white/70 [&::-webkit-details-marker]:hidden">
                Ver detalles técnicos
              </summary>
              <ul className="mt-1.5 space-y-0.5 font-mono text-[10.5px] text-white/45">
                {module.technical.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      ) : null}
    </section>
  );
}
