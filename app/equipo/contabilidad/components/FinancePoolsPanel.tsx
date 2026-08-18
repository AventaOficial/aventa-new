'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import LoadingState from '@/app/components/panel/LoadingState';
import EmptyState from '@/app/components/panel/EmptyState';
import StatusBadge from '@/app/components/panel/StatusBadge';
import type { FinancePayload } from '@/lib/staff/buildFinancePayload';
import { centsToMx } from '@/lib/finance/hubConfig';

export default function FinancePoolsPanel() {
  const { session } = useAuth();
  const [pools, setPools] = useState<FinancePayload['pools']>([]);
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
      setPools((body as FinancePayload).pools ?? []);
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

  if (loading) return <LoadingState message="Cargando pools…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Historial de pools mensuales. La generación y configuración global está en{' '}
          <Link href="/admin/commissions" className="text-amber-600 hover:underline">
            admin/commissions
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </button>
      </div>

      {pools.length === 0 ? (
        <EmptyState title="Sin pools" description="Aún no se ha corrido el cierre mensual." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.06] dark:border-white/[0.08]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.03] text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Periodo</th>
                <th className="px-3 py-2.5 font-medium">Ingreso bruto</th>
                <th className="px-3 py-2.5 font-medium">Share creadores</th>
                <th className="px-3 py-2.5 font-medium">Repartible</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-3 py-2.5 font-medium">Creado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {pools.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2.5 font-medium tabular-nums">{p.period_key}</td>
                  <td className="px-3 py-2.5 tabular-nums">{centsToMx(p.gross_affiliate_cents)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{(p.creator_share_bps / 100).toFixed(1)}%</td>
                  <td className="px-3 py-2.5 tabular-nums font-medium">{centsToMx(p.distributable_cents)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={p.status === 'locked' ? 'ok' : p.status === 'draft' ? 'attention' : 'neutral'}>
                      {p.status}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 tabular-nums">{p.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
