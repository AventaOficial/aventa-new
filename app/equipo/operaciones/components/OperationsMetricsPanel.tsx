'use client';

import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import KpiCard from '@/app/components/panel/KpiCard';
import LoadingState from '@/app/components/panel/LoadingState';
import EmptyState from '@/app/components/panel/EmptyState';
import Sparkline from '@/app/components/panel/Sparkline';
import { formatNum } from '@/lib/operations/hubConfig';
import { useOperationsPayload } from './useOperationsPayload';

export default function OperationsMetricsPanel() {
  const { data, loading, error, reload } = useOperationsPayload();

  if (loading) return <LoadingState message="Cargando métricas…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  if (!data.canMetrics) {
    return (
      <EmptyState
        title="Métricas restringidas"
        description="Solo analista, admin u owner pueden ver métricas de producto. Gerencia puede revisar alertas en Resumen y Salud."
        variant="light"
      />
    );
  }

  const pm = data.productMetrics;
  const viewsSeries = [...data.dailyMetrics].reverse().map((d) => d.total_views);
  const outboundSeries = [...data.dailyMetrics].reverse().map((d) => d.total_outbound);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">Métricas de producto y tráfico (últimos 14 días).</p>
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </button>
      </div>

      {pm ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Usuarios nuevos hoy" value={formatNum(pm.new_users_today)} variant="light" />
          <KpiCard label="Activos 24h" value={formatNum(pm.active_users_24h)} variant="light" />
          <KpiCard
            label="Crecimiento 7d"
            value={pm.growth_weekly_pct != null ? `${pm.growth_weekly_pct > 0 ? '+' : ''}${pm.growth_weekly_pct}%` : '—'}
            variant="light"
          />
          <KpiCard label="Vistas hoy" value={formatNum(data.dailyMetrics[0]?.total_views ?? 0)} variant="light" />
        </div>
      ) : null}

      {data.dailyMetrics.length > 0 ? (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Vistas diarias</h2>
            <Sparkline data={viewsSeries} variant="light" className="h-16" />
          </section>
          <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Clics outbound</h2>
            <Sparkline data={outboundSeries} variant="light" className="h-16" />
          </section>
        </div>
      ) : (
        <EmptyState title="Sin métricas diarias" description="La vista daily_system_metrics no tiene datos aún." variant="light" />
      )}

      {data.dailyMetrics.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.06] dark:border-white/[0.08]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.03] text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Ofertas</th>
                <th className="px-3 py-2.5 font-medium">Vistas</th>
                <th className="px-3 py-2.5 font-medium">Outbound</th>
                <th className="px-3 py-2.5 font-medium">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.dailyMetrics.map((d) => (
                <tr key={d.date}>
                  <td className="px-3 py-2.5 tabular-nums text-xs">{d.date}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatNum(d.total_offers_created)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatNum(d.total_views)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatNum(d.total_outbound)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{d.ctr != null ? `${d.ctr}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-xs text-gray-500 text-center">
        Análisis profundo:{' '}
        <Link href="/admin/metrics" className="text-sky-600 hover:underline">
          /admin/metrics
        </Link>
      </p>
    </div>
  );
}
