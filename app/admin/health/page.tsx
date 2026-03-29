'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { canAccessHealth, type Role } from '@/lib/admin/roles';
import { CheckCircle2, XCircle, Activity } from 'lucide-react';

type MetricRow = {
  date: string;
  total_offers_created: number;
  total_votes: number;
  total_views: number;
  total_outbound: number;
  ctr: number | null;
};

type PulseArea = {
  key: string;
  title: string;
  plain: string;
  whatFor: string;
  status: 'ok' | 'error';
  summary: string;
  technical?: string;
};

type AreasPulsePayload = {
  checkedAt: string;
  checkDurationMs: number;
  areas: PulseArea[];
};

type VisibilityPayload = {
  health: {
    status: string;
    offersCount: number | null;
    feedViewOk: boolean;
    checkedAt: string;
    message?: string;
  };
  areasPulse?: AreasPulsePayload;
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

  const pulse = visibility?.areasPulse;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Salud del sistema</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Resumen fácil: si todo está en verde abajo, las piezas principales de la base de datos responden.
            No reemplaza probar la web con tus propias manos.
          </p>
        </div>

        {/* Pulso por áreas (niño de secundaria) */}
        <section className="rounded-xl border border-violet-200/80 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              ¿Las partes importantes responden?
            </h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Cada tarjeta es una pregunta simple: &quot;¿el servidor puede leer esto?&quot;. Si ves una X roja,
            algo grave está roto en base de datos o vistas (hay que revisar antes de promocionar).
          </p>
          {visibilityLoading && !visibility ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Cargando comprobaciones…</p>
          ) : visibilityError ? (
            <p className="text-amber-600 dark:text-amber-400 text-sm">{visibilityError}</p>
          ) : pulse ? (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Esta lectura en servidor tardó{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">{pulse.checkDurationMs} ms</span>
                {' — '}
                solo mide cuánto tardó Supabase en contestar estas 4 preguntas, no la velocidad que siente un usuario
                en el celular.
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {pulse.areas.map((a) => (
                  <li
                    key={a.key}
                    className={`rounded-xl border p-4 ${
                      a.status === 'ok'
                        ? 'border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-gray-800/80'
                        : 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {a.status === 'ok' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{a.title}</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{a.plain}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{a.whatFor}</p>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-2">{a.summary}</p>
                        {a.technical ? (
                          <p className="text-xs font-mono text-red-700 dark:text-red-300 mt-2 break-all">
                            {a.technical}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                Comprobado: {new Date(pulse.checkedAt).toLocaleString('es-MX')}
              </p>
            </>
          ) : null}
        </section>

        {/* Detalle técnico + errores cliente */}
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Resumen técnico y errores del navegador
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Estado global, conteos y lo que los visitantes mandaron a logs (si lo tienes activado en producción).
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
                  Todo junto: {visibility.health.status}
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                  Ofertas (tabla):{' '}
                  <span className="font-semibold">
                    {visibility.health.offersCount != null ? visibility.health.offersCount : '—'}
                  </span>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                  Vista del feed:{' '}
                  <span className="font-semibold">
                    {visibility.health.feedViewOk ? 'OK' : 'Fallo'}
                  </span>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                  Última carga de feed (reportada por app):{' '}
                  <span className="font-semibold">
                    {visibility.lastFeedLoadedCount != null ? visibility.lastFeedLoadedCount : '—'}
                  </span>
                </div>
              </div>
              {visibility.lastFeedLoadedCount == null ? (
                <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 border border-amber-200/80 dark:border-amber-900/50">
                  Si aquí ves &quot;—&quot;, casi seguro es porque en producción no está activado{' '}
                  <code className="text-[11px]">NEXT_PUBLIC_CLIENT_EVENTS_ENABLED=true</code>. No es un fallo del feed:
                  solo no estamos guardando ese número en el servidor.
                </p>
              ) : null}
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
                </a>{' '}
                (público, sirve para monitores)
              </p>
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                  Errores recientes enviados desde el navegador
                </h3>
                {visibility.recentErrors.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Ninguno en la memoria de este servidor (se borra al reiniciar o al cambiar de instancia).
                  </p>
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Números por día (resumen de actividad)
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Cada fila es un día. Son totales guardados en la base (no tiempo real al segundo).
            <br />
            <strong className="text-gray-800 dark:text-gray-200">Fecha</strong> = día calendario.{' '}
            <strong className="text-gray-800 dark:text-gray-200">Ofertas nuevas</strong> = cuántas ofertas se crearon
            ese día. <strong className="text-gray-800 dark:text-gray-200">Votos</strong> = votos ese día.{' '}
            <strong className="text-gray-800 dark:text-gray-200">Vistas</strong> = cuántas veces se vieron tarjetas.{' '}
            <strong className="text-gray-800 dark:text-gray-200">Clics salida</strong> = ir a la tienda.{' '}
            <strong className="text-gray-800 dark:text-gray-200">CTR</strong> = salidas ÷ vistas (porcentaje).
          </p>
          {loading ? (
            <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                      Fecha
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                      Ofertas nuevas
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                      Votos
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                      Vistas
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                      Clics a tienda
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                      CTR %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {metrics.map((row) => (
                    <tr key={row.date}>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{row.date}</td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                        {row.total_offers_created}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                        {row.total_votes}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                        {row.total_views}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                        {row.total_outbound}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                        {row.ctr != null ? `${row.ctr.toFixed(2)}%` : '—'}
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
