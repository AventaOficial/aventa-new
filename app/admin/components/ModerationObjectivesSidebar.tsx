'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Target, ShieldCheck, LayoutGrid } from 'lucide-react';
import { ALL_CATEGORIES } from '@/lib/categories';

type Period = '24h' | '7d';

type ApiPayload = {
  period: Period;
  totalApproved: number;
  qualityApproved: number;
  categoryApproved: Record<string, number>;
  targets: {
    total: number;
    quality: number;
    categories: Record<string, number>;
  };
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

  const total = data?.totalApproved ?? 0;
  const quality = data?.qualityApproved ?? 0;
  const tTotal = data?.targets.total ?? 50;
  const tQuality = data?.targets.quality ?? 10;
  const pct = (n: number, d: number) => Math.min(100, d > 0 ? Math.round((n / d) * 100) : 0);
  const labelByValue = Object.fromEntries(ALL_CATEGORIES.map((c) => [c.value, c.label]));
  const categoryRows = Object.entries(data?.targets.categories ?? {}).map(([value, target]) => ({
    value,
    label: labelByValue[value] ?? value,
    target,
    approved: data?.categoryApproved?.[value] ?? 0,
  }));

  return (
    <aside className="lg:sticky lg:top-4 space-y-4">
      <div className="rounded-2xl border border-violet-200/80 dark:border-violet-800/50 bg-gradient-to-b from-violet-50/90 to-white dark:from-violet-950/40 dark:to-gray-900 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Objetivos diarios AVENTA</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Meta: 50 ofertas aprobadas al día, 10 de calidad y el resto distribuido por categoría.
            </p>
          </div>
        </div>

        <div className="flex rounded-xl bg-gray-100/80 dark:bg-[#1a1a1a]/80 p-0.5 mb-4">
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
            <div className="rounded-xl border border-violet-100 dark:border-violet-900/40 bg-white/80 dark:bg-[#141414]/50 p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5 text-violet-500" />
                  Total aprobadas
                </span>
                <span className="text-xs tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                  {total}/{tTotal}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all"
                  style={{ width: `${pct(total, tTotal)}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-white/80 dark:bg-[#141414]/50 p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Calidad
                </span>
                <span className="text-xs tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                  {quality}/{tQuality}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct(quality, tQuality)}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-[#141414]/50 p-3">
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-2">Distribución por categoría</p>
              <div className="space-y-2">
                {categoryRows.map((row) => (
                  <div key={row.value}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{row.label}</span>
                      <span className="text-[11px] tabular-nums text-gray-700 dark:text-gray-300">
                        {row.approved}/{row.target}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-violet-400 transition-all"
                        style={{ width: `${pct(row.approved, row.target)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
