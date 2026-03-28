'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/app/providers/AuthProvider';

const PAGE_SIZE = 50;

type LogRow = {
  id: string;
  offer_id: string | null;
  user_id: string | null;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  display_name: string | null;
  offer_title: string | null;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const { session, user } = useAuth();

  useEffect(() => {
    setPage(1);
  }, [user?.id]);

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      setError('Inicia sesión para ver los logs.');
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/admin/logs?page=${page}&limit=${PAGE_SIZE}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((res) => {
        if (!res.ok) return res.json().then((j) => Promise.reject(new Error(j?.error ?? 'Error')));
        return res.json();
      })
      .then((data) => {
        setLogs(Array.isArray(data?.logs) ? data.logs : []);
        setTotal(typeof data?.total === 'number' ? data.total : 0);
        setPageLimit(typeof data?.limit === 'number' ? data.limit : PAGE_SIZE);
      })
      .catch((e) => setError(e?.message ?? 'Error al cargar logs'))
      .finally(() => setLoading(false));
  }, [session?.access_token, page]);

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Logs de auditoría
        </h1>
        <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Logs de auditoría
        </h1>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-amber-800 dark:text-amber-200">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
        Logs de auditoría
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Cambios de estado en moderación, penalizaciones y ajustes (paginado).
      </p>
      {logs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">No hay registros aún.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Fecha</th>
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Quién</th>
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Acción</th>
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Estado</th>
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Oferta</th>
                  <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="p-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">
                      {log.display_name ?? log.user_id ?? '—'}
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">{log.action}</td>
                    <td className="p-3 text-gray-600 dark:text-gray-400">
                      {log.previous_status != null && log.new_status != null
                        ? `${log.previous_status} → ${log.new_status}`
                        : log.new_status ?? log.previous_status ?? '—'}
                    </td>
                    <td className="p-3">
                      {log.offer_id ? (
                        <Link
                          href={`/admin/moderation?offerId=${log.offer_id}`}
                          className="text-purple-600 dark:text-purple-400 hover:underline truncate max-w-[180px] block"
                          title={log.offer_title ?? log.offer_id}
                        >
                          {log.offer_title ?? log.offer_id.slice(0, 8) + '…'}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate" title={log.reason ?? ''}>
                      {log.reason ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Página {page} de {Math.max(1, Math.ceil(total / pageLimit))} · {total} registros
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page >= Math.max(1, Math.ceil(total / pageLimit)) || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
