'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Target, Smartphone, ShoppingBag } from 'lucide-react';

type Period = '24h' | '7d';

type ApiPayload = {
  period: Period;
  techApproved: number;
  vitalApproved: number;
  targets: { tech: number; vital: number };
};

export default function ModerationObjectivesSidebar() {
  const { session } = useAuth();
  const [period, setPeriod] = useState<Period>('7d');
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/admin/moderation-objectives?period=${period}`, { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'No se pudieron cargar objetivos');
        setData(null);
        return;
      }
      setData(body as ApiPayload);
    } catch {
      setError('Error de red');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, period]);

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    load();
  }, [session?.access_token, load]);

  const tech = data?.techApproved ?? 0;
  const vital = data?.vitalApproved ?? 0;
  const tTech = data?.targets.tech ?? 10;
  const tVital = data?.targets.vital ?? 20;
  const pct = (n: number, d: number) => Math.min(100, d > 0 ? Math.round((n / d) * 100) : 0);

  return (
    <aside className="lg:sticky lg:top-4 space-y-4">
      <div className="rounded-2xl border border-violet-200/80 dark:border-violet-800/50 bg-gradient-to-b from-violet-50/90 to-white dark:from-violet-950/40 dark:to-gray-900 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Objetivos de catálogo</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Aprobaciones registradas en el periodo (por categoría actual de la oferta).
            </p>
          </div>
        </div>

        <div className="flex rounded-xl bg-gray-100/80 dark:bg-gray-800/80 p-0.5 mb-4">
          {(['24h', '7d'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-white dark:bg-gray-700 text-violet-700 dark:text-violet-300 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {p === '24h' ? '24 h' : '7 días'}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">Cargando…</p>
        ) : error ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-violet-500" />
                  Tecnología
                </span>
                <span className="text-xs tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                  {tech}/{tTech}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all"
                  style={{ width: `${pct(tech, tTech)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-500 leading-snug">
                Ofertas con categoría tecnología aprobadas en la ventana.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Día a día (vitales)
                </span>
                <span className="text-xs tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                  {vital}/{tVital}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct(vital, tVital)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-500 leading-snug">
                Incluye tecnología, gaming, hogar, súper, moda, belleza, viajes y servicios.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
        <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Cómo se calcula</p>
        <p>
          Se cuentan acciones de aprobación en el periodo; cada oferta cuenta una vez. La categoría es la de la oferta
          ahora (si la editaste después, refleja el catálogo actual).
        </p>
        <p className="mt-2">
          Las metas ({tTech} / {tVital}) son orientativas: ajústalas en código en{' '}
          <code className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1 rounded">lib/moderation/objectives.ts</code>.
        </p>
      </div>
    </aside>
  );
}
