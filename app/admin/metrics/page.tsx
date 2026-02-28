'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';

type Period = 'all' | 'day' | 'week' | 'month';

type Row = {
  id?: string;
  title: string;
  views: number;
  outbound: number;
  shares: number;
  ctr: number | null;
  score: number;
  score_final: number;
  created_at: string;
};

type SortKey = 'outbound' | 'ctr' | 'score_final' | 'shares';

type AffiliatePlatform = 'amazon' | 'mercadolibre' | 'aliexpress' | 'custom';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'outbound', label: 'Outbound ↓' },
  { value: 'shares', label: 'Compartidos ↓' },
  { value: 'ctr', label: 'CTR ↓' },
  { value: 'score_final', label: 'Score final ↓' },
];

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'day', label: 'Últimas 24h' },
  { value: 'week', label: 'Últimos 7 días' },
  { value: 'month', label: 'Últimos 30 días' },
];

const AFFILIATE_PRESETS: Record<AffiliatePlatform, { conv: number; commission: number; label: string }> = {
  amazon: { conv: 5, commission: 4, label: 'Amazon' },
  mercadolibre: { conv: 4, commission: 12, label: 'Mercado Libre' },
  aliexpress: { conv: 2, commission: 5, label: 'AliExpress' },
  custom: { conv: 4, commission: 10, label: 'Personalizado' },
};

function formatNum(n: number): string {
  return n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function computeScoreFinal(score: number, createdAt: string): number {
  const hours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 3600);
  const base = Math.max(hours + 2, 2);
  return Number((score / Math.pow(base, 1.5)).toFixed(2));
}

type OfferWithRelations = {
  id: string;
  title: string;
  created_at: string;
  offer_events?: Array<{ event_type: string; created_at: string }> | null;
  offer_votes?: Array<{ value: number }> | null;
};

function computeRowsFromOffers(offers: OfferWithRelations[], dateLimit: Date): Row[] {
  const limitIso = dateLimit.toISOString();
  return offers.map((o) => {
    const events = (o.offer_events ?? []).filter((e) => e.created_at >= limitIso);
    const views = events.filter((e) => e.event_type === 'view').length;
    const outbound = events.filter((e) => e.event_type === 'outbound').length;
    const shares = events.filter((e) => e.event_type === 'share').length;
    const ctr = views > 0 ? Number(((outbound / views) * 100).toFixed(2)) : null;
    const votes = o.offer_votes ?? [];
    const score = votes.reduce((s, v) => s + (v.value === 1 ? 1 : v.value === -1 ? -1 : 0), 0);
    const score_final = computeScoreFinal(score, o.created_at);
    return {
      id: o.id,
      title: o.title,
      views,
      outbound,
      shares,
      ctr,
      score,
      score_final,
      created_at: o.created_at,
    };
  });
}

export default function MetricsPage() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('outbound');
  const [period, setPeriod] = useState<Period>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [affiliatePlatform, setAffiliatePlatform] = useState<AffiliatePlatform>('mercadolibre');
  const [convRate, setConvRate] = useState(4);
  const [commissionRate, setCommissionRate] = useState(12);
  const [aovMxn, setAovMxn] = useState(500);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    if (period === 'all') {
      const { data: rows, error: err } = await supabase
        .from('offer_performance_metrics')
        .select('*');
      if (err) {
        setError(err.message);
        return;
      }
      setError(null);
      setData(
        (rows ?? []).map((r: Record<string, unknown>) => ({
          ...r,
          shares: r.shares ?? 0,
        })) as Row[]
      );
      return;
    }
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { data: offers, error: err } = await supabase
      .from('offers')
      .select(`
        id,
        title,
        created_at,
        offer_events (
          event_type,
          created_at
        ),
        offer_votes (
          value
        )
      `)
      .or('status.eq.approved,status.eq.published');
    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    let rows = computeRowsFromOffers((offers ?? []) as OfferWithRelations[], dateLimit);
    rows = rows.filter((row) => row.views > 0 || row.outbound > 0);
    setData(rows);
  }, [period]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const { session } = useAuth();

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/admin/refresh-metrics', { method: 'POST', headers });
      if (!res.ok) throw new Error('Error al refrescar');
      setLoading(true);
      await loadData();
      setToast('Métricas actualizadas');
    } catch {
      setToast('Error al actualizar métricas');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const sorted = [...data].sort((a, b) => {
    const key = sortBy;
    const va = a[key];
    const vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (vb as number) - (va as number);
  });

  const summary = {
    totalViews: data.reduce((s, r) => s + r.views, 0),
    totalOutbound: data.reduce((s, r) => s + r.outbound, 0),
    totalShares: data.reduce((s, r) => s + (r.shares ?? 0), 0),
    activeOffers: data.length,
    topOffer: sorted[0]?.title ?? null,
  };
  const globalCtr =
    summary.totalViews > 0
      ? ((summary.totalOutbound / summary.totalViews) * 100).toFixed(1)
      : null;

  const periodLabel =
    period === 'all'
      ? 'todo el tiempo'
      : period === 'day'
        ? 'últimas 24h'
        : period === 'week'
          ? 'últimos 7 días'
          : 'últimos 30 días';

  useEffect(() => {
    const p = AFFILIATE_PRESETS[affiliatePlatform];
    if (p && affiliatePlatform !== 'custom') {
      setConvRate(p.conv);
      setCommissionRate(p.commission);
    }
  }, [affiliatePlatform]);

  const estimatedSales = Math.round(summary.totalOutbound * (convRate / 100));
  const estimatedEarnings = (estimatedSales * aovMxn * (commissionRate / 100)).toFixed(0);
  const epc = summary.totalOutbound > 0
    ? ((estimatedSales * aovMxn * (commissionRate / 100)) / summary.totalOutbound).toFixed(2)
    : null;

  if (loading) return <div className="p-6 text-gray-600 dark:text-gray-400">Cargando...</div>;
  if (error) return <div className="p-6 text-red-600 dark:text-red-400">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
        Métricas por oferta
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Vistas, clics a tienda (outbound) y CTR por oferta. Ordena por impacto para ver las que más generan salidas.
      </p>

      <section className="mb-6 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10 p-4 md:p-5">
        <h2 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide mb-3">
          Impacto — {periodLabel}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatNum(summary.totalViews)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Vistas</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatNum(summary.totalOutbound)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Clics a tienda</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{globalCtr ?? '—'}{globalCtr != null ? '%' : ''}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">CTR global</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.activeOffers}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Ofertas con actividad</p>
          </div>
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="text-sm text-gray-600 dark:text-gray-400">Período:</label>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          disabled={loading}
          className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm disabled:opacity-50"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {refreshing ? 'Actualizando...' : 'Actualizar métricas'}
        </button>
        <label className="text-sm text-gray-600 dark:text-gray-400 mr-2">Ordenar por:</label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <section className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 md:p-5">
        <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
          Resumen — {periodLabel}
        </h2>
        <p className="text-base md:text-lg text-gray-800 dark:text-gray-200 mb-3">
          {formatNum(summary.totalViews)} vistas
          {summary.totalOutbound > 0 && (
            <>
              {' · '}
              {formatNum(summary.totalOutbound)} clics directos
              {globalCtr != null && ` (${globalCtr}% CTR)`}
            </>
          )}
          {summary.totalShares > 0 && ` · ${formatNum(summary.totalShares)} compartidos`}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {summary.activeOffers} ofertas activas
          {summary.topOffer && (
            <>
              {' · '}
              Top: <span className="text-gray-800 dark:text-gray-200 truncate max-w-[200px] inline-block align-bottom" title={summary.topOffer}>{summary.topOffer}</span>
            </>
          )}
        </p>
      </section>

      <section className="mb-6 rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-900/10 p-4 md:p-5">
        <h2 className="text-sm font-semibold text-violet-800 dark:text-violet-300 uppercase tracking-wide mb-3">
          Estimación de afiliados
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Proyección basada en clics outbound, tasa de conversión y comisión por plataforma.
        </p>
        <div className="flex flex-wrap gap-4 md:gap-6 mb-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plataforma</label>
            <select
              value={affiliatePlatform}
              onChange={(e) => setAffiliatePlatform(e.target.value as AffiliatePlatform)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm"
            >
              <option value="amazon">Amazon (conv ~5%, comisión ~4%)</option>
              <option value="mercadolibre">Mercado Libre (conv ~4%, comisión 9–14%)</option>
              <option value="aliexpress">AliExpress (conv ~2%, comisión 3–7%)</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Conversión %</label>
            <input
              type="number"
              min={0.5}
              max={20}
              step={0.5}
              value={convRate}
              onChange={(e) => setConvRate(Number(e.target.value) || 4)}
              className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Comisión %</label>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={commissionRate}
              onChange={(e) => setCommissionRate(Number(e.target.value) || 10)}
              className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Ticket promedio (MXN)</label>
            <input
              type="number"
              min={50}
              max={50000}
              step={50}
              value={aovMxn}
              onChange={(e) => setAovMxn(Number(e.target.value) || 500)}
              className="w-28 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Ventas estimadas:</span>{' '}
            <span className="font-semibold text-gray-900 dark:text-gray-100">{formatNum(estimatedSales)}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Ingresos estimados:</span>{' '}
            <span className="font-semibold text-violet-600 dark:text-violet-400">
              ${formatNum(Number(estimatedEarnings))} MXN
            </span>
          </div>
          {epc != null && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">EPC (ganancia por clic):</span>{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">${epc} MXN</span>
            </div>
          )}
        </div>
      </section>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Oferta</th>
              <th className="text-right p-3 font-medium text-gray-700 dark:text-gray-300">views</th>
              <th className="text-right p-3 font-medium text-gray-700 dark:text-gray-300">outbound</th>
              <th className="text-right p-3 font-medium text-gray-700 dark:text-gray-300">shares</th>
              <th className="text-right p-3 font-medium text-gray-700 dark:text-gray-300">ctr</th>
              <th className="text-right p-3 font-medium text-gray-700 dark:text-gray-300">score</th>
              <th className="text-right p-3 font-medium text-gray-700 dark:text-gray-300">score_final</th>
              <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">created_at</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-500 dark:text-gray-400">
                  No hay datos
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => (
                <tr key={row.id ?? i} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="p-3 max-w-[200px]" title={row.title}>
                    {row.id ? (
                      <a href={`/?o=${row.id}`} target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline truncate block">
                        {row.title}
                      </a>
                    ) : (
                      <span className="text-gray-900 dark:text-gray-100 truncate block">{row.title}</span>
                    )}
                  </td>
                  <td className="p-3 text-right text-gray-700 dark:text-gray-300">{row.views}</td>
                  <td className="p-3 text-right text-gray-700 dark:text-gray-300">{row.outbound}</td>
                  <td className="p-3 text-right text-gray-700 dark:text-gray-300">{row.shares ?? 0}</td>
                  <td className="p-3 text-right text-gray-700 dark:text-gray-300">
                    {row.ctr != null ? `${row.ctr}%` : '—'}
                  </td>
                  <td className="p-3 text-right text-gray-700 dark:text-gray-300">{row.score}</td>
                  <td className="p-3 text-right text-gray-700 dark:text-gray-300">{row.score_final}</td>
                  <td className="p-3 text-gray-600 dark:text-gray-400">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {toast && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-gray-900 dark:bg-gray-700 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
