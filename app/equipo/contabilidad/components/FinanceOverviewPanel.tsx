'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import KpiCard from '@/app/components/panel/KpiCard';
import LoadingState from '@/app/components/panel/LoadingState';
import StatusBadge from '@/app/components/panel/StatusBadge';
import type { FinancePayload } from '@/lib/staff/buildFinancePayload';
import { centsToMx, NETWORK_LABELS } from '@/lib/finance/hubConfig';
import FinanceTasksStrip from './FinanceTasksStrip';

export default function FinanceOverviewPanel() {
  const { session } = useAuth();
  const [data, setData] = useState<FinancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
    return h;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/staff/finance', { headers: headers() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Error al cargar');
        return;
      }
      setData(body as FinancePayload);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    if (session?.access_token) void load();
    else setLoading(false);
  }, [session?.access_token, load]);

  if (loading) return <LoadingState message="Cargando contabilidad…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  const latestPool = data.pools[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{data.greeting}</p>
          {!data.programActive ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/40 px-2.5 py-1 rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5" />
              Programa de comisiones pausado — los pagos pueden estar bloqueados.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Ingresos del mes" value={centsToMx(data.summary.ledgerMonthCents)} variant="light" />
        <KpiCard label="Por cobrar (ledger)" value={centsToMx(data.summary.ledgerAccruedCents)} variant="light" />
        <KpiCard label="Pagos pendientes" value={String(data.summary.pendingCount)} variant="light" />
        <KpiCard label="Monto pendiente" value={centsToMx(data.summary.pendingCents)} variant="light" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <FinanceTasksStrip board={data.board} taskPct={data.taskPct} onTasksChange={() => void load()} />

        <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Último pool</h2>
            <Link href="/equipo/contabilidad/pools" className="text-xs text-amber-600 hover:underline">
              Ver todos
            </Link>
          </div>
          {latestPool ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Periodo</dt>
                <dd className="font-medium tabular-nums">{latestPool.period_key}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Ingreso bruto</dt>
                <dd className="font-medium tabular-nums">{centsToMx(latestPool.gross_affiliate_cents)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Repartible</dt>
                <dd className="font-medium tabular-nums">{centsToMx(latestPool.distributable_cents)}</dd>
              </div>
              <div className="flex justify-between gap-2 items-center">
                <dt className="text-gray-500">Estado</dt>
                <dd>
                  <StatusBadge tone={latestPool.status === 'locked' ? 'ok' : latestPool.status === 'draft' ? 'attention' : 'neutral'}>
                    {latestPool.status}
                  </StatusBadge>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-500">Sin pools generados aún.</p>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ledger reciente</h2>
          <Link href="/equipo/contabilidad/ledger" className="text-xs text-amber-600 hover:underline">
            Ver ledger completo
          </Link>
        </div>
        {data.recentLedger.length === 0 ? (
          <p className="text-sm text-gray-500">Sin movimientos en el ledger.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.recentLedger.slice(0, 8).map((e) => (
              <li key={e.id} className="flex justify-between gap-3 py-2 text-sm">
                <span className="text-gray-600 dark:text-gray-400 truncate">
                  {NETWORK_LABELS[e.network] ?? e.network}
                  {e.tracking_tag ? ` · ${e.tracking_tag}` : ''}
                  {e.external_ref ? ` · ${e.external_ref}` : ''}
                </span>
                <span className="shrink-0 font-medium tabular-nums">{centsToMx(e.amount_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.pendingPreview.length > 0 ? (
        <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pagos pendientes (preview)</h2>
            <Link href="/equipo/contabilidad/pagos" className="text-xs text-amber-600 hover:underline">
              Gestionar pagos
            </Link>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.pendingPreview.slice(0, 6).map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-2 text-sm">
                <span className="text-gray-600 dark:text-gray-400 truncate">
                  {a.display_name ?? a.user_id.slice(0, 8)}
                </span>
                <span className="shrink-0 font-medium tabular-nums">{centsToMx(a.amount_cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!data.canWrite ? (
        <p className="text-xs text-gray-500 text-center">
          Vista de solo lectura (gerencia). Para marcar pagos necesitas rol finance u owner.
        </p>
      ) : null}
    </div>
  );
}
