'use client';

import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import LoadingState from '@/app/components/panel/LoadingState';
import StatusBadge from '@/app/components/panel/StatusBadge';
import { formatNum } from '@/lib/operations/hubConfig';
import { useOperationsPayload } from './useOperationsPayload';

export default function OperationsHealthPanel() {
  const { data, loading, error, reload } = useOperationsPayload();

  if (loading) return <LoadingState message="Cargando salud…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </button>
      </div>

      <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Snapshot del sitio</h2>
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-gray-500 text-xs">Estado</dt>
            <dd className="mt-1">
              <StatusBadge tone={data.health.status === 'ok' ? 'ok' : data.health.status === 'degraded' ? 'attention' : 'critical'}>
                {data.health.status}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">Ofertas totales</dt>
            <dd className="mt-1 font-medium tabular-nums">{formatNum(data.health.offersCount ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">Vista feed</dt>
            <dd className="mt-1">{data.health.feedViewOk ? 'Responde OK' : 'Error al leer'}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">Última revisión</dt>
            <dd className="mt-1 text-xs tabular-nums">{new Date(data.health.checkedAt).toLocaleString('es-MX')}</dd>
          </div>
        </dl>
        {data.health.message ? <p className="mt-3 text-xs text-red-600">{data.health.message}</p> : null}
      </section>

      <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Áreas del producto</h2>
        <ul className="space-y-3">
          {data.areasPulse.areas.map((area) => (
            <li key={area.key} className="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{area.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{area.plain}</p>
                </div>
                <StatusBadge tone={area.status === 'ok' ? 'ok' : 'critical'}>{area.status === 'ok' ? 'OK' : 'Error'}</StatusBadge>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{area.summary}</p>
              {area.technical ? <p className="text-[11px] text-red-500 mt-1 font-mono">{area.technical}</p> : null}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-gray-500 mt-3">
          Chequeo en {data.areasPulse.checkDurationMs}ms · {new Date(data.areasPulse.checkedAt).toLocaleString('es-MX')}
        </p>
      </section>

      <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Integridad (cron)</h2>
        {data.integrity ? (
          <>
            <div className="flex flex-wrap gap-3 text-sm mb-4">
              <StatusBadge tone={data.integrity.ok ? 'ok' : 'critical'}>
                {data.integrity.ok ? 'Todo OK' : `${data.integrity.failed} fallos`}
              </StatusBadge>
              <span className="text-gray-500 text-xs">
                {data.integrity.passed} pasaron · último:{' '}
                {data.integrity.finishedAt ? new Date(data.integrity.finishedAt).toLocaleString('es-MX') : '—'}
              </span>
            </div>
            <ul className="space-y-2">
              {data.integrity.checks.map((c) => (
                <li key={c.name} className="flex items-start gap-2 text-sm">
                  <span className={c.ok ? 'text-emerald-600' : 'text-red-600'}>{c.ok ? '✓' : '✗'}</span>
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-200">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-gray-500">Sin snapshot de integridad. El cron system-integrity aún no corrió.</p>
        )}
      </section>

      <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Cola de escritura</h2>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-gray-500 text-xs">Pendientes</p>
            <p className="text-xl font-semibold tabular-nums">{formatNum(data.queue.pending)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Fallidos</p>
            <p className={`text-xl font-semibold tabular-nums ${data.queue.failed > 0 ? 'text-red-600' : ''}`}>
              {formatNum(data.queue.failed)}
            </p>
          </div>
        </div>
      </section>

      {data.canMetrics ? (
        <p className="text-xs text-gray-500 text-center">
          Panel extendido:{' '}
          <Link href="/admin/health" className="text-sky-600 hover:underline">
            /admin/health
          </Link>
        </p>
      ) : null}
    </div>
  );
}
