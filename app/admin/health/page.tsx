'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { canAccessHealth, type Role } from '@/lib/admin/roles';

type MetricRow = {
  date: string;
  total_offers_created: number;
  total_votes: number;
  total_views: number;
  total_outbound: number;
  ctr: number | null;
};

type VisibilityPayload = {
  health: {
    status: string;
    offersCount: number | null;
    feedViewOk: boolean;
    checkedAt: string;
    message?: string;
  };
  lastFeedLoadedCount: number | null;
  recentErrors: Array<{
    at: string;
    type: string;
    source: string;
    metadata?: Record<string, unknown>;
  }>;
};

function statusBadgeClass(status: string): string {
  if (status === 'ok') {
    return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200';
  }
  if (status === 'degraded') {
    return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200';
  }
  return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200';
}

export default function HealthPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibility, setVisibility] = useState<VisibilityPayload | null>(null);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [roleOk, setRoleOk] = useState(false);

  const loadVisibility = useCallback(async (token: string) => {
    setVisibilityLoading(true);
    setVisibilityError(null);
    try {
      const res = await fetch('/api/admin/visibility', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVisibilityError((json?.error as string) ?? 'No se pudo cargar la visibilidad');
        setVisibility(null);
        return;
      }
      setVisibility(json as VisibilityPayload);
    } catch {
      setVisibilityError('Error de red');
      setVisibility(null);
    } finally {
      setVisibilityLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        setLoading(false);
        return;
      }
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!canAccessHealth((roleRow?.role as Role) ?? null)) {
        router.push('/');
        setLoading(false);
        return;
      }
      setRoleOk(true);
      try {
        const { data } = await supabase
          .from('daily_system_metrics')
          .select('date, total_offers_created, total_votes, total_views, total_outbound, ctr')
          .order('date', { ascending: false })
          .limit(30);
        setMetrics((data ?? []) as MetricRow[]);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!roleOk || !session?.access_token) return;
    void loadVisibility(session.access_token);
  }, [roleOk, session?.access_token, loadVisibility]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-10">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">System Health</h1>

        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Visibilidad operativa
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Estado del servidor, ofertas en base y últimos errores reportados por clientes (buffer en esta instancia).
          </p>
          {visibilityLoading && !visibility ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Cargando…</p>
          ) : visibilityError ? (
            <p className="text-amber-600 dark:text-amber-400 text-sm">{visibilityError}</p>
          ) : visibility ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <div
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${statusBadgeClass(visibility.health.status)}`}
                >
                  Sistema: {visibility.health.status}
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                  Ofertas en catálogo (DB):{' '}
                  <span className="font-semibold">
                    {visibility.health.offersCount != null ? visibility.health.offersCount : '—'}
                  </span>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                  Vista feed (ofertas_ranked_general):{' '}
                  <span className="font-semibold">
                    {visibility.health.feedViewOk ? 'OK' : 'Fallo'}
                  </span>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                  Última carga de feed (cliente, último evento):{' '}
                  <span className="font-semibold">
                    {visibility.lastFeedLoadedCount != null ? visibility.lastFeedLoadedCount : '—'}
                  </span>
                </div>
              </div>
              {visibility.health.message && (
                <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                  {visibility.health.message}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Comprobado: {new Date(visibility.health.checkedAt).toLocaleString('es-MX')} ·{' '}
                <a
                  href="/api/health"
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-600 dark:text-violet-400 hover:underline"
                >
                  /api/health
                </a>
              </p>
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                  Errores recientes (cliente)
                </h3>
                {visibility.recentErrors.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Ninguno en buffer.</p>
                ) : (
                  <ul className="space-y-2 max-h-64 overflow-y-auto text-sm">
                    {visibility.recentErrors.map((e, i) => (
                      <li
                        key={`${e.at}-${e.source}-${i}`}
                        className="rounded-lg bg-gray-50 dark:bg-gray-900/50 px-3 py-2 border border-gray-100 dark:border-gray-700"
                      >
                        <span className="text-gray-500 dark:text-gray-400 text-xs">
                          {new Date(e.at).toLocaleString('es-MX')}
                        </span>{' '}
                        <span className="font-medium text-gray-800 dark:text-gray-200">{e.type}</span>{' '}
                        <span className="text-violet-600 dark:text-violet-400">{e.source}</span>
                        {e.metadata && Object.keys(e.metadata).length > 0 ? (
                          <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap break-all">
                            {JSON.stringify(e.metadata, null, 0)}
                          </pre>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Métricas diarias (tabla)
          </h2>
          {loading ? (
            <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      date
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      total_offers_created
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      total_votes
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      total_views
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      total_outbound
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      ctr
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {metrics.map((row) => (
                    <tr key={row.date}>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{row.date}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                        {row.total_offers_created}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                        {row.total_votes}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                        {row.total_views}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                        {row.total_outbound}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                        {row.ctr != null ? `${row.ctr.toFixed(2)}%` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
