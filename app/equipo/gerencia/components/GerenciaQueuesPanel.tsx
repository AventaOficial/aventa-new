'use client';

import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import LoadingState from '@/app/components/panel/LoadingState';
import EmptyState from '@/app/components/panel/EmptyState';
import { queueToneClass } from '@/lib/gerencia/hubConfig';
import { useGerenciaPayload } from './useGerenciaPayload';

export default function GerenciaQueuesPanel() {
  const { data, loading, error, reload } = useGerenciaPayload();

  if (loading) return <LoadingState message="Cargando colas…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
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

      {data.queue.length === 0 ? (
        <EmptyState title="Sin colas activas" description="Todo limpio por ahora." variant="light" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.queue.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`rounded-2xl border p-4 transition-all hover:scale-[1.01] ${queueToneClass(item.tone)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.label}</p>
                <span className="text-2xl font-bold tabular-nums">{item.count}</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{item.detail}</p>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mt-2">{item.department}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
