'use client';

import Link from 'next/link';
import { ArrowRight, RefreshCw } from 'lucide-react';
import KpiCard from '@/app/components/panel/KpiCard';
import LoadingState from '@/app/components/panel/LoadingState';
import { formatNum } from '@/lib/operations/hubConfig';
import { healthQueuePath } from '@/lib/staff/equipoAccess';
import { useOperationsPayload } from './useOperationsPayload';

export default function OperationsOffersPanel() {
  const { data, loading, error, reload } = useOperationsPayload();

  if (loading) return <LoadingState message="Cargando salud de ofertas…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  const h = data.offerHealth;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">{h.lastScanNote}</p>
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </button>
      </div>

      {!h.tableAvailable ? (
        <p className="text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          Tabla <code className="text-xs">offer_health_state</code> no disponible. Ejecuta la migración en Supabase para
          habilitar el escaneo automático.
        </p>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Verificadas OK" value={formatNum(h.verifiedAvailable)} variant="light" />
        <KpiCard label="Precio cambiado" value={formatNum(h.priceChanged)} variant="light" />
        <KpiCard label="Agotadas" value={formatNum(h.outOfStock)} variant="light" />
        <KpiCard label="Sin escanear" value={formatNum(h.activeWithoutCheck)} variant="light" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link
          href={healthQueuePath(data.role, 'precio')}
          className="group rounded-2xl border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20 p-5 hover:border-amber-400 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cola precio cambiado</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-amber-700 dark:text-amber-400">{h.priceChanged}</p>
              <p className="text-xs text-gray-500 mt-1">Revisar y actualizar o retirar ofertas.</p>
            </div>
            <ArrowRight className="h-5 w-5 text-amber-500 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        <Link
          href={healthQueuePath(data.role, 'agotadas')}
          className="group rounded-2xl border border-red-500/20 bg-red-50/50 dark:bg-red-950/20 p-5 hover:border-red-400 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cola agotadas</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-red-700 dark:text-red-400">{h.outOfStock}</p>
              <p className="text-xs text-gray-500 mt-1">No dejar ofertas muertas en el feed.</p>
            </div>
            <ArrowRight className="h-5 w-5 text-red-500 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      </div>

      <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Contexto operativo</h2>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <li>· Ofertas live ahora: {formatNum(data.pulse.liveActive)}</li>
          <li>· Aprobadas hoy: {formatNum(data.pulse.approvedToday)}</li>
          <li>· Reportes abiertos: {formatNum(data.pulse.pendingReports)}</li>
        </ul>
        <Link href="/equipo/moderacion" className="mt-3 inline-block text-xs text-sky-600 hover:underline">
          Ir a moderación →
        </Link>
      </section>
    </div>
  );
}
