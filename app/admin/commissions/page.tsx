'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, AlertTriangle, CheckCircle2, Coins, Play, RefreshCw, ShieldAlert } from 'lucide-react';

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
  allocation_rule?: string | null;
  attributable_cents?: number | null;
  unattributable_cents?: number | null;
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
  meta?: {
    attributed_cents?: number;
    below_minimum?: boolean;
    hold_release_at?: string;
    rule?: string;
  } | null;
  display_name?: string | null;
  fiscal?: {
    legal_name?: string | null;
    rfc_masked?: string;
    clabe_masked?: string;
    fiscal_complete?: boolean;
  };
  payout?: {
    ready: boolean;
    flags: string[];
    labels: string[];
  };
};

type AllocationSummary = {
  total: number;
  ready_to_pay: number;
  blocked: number;
  program_publicly_active: boolean;
};

type TaxEstimatePayload = {
  period: string;
  income: {
    gross_affiliate_cents: number;
    attributable_cents?: number | null;
    unattributable_cents?: number | null;
    by_network_cents: Record<string, number>;
  };
  creator_program: {
    pool_id: string | null;
    pool_status: string | null;
    creator_share_bps: number | null;
    allocation_rule?: string | null;
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

type LedgerEntry = {
  id: string;
  network: string;
  amount_cents: number;
  status: string;
  tracking_tag?: string | null;
  creator_id?: string | null;
  attributable?: boolean;
  external_ref?: string | null;
  created_at: string;
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
  const [shareBps, setShareBps] = useState(4000);
  const [allocationRule, setAllocationRule] = useState<'attributed_revenue' | 'points_per_qualifying_offer'>(
    'attributed_revenue',
  );
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const [pools, setPools] = useState<PoolRow[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(true);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [allocSummary, setAllocSummary] = useState<AllocationSummary | null>(null);
  const [allocLoading, setAllocLoading] = useState(false);
  const [selectedAllocationIds, setSelectedAllocationIds] = useState<Set<string>>(new Set());
  const [taxEstimate, setTaxEstimate] = useState<TaxEstimatePayload | null>(null);
  const [taxLoading, setTaxLoading] = useState(false);

  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerSaving, setLedgerSaving] = useState(false);
  const [ledgerNetwork, setLedgerNetwork] = useState('mercadolibre');
  const [ledgerAmountMx, setLedgerAmountMx] = useState('');
  const [ledgerTag, setLedgerTag] = useState('');
  const [ledgerCreatorId, setLedgerCreatorId] = useState('');
  const [ledgerRef, setLedgerRef] = useState('');
  const [ledgerStatus, setLedgerStatus] = useState<'accrued' | 'paid'>('accrued');
  const [csvText, setCsvText] = useState('');
  const [csvNetwork, setCsvNetwork] = useState('mercadolibre');
  const [csvImporting, setCsvImporting] = useState(false);

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
    void loadLedger(token);
  }, [token, isAllowed]);

  const loadLedger = async (currentToken: string) => {
    setLedgerLoading(true);
    const res = await fetch('/api/admin/affiliate-ledger?limit=30&offset=0', {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    const body = await res.json().catch(() => ({}));
    setLedgerLoading(false);
    if (!res.ok) {
      setRunMsg(typeof body?.error === 'string' ? body.error : 'No se pudo cargar ledger');
      return;
    }
    setLedgerEntries((Array.isArray(body?.entries) ? body.entries : []) as LedgerEntry[]);
  };

  const importCsv = async () => {
    if (!token || !csvText.trim()) {
      setRunMsg('Pegá el CSV antes de importar.');
      return;
    }
    setCsvImporting(true);
    setRunMsg(null);
    const res = await fetch('/api/admin/affiliate-ledger/import-csv', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csv: csvText,
        network: csvNetwork,
        status: ledgerStatus,
        currency: 'MXN',
      }),
    });
    const body = await res.json().catch(() => ({}));
    setCsvImporting(false);
    if (!res.ok) {
      setRunMsg(typeof body?.error === 'string' ? body.error : 'Import CSV falló');
      return;
    }
    setRunMsg(
      `CSV: insertados ${body.inserted ?? 0}, duplicados ${body.duplicates ?? 0}, fallidos ${body.failed ?? 0}, omitidos parse ${body.skipped_parse ?? 0}. Tags resueltos en perfiles: ${body.resolved_tags ?? 0}.`,
    );
    setCsvText('');
    await loadLedger(token);
    await loadTaxEstimate(period);
  };

  const saveLedgerEntry = async () => {
    if (!token) return;
    const mx = Number(ledgerAmountMx.replace(',', '.'));
    if (!Number.isFinite(mx) || mx === 0) {
      setRunMsg('Monto inválido (MXN).');
      return;
    }
    setLedgerSaving(true);
    setRunMsg(null);
    const res = await fetch('/api/admin/affiliate-ledger', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        network: ledgerNetwork,
        amount_cents: Math.round(mx * 100),
        status: ledgerStatus,
        source: 'manual',
        tracking_tag: ledgerTag.trim() || null,
        creator_id: ledgerCreatorId.trim() || null,
        external_ref: ledgerRef.trim() || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setLedgerSaving(false);
    if (!res.ok) {
      setRunMsg(typeof body?.error === 'string' ? body.error : 'No se pudo guardar en ledger');
      return;
    }
    setRunMsg(`Ledger: movimiento ${body?.id ?? 'ok'} guardado.`);
    setLedgerAmountMx('');
    setLedgerTag('');
    setLedgerCreatorId('');
    setLedgerRef('');
    await loadLedger(token);
    await loadTaxEstimate(period);
  };

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
    setAllocSummary((body?.summary as AllocationSummary | undefined) ?? null);
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
      body: JSON.stringify({ period, creator_share_bps: shareBps, allocation_rule: allocationRule }),
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

  const patchAllocations = async (status: 'pending' | 'paid' | 'void', force = false) => {
    if (!token || selectedAllocationIds.size === 0) return;
    const ids = Array.from(selectedAllocationIds);
    if (status === 'paid' && force) {
      const ok = window.confirm(
        'Forzar pago ignorará el checklist anti-fraude. Solo confirma si revisaste manualmente cada caso.',
      );
      if (!ok) return;
    }
    const res = await fetch('/api/admin/commissions/allocations', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, status, force: force && status === 'paid' }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 409 && Array.isArray(body?.blocked)) {
        const lines = (body.blocked as Array<{ id: string; reasons: string[] }>)
          .slice(0, 5)
          .map((b) => `${b.id.slice(0, 8)}…: ${b.reasons.join('; ')}`)
          .join('\n');
        setRunMsg(`${body.error}\n${lines}`);
      } else {
        setRunMsg(typeof body?.error === 'string' ? body.error : 'No se pudieron actualizar asignaciones');
      }
      return;
    }
    setRunMsg(`Actualizadas ${body?.updated ?? ids.length} asignaciones a ${status}${body?.forced ? ' (forzado)' : ''}.`);
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
                Registra ingresos de Amazon/ML → genera pool. Default: <strong>40% de comisión atribuida</strong> por
                creador (política). Legacy por puntos sigue disponible.
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

          <div className="mt-4 grid md:grid-cols-5 gap-2">
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
              title="Basis points: 4000 = 40%"
            />
            <select
              value={allocationRule}
              onChange={(e) =>
                setAllocationRule(e.target.value as 'attributed_revenue' | 'points_per_qualifying_offer')
              }
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-[#1a1a1a]"
            >
              <option value="attributed_revenue">Por comisión atribuida (recomendado)</option>
              <option value="points_per_qualifying_offer">Legacy: por puntos/votos</option>
            </select>
            <button
              type="button"
              onClick={runMonthly}
              disabled={running}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-violet-600 text-white px-3 py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-60"
            >
              <Play className="h-4 w-4" />
              {running ? 'Generando…' : 'Generar reparto'}
            </button>
            <div className="text-xs text-gray-500 dark:text-gray-400 self-center">
              `4000` = 40% · elegibilidad 15×120 se mantiene
            </div>
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
          {runMsg ? <p className="mt-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{runMsg}</p> : null}
        </section>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">1) Registrar ingreso (ledger)</h2>
          <p className="text-xs text-gray-500">
            Cuando Amazon/ML te paguen o confirmen comisión, cargá el monto aquí. Si ponés{' '}
            <code className="text-[11px]">tracking_tag</code> (mismo que <code className="text-[11px]">ml_tracking_tag</code>{' '}
            del perfil) o <code className="text-[11px]">creator_id</code>, ese monto cuenta para el pago de ese
            cazador.
          </p>
          <div className="grid md:grid-cols-6 gap-2">
            <select
              value={ledgerNetwork}
              onChange={(e) => setLedgerNetwork(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-[#1a1a1a]"
            >
              <option value="mercadolibre">Mercado Libre</option>
              <option value="amazon">Amazon</option>
              <option value="aliexpress">AliExpress</option>
              <option value="other">Otra</option>
            </select>
            <input
              value={ledgerAmountMx}
              onChange={(e) => setLedgerAmountMx(e.target.value)}
              placeholder="Monto MXN"
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-[#1a1a1a]"
            />
            <input
              value={ledgerTag}
              onChange={(e) => setLedgerTag(e.target.value)}
              placeholder="tracking_tag"
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-[#1a1a1a]"
            />
            <input
              value={ledgerCreatorId}
              onChange={(e) => setLedgerCreatorId(e.target.value)}
              placeholder="creator_id (uuid)"
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-[#1a1a1a]"
            />
            <input
              value={ledgerRef}
              onChange={(e) => setLedgerRef(e.target.value)}
              placeholder="ref externa"
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-[#1a1a1a]"
            />
            <button
              type="button"
              onClick={() => void saveLedgerEntry()}
              disabled={ledgerSaving}
              className="rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              {ledgerSaving ? 'Guardando…' : 'Guardar en ledger'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center text-xs text-gray-500">
            <label className="inline-flex items-center gap-1">
              Status
              <select
                value={ledgerStatus}
                onChange={(e) => setLedgerStatus(e.target.value as 'accrued' | 'paid')}
                className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 bg-white dark:bg-[#1a1a1a]"
              >
                <option value="accrued">accrued</option>
                <option value="paid">paid</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => token && loadLedger(token)}
              className="underline"
            >
              Recargar ledger
            </button>
          </div>
          {ledgerLoading ? <p className="text-sm text-gray-500">Cargando ledger…</p> : null}
          <ul className="max-h-40 overflow-auto text-xs space-y-1">
            {ledgerEntries.map((e) => (
              <li key={e.id} className="flex justify-between gap-2 border-b border-gray-100 dark:border-gray-800 py-1">
                <span>
                  {e.network} · {e.status}
                  {e.tracking_tag ? ` · tag ${e.tracking_tag}` : ''}
                  {e.creator_id ? ` · ${e.creator_id.slice(0, 8)}…` : ''}
                  {e.attributable ? ' · atribuible' : ' · plataforma'}
                </span>
                <strong>{centsToMx(e.amount_cents)}</strong>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Importar CSV (reporte red)</p>
              <Link href="/admin/creator-tags" className="text-xs text-violet-600 hover:underline">
                Gestionar tags creadores →
              </Link>
            </div>
            <p className="text-[11px] text-gray-500">
              Header con columnas tipo <code className="text-[10px]">amount,tag,external_ref</code> o{' '}
              <code className="text-[10px]">commission,tracking_tag,id</code>. Resuelve creator por ML/Amazon tag.
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                value={csvNetwork}
                onChange={(e) => setCsvNetwork(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-[#1a1a1a]"
              >
                <option value="mercadolibre">Mercado Libre</option>
                <option value="amazon">Amazon</option>
                <option value="other">Otra</option>
              </select>
              <button
                type="button"
                onClick={() => void importCsv()}
                disabled={csvImporting}
                className="rounded-lg bg-violet-600 text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                {csvImporting ? 'Importando…' : 'Importar CSV'}
              </button>
            </div>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={4}
              placeholder={'amount,tag,external_ref\n12.50,ana_tag,ORD-1\n8.00,beto_tag,ORD-2'}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-mono bg-white dark:bg-[#1a1a1a]"
            />
          </div>
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
                Atribuible a creadores:{' '}
                <strong>
                  {taxEstimate.income.attributable_cents != null
                    ? centsToMx(taxEstimate.income.attributable_cents)
                    : '—'}
                </strong>
                {' · '}
                Sin atribución:{' '}
                <strong>
                  {taxEstimate.income.unattributable_cents != null
                    ? centsToMx(taxEstimate.income.unattributable_cents)
                    : '—'}
                </strong>
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                A pagar creadores (pool): <strong>{centsToMx(taxEstimate.creator_program.distributable_cents)}</strong>
                {taxEstimate.creator_program.allocation_rule ? (
                  <span className="text-xs text-gray-500"> · regla {taxEstimate.creator_program.allocation_rule}</span>
                ) : null}
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
                    Ingreso: {centsToMx(p.gross_affiliate_cents)} · A pagar: {centsToMx(p.distributable_cents)} ·
                    Usuarios: {p.eligible_users}
                    {p.allocation_rule ? ` · ${p.allocation_rule}` : ''}
                  </p>
                  {p.attributable_cents != null ? (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Atribuible {centsToMx(p.attributable_cents)} · Sin atrib.{' '}
                      {centsToMx(p.unattributable_cents ?? 0)}
                    </p>
                  ) : null}
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
            <h2 className="font-semibold mb-1 text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-violet-500" />
              Asignaciones del pool
            </h2>
            {allocSummary ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Listas para pagar: <strong className="text-emerald-600">{allocSummary.ready_to_pay}</strong> · Bloqueadas:{' '}
                <strong className="text-amber-600">{allocSummary.blocked}</strong>
                {!allocSummary.program_publicly_active ? (
                  <span className="ml-2 text-amber-700 dark:text-amber-400">· COMMISSION_PROGRAM_ACTIVE=false</span>
                ) : null}
              </p>
            ) : null}
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
                    onClick={() => patchAllocations('paid', true)}
                    disabled={selectedAllocationIds.size === 0}
                    className="rounded-lg border border-amber-400 text-amber-800 dark:text-amber-300 px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Forzar paid (override)
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
                    const ready = a.payout?.ready ?? false;
                    const isPending = a.status === 'pending';
                    return (
                      <label
                        key={a.id}
                        className={`flex flex-col gap-1.5 rounded-lg border px-2 py-2 text-sm ${
                          isPending && !ready
                            ? 'border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
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
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">
                                {a.display_name || a.fiscal?.legal_name || `${a.user_id.slice(0, 8)}…`}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                RFC {a.fiscal?.rfc_masked ?? '—'} · CLABE {a.fiscal?.clabe_masked ?? '—'}
                              </p>
                            </div>
                            <span className="text-xs rounded-full px-2 py-0.5 bg-gray-100 dark:bg-gray-700 shrink-0">{a.status}</span>
                            {isPending ? (
                              ready ? (
                                <span className="text-[10px] rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800 shrink-0">
                                  ✓ checklist
                                </span>
                              ) : (
                                <span className="text-[10px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-800 shrink-0 inline-flex items-center gap-0.5">
                                  <AlertTriangle className="h-3 w-3" />
                                  bloqueada
                                </span>
                              )
                            ) : null}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-medium">{centsToMx(a.amount_cents)}</p>
                            <p className="text-[11px] text-gray-500">
                              {typeof a.meta?.attributed_cents === 'number'
                                ? `gen. ${centsToMx(a.meta.attributed_cents)}`
                                : `${a.points} pts`}
                              {a.meta?.below_minimum ? ' · bajo mínimo' : ''}
                            </p>
                          </div>
                        </div>
                        {a.payout?.labels?.length ? (
                          <ul className="pl-6 text-[10px] text-gray-500 dark:text-gray-400 list-disc">
                            {a.payout.labels.map((lbl) => (
                              <li key={lbl}>{lbl}</li>
                            ))}
                          </ul>
                        ) : null}
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
          Operación: ledger con tag/creator → generar reparto (atribuido) → hold 14d → SPEI → marcar paid.
          Política: <code className="text-[10px]">docs/POLITICA_COMISIONES_CREADORES.md</code>
        </p>
      </div>
    </div>
  );
}
