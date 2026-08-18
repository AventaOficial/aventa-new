'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import KpiCard from '@/app/components/panel/KpiCard';
import LoadingState from '@/app/components/panel/LoadingState';
import AlertCard from '@/app/components/panel/AlertCard';
import HealthIndicator from '@/app/components/panel/HealthIndicator';
import { formatNum } from '@/lib/operations/hubConfig';
import OperationsTasksStrip from './OperationsTasksStrip';
import { useOperationsPayload } from './useOperationsPayload';

export default function OperationsOverviewPanel() {
  const { data, loading, error, reload } = useOperationsPayload();

  if (loading) return <LoadingState message="Cargando operaciones…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">{data.greeting}</p>
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
        <HealthIndicator
          score={data.health.status === 'ok' ? 92 : data.health.status === 'degraded' ? 68 : 35}
          size="sm"
        />
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Salud general: {data.health.status === 'ok' ? 'Operativa' : data.health.status === 'degraded' ? 'Degradada' : 'Error'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatNum(data.health.offersCount ?? 0)} ofertas · Feed {data.health.feedViewOk ? 'OK' : 'con problemas'}
            {data.integrity ? ` · Integridad ${data.integrity.ok ? 'OK' : `${data.integrity.failed} fallos`}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Ofertas live" value={formatNum(data.pulse.liveActive)} variant="light" />
        <KpiCard label="Precio cambiado" value={formatNum(data.pulse.priceChanged)} variant="light" />
        <KpiCard label="Agotadas" value={formatNum(data.pulse.outOfStock)} variant="light" />
        <KpiCard label="Cola escritura" value={formatNum(data.queue.pending)} variant="light" />
      </div>

      {data.alerts.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Requiere atención
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {data.alerts.map((a) => (
              <AlertCard
                key={a.id}
                severity={a.tone === 'critical' ? 'critical' : a.tone === 'attention' ? 'attention' : 'info'}
                title={`${a.label}${a.count > 0 ? ` (${a.count})` : ''}`}
                impact={a.detail}
                href={a.href}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-6">
        <OperationsTasksStrip board={data.board} taskPct={data.taskPct} onTasksChange={() => void reload()} />

        <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Áreas del producto</h2>
          <ul className="space-y-2">
            {data.areasPulse.areas.map((area) => (
              <li key={area.key} className="flex items-start justify-between gap-2 text-sm">
                <span className="text-gray-700 dark:text-gray-300">{area.title}</span>
                <span className={area.status === 'ok' ? 'text-emerald-600 text-xs font-medium' : 'text-red-600 text-xs font-medium'}>
                  {area.status === 'ok' ? 'OK' : 'Error'}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/equipo/operaciones/salud" className="mt-3 inline-block text-xs text-sky-600 hover:underline">
            Ver detalle de salud →
          </Link>
        </section>
      </div>

      {data.role === 'owner' ? (
        <p className="text-xs text-gray-500 text-center">
          Configuración profunda (bot, afiliados, go/no-go):{' '}
          <Link href="/admin/operaciones" className="text-sky-600 hover:underline">
            Centro de operaciones (admin)
          </Link>
        </p>
      ) : null}
    </div>
  );
}
