'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Gift, RefreshCw, Link2, Undo2 } from 'lucide-react';

type RewardRow = {
  id: string;
  creator_id: string;
  offer_id: string;
  ledger_entry_id: string;
  network: string;
  gross_commission_cents: number;
  creator_share_cents: number;
  status: string;
  hold_until: string | null;
  attribution_method: string | null;
  attribution_confidence: string | null;
  created_at: string;
};

function mxn(cents: number): string {
  return (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function shortId(id: string): string {
  return id ? `${id.slice(0, 8)}…` : '—';
}

export default function AdminRewardsPage() {
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [payoutUserId, setPayoutUserId] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutSpei, setPayoutSpei] = useState('');
  const [manualLedgerId, setManualLedgerId] = useState('');
  const [manualOfferId, setManualOfferId] = useState('');
  const [manualReason, setManualReason] = useState('');

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, []);

  const loadRewards = useCallback(async () => {
    const headers = await authHeaders();
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    const res = await fetch(`/api/admin/rewards${qs}`, { headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(typeof body?.error === 'string' ? body.error : 'Error al cargar');
      setRewards([]);
      return false;
    }
    setRewards(body.rewards ?? []);
    return true;
  }, [authHeaders, statusFilter]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const ok = await loadRewards();
      if (active && ok) setMsg(null);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadRewards]);

  const refresh = async () => {
    setLoading(true);
    setMsg(null);
    await loadRewards();
    setLoading(false);
  };

  const processHolds = async () => {
    const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
    const res = await fetch('/api/admin/rewards', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'process_holds' }),
    });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Holds procesados: ${body.processed ?? 0}` : body.error ?? 'Error');
    await refresh();
  };

  const patchReward = async (id: string, action: 'cancel' | 'reverse') => {
    const reason = window.prompt(`Motivo (${action}):`) ?? '';
    if (!reason.trim()) {
      setMsg('Motivo obligatorio');
      return;
    }
    const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
    const res = await fetch('/api/admin/rewards', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ id, action, reason }),
    });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? 'Actualizado' : body.error ?? 'Error');
    await refresh();
  };

  const submitClawback = async (rewardId: string) => {
    const reason = window.prompt('Motivo del clawback/ajuste (PAID permanece PAID):') ?? '';
    if (!reason.trim()) {
      setMsg('Motivo obligatorio');
      return;
    }
    const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
    const res = await fetch('/api/admin/rewards/clawback', {
      method: 'POST',
      headers,
      body: JSON.stringify({ reward_id: rewardId, reason }),
    });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Clawback registrado (${body.adjustmentId})` : body.error ?? 'Error');
    await refresh();
  };

  const submitManualAttribution = async () => {
    if (!manualLedgerId.trim() || !manualOfferId.trim()) {
      setMsg('ledger_entry_id y offer_id obligatorios');
      return;
    }
    const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
    const res = await fetch('/api/admin/rewards/attribute', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ledger_entry_id: manualLedgerId.trim(),
        offer_id: manualOfferId.trim(),
        reason: manualReason.trim() || 'manual_staff_attribution',
      }),
    });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Atribución manual OK (reward ${body.rewardId})` : body.error ?? 'Error');
    if (res.ok) {
      setManualLedgerId('');
      setManualOfferId('');
      setManualReason('');
    }
    await refresh();
  };

  const submitPayout = async () => {
    const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
    const amountCents = Math.round(parseFloat(payoutAmount) * 100);
    const res = await fetch('/api/admin/rewards/payouts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userId: payoutUserId.trim(),
        amountCents,
        speiReference: payoutSpei.trim(),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Pago registrado (${body.payoutId})` : body.error ?? 'Error');
    await refresh();
  };

  const availableTotalByCreator = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rewards) {
      if (r.status !== 'AVAILABLE') continue;
      map.set(r.creator_id, (map.get(r.creator_id) ?? 0) + r.creator_share_cents);
    }
    return map;
  }, [rewards]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Link href="/admin/commissions" className="inline-flex items-center gap-2 text-sm text-violet-600 hover:underline mb-6">
        <ArrowLeft className="h-4 w-4" />
        Economía / comisiones
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Gift className="h-7 w-7 text-violet-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Programa de Recompensas</h1>
          <p className="text-sm text-gray-500">Staff — comisión → recompensa → pago (validación server-side)</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="VALIDATING">VALIDATING</option>
          <option value="AVAILABLE">AVAILABLE</option>
          <option value="PAID">PAID</option>
          <option value="CANCELLED">CANCELLED</option>
          <option value="REVERSED">REVERSED</option>
        </select>
        <button
          type="button"
          onClick={() => refresh()}
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
        <button
          type="button"
          onClick={() => processHolds()}
          className="rounded-lg bg-violet-600 text-white px-3 py-2 text-sm hover:bg-violet-700"
        >
          Procesar holds vencidos
        </button>
      </div>

      {msg ? <p className="text-sm text-violet-700 dark:text-violet-300 mb-4">{msg}</p> : null}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto mb-8">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Creador</th>
              <th className="px-3 py-2">Oferta</th>
              <th className="px-3 py-2">Ledger</th>
              <th className="px-3 py-2">Red</th>
              <th className="px-3 py-2">Comisión</th>
              <th className="px-3 py-2">Recompensa</th>
              <th className="px-3 py-2">Atribución</th>
              <th className="px-3 py-2">Hold</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                  Cargando…
                </td>
              </tr>
            ) : rewards.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                  Sin recompensas
                </td>
              </tr>
            ) : (
              rewards.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2 font-medium">{r.status}</td>
                  <td className="px-3 py-2 font-mono text-xs" title={r.creator_id}>
                    {shortId(r.creator_id)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs" title={r.offer_id}>
                    {shortId(r.offer_id)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs" title={r.ledger_entry_id}>
                    {shortId(r.ledger_entry_id)}
                  </td>
                  <td className="px-3 py-2">{r.network}</td>
                  <td className="px-3 py-2">{mxn(r.gross_commission_cents)}</td>
                  <td className="px-3 py-2">{mxn(r.creator_share_cents)}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.attribution_method ?? '—'} / {r.attribution_confidence ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.hold_until?.slice(0, 10) ?? '—'}</td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    {r.status !== 'PAID' && r.status !== 'CANCELLED' && r.status !== 'REVERSED' ? (
                      <>
                        <button type="button" className="text-xs text-amber-600 hover:underline" onClick={() => patchReward(r.id, 'cancel')}>
                          Cancelar
                        </button>
                        <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => patchReward(r.id, 'reverse')}>
                          Revertir
                        </button>
                      </>
                    ) : r.status === 'PAID' ? (
                      <button type="button" className="text-xs text-orange-600 hover:underline inline-flex items-center gap-0.5" onClick={() => submitClawback(r.id)}>
                        <Undo2 className="h-3 w-3" />
                        Clawback
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold mb-3 inline-flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Atribución manual
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Para comisiones con evidencia insuficiente (p. ej. ML medium). El creator se verifica server-side desde la oferta.
          </p>
          <div className="space-y-2">
            <input
              placeholder="UUID comisión (ledger_entry_id)"
              value={manualLedgerId}
              onChange={(e) => setManualLedgerId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-[#141414]"
            />
            <input
              placeholder="UUID oferta (offer_id)"
              value={manualOfferId}
              onChange={(e) => setManualOfferId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-[#141414]"
            />
            <input
              placeholder="Motivo (opcional)"
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-[#141414]"
            />
            <button type="button" onClick={() => submitManualAttribution()} className="rounded-lg bg-violet-600 text-white px-4 py-2 text-sm hover:bg-violet-700">
              Atribuir y crear recompensa
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="font-semibold mb-3">Pago SPEI manual</h2>
          <p className="text-xs text-gray-500 mb-3">Mínimo $200 MXN. Operación atómica vía RPC.</p>
          <div className="space-y-2">
            <input
              placeholder="UUID del creador"
              value={payoutUserId}
              onChange={(e) => setPayoutUserId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-[#141414]"
            />
            {payoutUserId && availableTotalByCreator.has(payoutUserId) ? (
              <p className="text-xs text-emerald-600">
                Saldo AVAILABLE visible en listado: {mxn(availableTotalByCreator.get(payoutUserId) ?? 0)}
              </p>
            ) : null}
            <input
              placeholder="Monto MXN (ej. 200)"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-[#141414]"
            />
            <input
              placeholder="Referencia SPEI"
              value={payoutSpei}
              onChange={(e) => setPayoutSpei(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-[#141414]"
            />
            <button type="button" onClick={() => submitPayout()} className="rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm hover:bg-emerald-700">
              Registrar pago
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
