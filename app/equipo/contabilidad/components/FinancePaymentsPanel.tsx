'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckSquare, RefreshCw, Square } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import LoadingState from '@/app/components/panel/LoadingState';
import EmptyState from '@/app/components/panel/EmptyState';
import StatusBadge from '@/app/components/panel/StatusBadge';
import { centsToMx } from '@/lib/finance/hubConfig';

type AllocationRow = {
  id: string;
  pool_id: string;
  user_id: string;
  amount_cents: number;
  status: string;
  display_name?: string | null;
  notes?: string | null;
  payout?: {
    ready: boolean;
    labels: string[];
    flags: string[];
  };
  fiscal?: {
    rfc_masked?: string | null;
    clabe_masked?: string | null;
    legal_name?: string | null;
  };
};

export default function FinancePaymentsPanel() {
  const { session } = useAuth();
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [acting, setActing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'paid' | 'all'>('pending');

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
    return h;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ status: statusFilter });
      const res = await fetch(`/api/staff/finance/allocations?${qs}`, { headers: headers() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Error al cargar pagos');
        return;
      }
      setAllocations((body.allocations ?? []) as AllocationRow[]);
      setCanWrite(!!body.canWrite);
      setSelected(new Set());
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }, [headers, statusFilter]);

  useEffect(() => {
    if (session?.access_token) void load();
    else setLoading(false);
  }, [session?.access_token, load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const patchStatus = async (status: 'paid' | 'pending') => {
    if (selected.size === 0) return;
    setActing(true);
    try {
      const res = await fetch('/api/staff/finance/allocations', {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ ids: [...selected], status, notes: notes || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.blocked?.length) {
          const msg = body.blocked.map((b: { id: string; reasons: string[] }) => `${b.id.slice(0, 8)}: ${b.reasons.join(', ')}`).join('\n');
          alert(`Pagos bloqueados:\n${msg}`);
        } else {
          alert(typeof body?.error === 'string' ? body.error : 'No se pudo actualizar');
        }
        return;
      }
      setNotes('');
      await load();
    } finally {
      setActing(false);
    }
  };

  if (loading) return <LoadingState message="Cargando pagos…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;

  const readyCount = allocations.filter((a) => a.status === 'pending' && a.payout?.ready).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-2">
          {(['pending', 'paid', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-xl px-3 py-2 text-xs font-medium border ${
                statusFilter === s
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {s === 'pending' ? 'Pendientes' : s === 'paid' ? 'Pagados' : 'Todos'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </button>
        </div>
        {statusFilter === 'pending' ? (
          <p className="text-xs text-gray-500">
            {readyCount} listos para pagar · {allocations.length} en lista
          </p>
        ) : null}
      </div>

      {canWrite && selected.size > 0 ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20 p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
          <label className="flex-1 text-xs space-y-1">
            Nota de pago (opcional)
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="SPEI ref, fecha, etc."
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={acting}
              onClick={() => void patchStatus('paid')}
              className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Marcar {selected.size} como pagado
            </button>
            {statusFilter === 'paid' ? (
              <button
                type="button"
                disabled={acting}
                onClick={() => void patchStatus('pending')}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
              >
                Revertir a pendiente
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {allocations.length === 0 ? (
        <EmptyState title="Sin asignaciones" description="No hay pagos en este filtro." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.06] dark:border-white/[0.08]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.03] text-left text-xs text-gray-500">
              <tr>
                {canWrite ? <th className="px-3 py-2.5 w-10" /> : null}
                <th className="px-3 py-2.5 font-medium">Cazador</th>
                <th className="px-3 py-2.5 font-medium">Monto</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-3 py-2.5 font-medium">Fiscal</th>
                <th className="px-3 py-2.5 font-medium">Checklist</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {allocations.map((a) => {
                const isSelected = selected.has(a.id);
                const ready = a.payout?.ready;
                return (
                  <tr key={a.id} className={isSelected ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                    {canWrite ? (
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => toggle(a.id)} aria-label="Seleccionar">
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-amber-600" />
                          ) : (
                            <Square className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{a.display_name ?? a.fiscal?.legal_name ?? a.user_id.slice(0, 8)}</p>
                      {a.notes ? <p className="text-xs text-gray-500 mt-0.5">{a.notes}</p> : null}
                    </td>
                    <td className="px-3 py-2.5 font-medium tabular-nums">{centsToMx(a.amount_cents)}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={a.status === 'paid' ? 'ok' : a.status === 'pending' ? 'attention' : 'neutral'}>
                        {a.status}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">
                      RFC {a.fiscal?.rfc_masked ?? '—'}
                      <br />
                      CLABE {a.fiscal?.clabe_masked ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {a.status === 'pending' && a.payout ? (
                        ready ? (
                          <span className="text-emerald-600">Listo</span>
                        ) : (
                          <span className="text-amber-600">{a.payout.labels.join(' · ') || 'Bloqueado'}</span>
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!canWrite ? (
        <p className="text-xs text-gray-500 text-center">Vista de solo lectura. Solo finance/owner puede marcar pagos.</p>
      ) : null}
    </div>
  );
}
