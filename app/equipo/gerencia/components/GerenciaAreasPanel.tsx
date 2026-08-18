'use client';

import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import LoadingState from '@/app/components/panel/LoadingState';
import { pctToneClass } from '@/lib/gerencia/hubConfig';
import { useGerenciaPayload } from './useGerenciaPayload';

export default function GerenciaAreasPanel() {
  const { data, loading, error, reload } = useGerenciaPayload();

  if (loading) return <LoadingState message="Cargando áreas…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Progreso del checklist diario por departamento. Cada área gestiona sus tareas en su hub correspondiente.
      </p>
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

      <div className="grid gap-4 sm:grid-cols-2">
        {data.departmentProgress.map((d) => (
          <Link
            key={d.department}
            href={d.href}
            className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-5 hover:border-violet-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{d.label}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {d.pendingTasks} pendiente(s) de {d.totalTasks}
                </p>
              </div>
              <span className={`text-lg font-bold tabular-nums ${pctToneClass(d.taskPct)}`}>{d.taskPct}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${d.taskPct}%` }} />
            </div>
            <p className="text-xs text-violet-600 mt-3">Abrir área →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
