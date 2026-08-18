'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Save } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import LoadingState from '@/app/components/panel/LoadingState';
import EmptyState from '@/app/components/panel/EmptyState';
import StatusBadge from '@/app/components/panel/StatusBadge';
import { centsToMx, NETWORK_LABELS } from '@/lib/finance/hubConfig';

type LedgerEntry = {
  id: string;
  network: string;
  amount_cents: number;
  status: string;
  tracking_tag?: string | null;
  external_ref?: string | null;
  notes?: string | null;
  attributable?: boolean;
  created_at: string;
  meta?: Record<string, unknown> | null;
};

function exportCsv(entries: LedgerEntry[]) {
  const header = ['fecha', 'red', 'monto_mxn', 'estado', 'tag', 'ref', 'notas'];
  const rows = entries.map((e) => [
    e.created_at.slice(0, 10),
    e.network,
    (e.amount_cents / 100).toFixed(2),
    e.status,
    e.tracking_tag ?? '',
    e.external_ref ?? '',
    (e.notes ?? '').replace(/"/g, '""'),
  ]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aventa-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FinanceLedgerPanel() {
  const { session } = useAuth();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState('');
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
    return h;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (network) qs.set('network', network);
      const res = await fetch(`/api/staff/finance/ledger?${qs}`, { headers: headers() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Error al cargar ledger');
        return;
      }
      setEntries((body.entries ?? []) as LedgerEntry[]);
      setCanWrite(!!body.canWrite);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }, [headers, network]);

  useEffect(() => {
    if (session?.access_token) void load();
    else setLoading(false);
  }, [session?.access_token, load]);

  const saveNotes = async (id: string, reviewed = false) => {
    setSavingId(id);
    try {
      const res = await fetch('/api/staff/finance/ledger', {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ id, notes: draftNotes[id] ?? '', reviewed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(typeof body?.error === 'string' ? body.error : 'No se pudo guardar');
        return;
      }
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const reviewedIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      const meta = e.meta;
      if (meta && typeof meta === 'object' && meta.finance_reviewed_at) set.add(e.id);
    }
    return set;
  }, [entries]);

  if (loading) return <LoadingState message="Cargando ledger…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-2">
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] px-3 py-2 text-xs"
          >
            <option value="">Todas las redes</option>
            {Object.entries(NETWORK_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </button>
        </div>
        <button
          type="button"
          onClick={() => exportCsv(entries)}
          disabled={entries.length === 0}
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 text-white px-3 py-2 text-xs font-medium disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="Ledger vacío" description="Los ingresos de afiliado aparecerán aquí cuando se registren en admin." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.06] dark:border-white/[0.08]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.03] text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Red</th>
                <th className="px-3 py-2.5 font-medium">Monto</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-3 py-2.5 font-medium">Tag / Ref</th>
                <th className="px-3 py-2.5 font-medium min-w-[200px]">Notas / conciliación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {entries.map((e) => (
                <tr key={e.id} className="bg-white/80 dark:bg-transparent">
                  <td className="px-3 py-2.5 text-xs text-gray-500 tabular-nums whitespace-nowrap">
                    {e.created_at.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2.5">{NETWORK_LABELS[e.network] ?? e.network}</td>
                  <td className="px-3 py-2.5 font-medium tabular-nums">{centsToMx(e.amount_cents)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={e.status === 'paid' ? 'ok' : e.status === 'accrued' ? 'attention' : 'neutral'}>
                      {e.status}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">
                    {e.tracking_tag ?? '—'}
                    {e.external_ref ? ` · ${e.external_ref}` : ''}
                  </td>
                  <td className="px-3 py-2.5">
                    {canWrite ? (
                      <div className="flex flex-col gap-1.5">
                        <textarea
                          value={draftNotes[e.id] ?? e.notes ?? ''}
                          onChange={(ev) => setDraftNotes((d) => ({ ...d, [e.id]: ev.target.value }))}
                          rows={2}
                          placeholder="Notas de conciliación…"
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] px-2 py-1.5 text-xs resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={savingId === e.id}
                            onClick={() => void saveNotes(e.id, false)}
                            className="inline-flex items-center gap-1 text-[11px] text-amber-600 hover:underline disabled:opacity-50"
                          >
                            <Save className="h-3 w-3" />
                            Guardar nota
                          </button>
                          {!reviewedIds.has(e.id) ? (
                            <button
                              type="button"
                              disabled={savingId === e.id}
                              onClick={() => void saveNotes(e.id, true)}
                              className="text-[11px] text-emerald-600 hover:underline disabled:opacity-50"
                            >
                              Marcar revisado
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-600">✓ Revisado</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">{e.notes || '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
