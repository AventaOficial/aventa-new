'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, CheckCircle2, Coins, Play, RefreshCw } from 'lucide-react';

type PoolRow = {
  id: string;
  period_key: string;
  gross_affiliate_cents: number;
  creator_share_bps: number;
  distributable_cents: number;
  eligible_users: number;
  total_points: number;
  status: 'draft' | 'locked' | 'paid' | 'cancelled';
  created_at: string;
};

type AllocationRow = {
  id: string;
  pool_id: string;
  user_id: string;
  points: number;
  amount_cents: number;
  status: 'pending' | 'paid' | 'void';
  paid_at: string | null;
  notes?: string | null;
};

type TaxEstimatePayload = {
  period: string;
  income: {
    gross_affiliate_cents: number;
    by_network_cents: Record<string, number>;
  };
  creator_program: {
    pool_id: string | null;
    pool_status: string | null;
    creator_share_bps: number | null;
    distributable_cents: number;
    allocations_paid_cents: number;
    allocations_pending_cents: number;
    allocations_void_cents: number;
  };
  platform: {
    net_before_tax_cents: number;
  };
  note: string;
};

function centsToMx(cents: number): string {
  return (Number(cents || 0) / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function defaultPeriodKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function AdminCommissionsPage() {
  const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [period, setPeriod] = useState(defaultPeriodKey());
  const [shareBps, setShareBps] = useState(3000);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const [pools, setPools] = useState<PoolRow[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(true);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [allocLoading, setAllocLoading] = useState(false);
  const [selectedAllocationIds, setSelectedAllocationIds] = useState<Set<string>>(new Set());
  const [taxEstimate, setTaxEstimate] = useState<TaxEstimatePayload | null>(null);
  const [taxLoading, setTaxLoading] = useState(false);

  const selectedPool = useMemo(() => pools.find((p) => p.id === selectedPoolId) ?? null, [pools, selectedPoolId]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      const accessToken = data.session?.access_token ?? null;
      setToken(accessToken);
      if (!accessToken) {
        setIsAllowed(false);
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        setIsAllowed(false);
        return;
      }
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid)
        .in('role', ['owner', 'admin']);
      setIsAllowed(Boolean(roles?.length));
    });
  }, []);

  const loadPools = async (currentToken: string) => {
    setPoolsLoading(true);
    const res = await fetch('/api/admin/commissions/pools?limit=60&offset=0', {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    const body = await res.json().catch(() => ({}));
    setPoolsLoading(false);
    if (!res.ok) {
      setRunMsg(typeof body?.error === 'string' ? body.error : 'No se pudieron cargar pools');
      return;
    }
    const list = (Array.isArray(body?.pools) ? body.pools : []) as PoolRow[];
    setPools(list);
    if (!selectedPoolId && list[0]?.id) setSelectedPoolId(list[0].id);
  };

  useEffect(() => {
    if (!token || !isAllowed) return;
    void loadPools(token);
  }, [token, isAllowed]);

  const loadAllocations = async (poolId: string) => {
    if (!token) return;
    setAllocLoading(true);
    const res = await fetch(`/api/admin/commissions/allocations?pool_id=${encodeURIComponent(poolId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    setAllocLoading(false);
    if (!res.ok) {
      setRunMsg(typeof body?.error === 'string' ? body.error : 'No se pudieron cargar asignaciones');
      return;
    }
    setAllocations((Array.isArray(body?.allocations) ? body.allocations : []) as AllocationRow[]);
    setSelectedAllocationIds(new Set());
  };

  useEffect(() => {
    if (!selectedPoolId) return;
    void loadAllocations(selectedPoolId);
  }, [selectedPoolId]);

  const loadTaxEstimate = async (currentPeriod: string) => {
    if (!token) return;
    setTaxLoading(true);
    const res = await fetch(
      `/api/admin/commissions/tax-estimate?period=${encodeURIComponent(currentPeriod)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const body = await res.json().catch(() => ({}));
    setTaxLoading(false);
    if (!res.ok) {
      setRunMsg(typeof body?.error === 'string' ? body.error : 'No se pudo cargar estimado fiscal');
      return;
    }
    setTaxEstimate(body as TaxEstimatePayload);
  };

  useEffect(() => {
    if (!token || !isAllowed) return;
    void loadTaxEstimate(period);
  }, [token, isAllowed, period]);

  const runMonthly = async () => {
    if (!token) return;
    setRunning(true);
    setRunMsg(null);
    const res = await fetch('/api/admin/commissions/run-monthly', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, creator_share_bps: shareBps }),
    });
    const body = await res.json().catch(() => ({}));
    setRunning(false);
    if (!res.ok) {
      setRunMsg(typeof body?.error === 'string' ? body.error : 'No se pudo ejecutar reparto');
      return;
    }
    setRunMsg(`Pool generado: ${body?.pool_id ?? 'ok'} (${body?.allocations_count ?? 0} asignaciones)`);
    await loadPools(token);
  };

  const patchAllocations = async (status: 'pending' | 'paid' | 'void') => {
    if (!token || selectedAllocationIds.size === 0) return;
    const ids = Array.from(selectedAllocationIds);
    const res = await fetch('/api/admin/commissions/allocations', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, status }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRunMsg(typeof body?.error === 'string' ? body.error : 'No se pudieron actualizar asignaciones');
      return;
    }
    setRunMsg(`Actualizadas ${body?.updated ?? ids.length} asignaciones a ${status}.`);
    if (selectedPoolId) await loadAllocations(selectedPoolId);
  };

  const markPoolStatus = async (poolId: string, status: 'draft' | 'locked' | 'paid' | 'cancelled') => {
    if (!token) return;
    const res = await fetch('/api/admin/commissions/pools', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: poolId, status }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRunMsg(typeof body?.error === 'string' ? body.error : 'No se pudo actualizar pool');
      return;
    }
    setRunMsg(`Pool ${poolId.slice(0, 8)}... marcado como ${status}.`);
    await loadPools(token);
  };

  if (isAllowed === null) {
    return <div className="min-h-[40vh] flex items-center justify-center text-gray-500">Cargando…</div>;
  }
  if (!isAllowed) {
    return <div className="min-h-[40vh] flex items-center justify-center text-gray-500">Sin permisos.</div>;
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a] -m-4 lg:-m-6 p-4 lg:p-6">
      <div className="max-w-6xl mx-auto px-2 md:px-4 py-6 space-y-5">
        <Link href="/admin/operaciones" className="inline-flex items-center gap-2 text-sm text-violet-600 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Volver a Operaciones
        </Link>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Coins className="h-5 w-5 text-violet-500" />
                Comisiones (admin)
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Genera pool mensual desde `affiliate_ledger_entries` y distribuye por puntos de ofertas calificadas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => token && loadPools(token)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs"
            >
              <RefreshCw className="h-4 w-4" />
              Recargar
            </button>
          </div>

          <div className="mt-4 grid md:grid-cols-4 gap-2">
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="YYYY-MM"
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-[#1a1a1a]"
            />
            <input
              type="number"
              value={shareBps}
              onChange={(e) => setShareBps(Math.max(0, Math.min(10000, Number(e.target.value) || 0)))}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-[#1a1a1a]"
            />
            <button
              type="button"
              onClick={runMonthly}
              disabled={running}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-violet-600 text-white px-3 py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-60"
            >
              <Play className="h-4 w-4" />
              {running ? 'Generando…' : 'Generar reparto'}
            </button>
            <div className="text-xs text-gray-500 dark:text-gray-400 self-center">`3000` = 30.00% del ingreso afiliado</div>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => void loadTaxEstimate(period)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs"
            >
              <RefreshCw className={`h-4 w-4 ${taxLoading ? 'animate-spin' : ''}`} />
              Actualizar estimado fiscal ({period})
            </button>
          </div>
          {runMsg ? <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{runMsg}</p> : null}
        </section>

        <section className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/15 p-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Estimado fiscal operativo (SAT base)</h2>
          {taxLoading ? <p className="text-sm text-gray-500">Calculando…</p> : null}
          {taxEstimate ? (
            <div className="space-y-2 text-sm">
              <p className="text-gray-700 dark:text-gray-300">
                Ingreso afiliado bruto: <strong>{centsToMx(taxEstimate.income.gross_affiliate_cents)}</strong>
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                Repartible creadores (pool): <strong>{centsToMx(taxEstimate.creator_program.distributable_cents)}</strong>
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                Pagado a creadores: <strong>{centsToMx(taxEstimate.creator_program.allocations_paid_cents)}</strong> · Pendiente:{' '}
                <strong>{centsToMx(taxEstimate.creator_program.allocations_pending_cents)}</strong>
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                Neto plataforma antes de impuestos: <strong>{centsToMx(taxEstimate.platform.net_before_tax_cents)}</strong>
              </p>
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-white/70 dark:bg-[#141414]/70 p-2">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Detalle por red</p>
                <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
                  {Object.entries(taxEstimate.income.by_network_cents).map(([network, cents]) => (
                    <li key={network} className="flex items-center justify-between gap-2">
                      <span>{network}</span>
                      <strong>{centsToMx(cents)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{taxEstimate.note}</p>
            </div>
          ) : null}
        </section>

        <div className="grid lg:grid-cols-2 gap-5">
          <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4">
            <h2 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">Pools mensuales</h2>
            {poolsLoading ? <p className="text-sm text-gray-500">Cargando pools…</p> : null}
            <div className="space-y-2">
              {pools.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPoolId(p.id)}
                  className={`w-full text-left rounded-xl border px-3 py-2 ${
                    selectedPoolId === p.id
                      ? 'border-violet-400 bg-violet-50/70 dark:bg-violet-900/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{p.period_key}</p>
                    <span className="text-xs rounded-full px-2 py-0.5 bg-gray-200 dark:bg-gray-700">{p.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Ingreso: {centsToMx(p.gross_affiliate_cents)} · Repartible: {centsToMx(p.distributable_cents)} · Usuarios:{' '}
                    {p.eligible_users}
                  </p>
                </button>
              ))}
            </div>
            {selectedPool ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => markPoolStatus(selectedPool.id, 'paid')}
                  className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700"
                >
                  Marcar pool paid
                </button>
                <button
                  type="button"
                  onClick={() => markPoolStatus(selectedPool.id, 'locked')}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs"
                >
                  Lock
                </button>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-4">
            <h2 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">Asignaciones del pool</h2>
            {!selectedPoolId ? <p className="text-sm text-gray-500">Selecciona un pool.</p> : null}
            {selectedPoolId && allocLoading ? <p className="text-sm text-gray-500">Cargando asignaciones…</p> : null}
            {selectedPoolId && !allocLoading ? (
              <>
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => patchAllocations('paid')}
                    disabled={selectedAllocationIds.size === 0}
                    className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Marcar seleccionadas paid
                  </button>
                  <button
                    type="button"
                    onClick={() => patchAllocations('pending')}
                    disabled={selectedAllocationIds.size === 0}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Regresar a pending
                  </button>
                  <button
                    type="button"
                    onClick={() => patchAllocations('void')}
                    disabled={selectedAllocationIds.size === 0}
                    className="rounded-lg border border-red-300 text-red-700 px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Marcar void
                  </button>
                </div>
                <div className="max-h-[460px] overflow-auto space-y-1.5 pr-1">
                  {allocations.map((a) => {
                    const checked = selectedAllocationIds.has(a.id);
                    return (
                      <label
                        key={a.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedAllocationIds((prev) => {
                                const n = new Set(prev);
                                if (e.target.checked) n.add(a.id);
                                else n.delete(a.id);
                                return n;
                              });
                            }}
                          />
                          <span className="truncate text-xs text-gray-500">{a.user_id.slice(0, 8)}…</span>
                          <span className="text-xs rounded-full px-2 py-0.5 bg-gray-100 dark:bg-gray-700">{a.status}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{centsToMx(a.amount_cents)}</p>
                          <p className="text-[11px] text-gray-500">{a.points} pts</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}
          </section>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Operación sugerida: generar pool mensual - revisar asignaciones - marcar pagadas al liquidar.
        </p>
      </div>
    </div>
  );
}
