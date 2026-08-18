'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import KpiCard from '@/app/components/panel/KpiCard';
import LoadingState from '@/app/components/panel/LoadingState';
import HealthIndicator from '@/app/components/panel/HealthIndicator';
import { pctToneClass } from '@/lib/gerencia/hubConfig';
import GerenciaTasksStrip from './GerenciaTasksStrip';
import { useGerenciaPayload } from './useGerenciaPayload';

function slaScore(pending: number, threshold: number, approved: number, target: number): number {
  let score = 100;
  if (pending > threshold) score -= Math.min(40, (pending - threshold) * 4);
  if (approved < target) score -= Math.min(30, (target - approved) * 10);
  return Math.max(0, Math.min(100, score));
}

export default function GerenciaOverviewPanel() {
  const { data, loading, error, reload } = useGerenciaPayload();

  if (loading) return <LoadingState message="Cargando gerencia…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  const score = slaScore(
    data.sla.pendingTotal,
    data.sla.pendingWarnThreshold,
    data.sla.approvedToday,
    data.sla.liveTarget,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{data.greeting}</p>
          {data.canAssignRoles ? (
            <p className="text-xs text-gray-500 mt-1">
              Asignar roles:{' '}
              <Link href="/admin/team" className="text-violet-600 hover:underline">
                Admin → Equipo y roles
              </Link>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </button>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
        <HealthIndicator score={score} size="sm" />
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">SLA del día</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {data.sla.pendingTotal} pendientes mod · {data.sla.approvedToday}/{data.sla.liveTarget} aprobadas ·{' '}
            {data.pulse.liveActive} live
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Pendientes mod" value={String(data.sla.pendingTotal)} variant="light" />
        <KpiCard label="Aprobadas hoy" value={String(data.sla.approvedToday)} variant="light" />
        <KpiCard label="Ofertas live" value={String(data.pulse.liveActive)} variant="light" />
        <KpiCard label="Reportes abiertos" value={String(data.pulse.pendingReports)} variant="light" />
      </div>

      {data.alerts.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Alertas
          </h2>
          {data.alerts.map((a) => (
            <div
              key={a}
              className="flex gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {a}
            </div>
          ))}
        </section>
      ) : (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Sin alertas críticas ahora mismo.</p>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <GerenciaTasksStrip board={data.board} taskPct={data.taskPct} onTasksChange={() => void reload()} />

        <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Progreso por área</h2>
            <Link href="/equipo/gerencia/areas" className="text-xs text-violet-600 hover:underline">
              Ver todas
            </Link>
          </div>
          <ul className="space-y-3">
            {data.departmentProgress.slice(0, 4).map((d) => (
              <li key={d.department}>
                <div className="flex justify-between text-sm mb-1">
                  <Link href={d.href} className="font-medium text-gray-800 dark:text-gray-200 hover:text-violet-600">
                    {d.label}
                  </Link>
                  <span className={`tabular-nums font-medium ${pctToneClass(d.taskPct)}`}>{d.taskPct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${d.taskPct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Colas prioritarias</h2>
          <Link href="/equipo/gerencia/colas" className="text-xs text-violet-600 hover:underline">
            Ver colas
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.queue.slice(0, 6).map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4 hover:border-violet-300 transition-colors"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.label}</p>
              <p className="text-2xl font-semibold tabular-nums mt-1">{item.count}</p>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.detail}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
