'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';

type Period = 'all' | 'day' | 'week' | 'month';

type Row = {
  id?: string;
  title: string;
  category?: string | null;
  views: number;
  outbound: number;
  shares: number;
  ctr: number | null;
  score: number;
  score_final: number;
  created_at: string;
  /** Número de votos (cazadas) por oferta */
  cazadas: number;
};

type SortKey = 'views' | 'outbound' | 'ctr' | 'shares' | 'cazadas';

type OfferWithRelations = {
  id: string;
  title: string;
  category?: string | null;
  created_at: string;
  offer_events?: Array<{ event_type: string; created_at: string }> | null;
  offer_votes?: Array<{ value: number }> | null;
};

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Últimas 24h' },
  { value: 'week', label: 'Últimos 7 días' },
  { value: 'month', label: 'Últimos 30 días' },
  { value: 'all', label: 'Todo' },
];

function formatNum(n: number): string {
  return n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function computeScoreFinal(score: number, createdAt: string): number {
  const hours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 3600);
  const base = Math.max(hours + 2, 2);
  return Number((score / Math.pow(base, 1.5)).toFixed(2));
}

function computeRowsFromOffers(offers: OfferWithRelations[], dateLimit: Date): Row[] {
  const limitIso = dateLimit.toISOString();
  return offers.map((o) => {
    const events = (o.offer_events ?? []).filter((e) => e.created_at >= limitIso);
    const views = events.filter((e) => e.event_type === 'view').length;
    const outbound = events.filter((e) => e.event_type === 'outbound').length;
    const shares = events.filter((e) => e.event_type === 'share').length;
    const ctr = views > 0 ? Number(((outbound / views) * 100).toFixed(2)) : null;
    const votes = o.offer_votes ?? [];
    const score = votes.reduce((s, v) => s + (v.value === 2 ? 2 : v.value === -1 ? -1 : v.value === 1 ? 1 : 0), 0);
    const score_final = computeScoreFinal(score, o.created_at);
    return {
      id: o.id,
      title: o.title,
      category: o.category ?? null,
      views,
      outbound,
      shares,
      ctr,
      score,
      score_final,
      created_at: o.created_at,
      cazadas: votes.length,
    };
  });
}

type ProductMetrics = {
  new_users_today: number;
  active_users_24h: number;
  retention_48h_pct: number | null;
  best_hour_utc: number | null;
  best_hour_count: number;
};

export default function MetricsPage() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productMetrics, setProductMetrics] = useState<ProductMetrics | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('outbound');
  const sorted = [...data].sort((a, b) => {
    const key = sortBy;
    const va = key === 'views' ? a.views : key === 'cazadas' ? (a.cazadas ?? 0) : a[key];
    const vb = key === 'views' ? b.views : key === 'cazadas' ? (b.cazadas ?? 0) : b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (vb as number) - (va as number);
  });
  const [period, setPeriod] = useState<Period>('week');
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showExtra, setShowExtra] = useState(false);
  const [mlLeadersPaste, setMlLeadersPaste] = useState('');
  const [mlLeadersRows, setMlLeadersRows] = useState<{ tag: string; ganancia: number }[]>([]);
  const { session } = useAuth();

  const loadData = useCallback(async () => {
    const supabase = createClient();
    if (period === 'all') {
      const { data: rows, error: err } = await supabase.from('offer_performance_metrics').select('*');
      if (err) {
        setError(err.message);
        return;
      }
      setError(null);
      setData(
        (rows ?? []).map((r: Record<string, unknown>) => ({
          ...r,
          shares: r.shares ?? 0,
          cazadas: (r.cazadas as number) ?? (r.votes_count as number) ?? 0,
        })) as Row[]
      );
      return;
    }
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { data: offers, error: err } = await supabase
      .from('offers')
      .select(`id, title, category, created_at, offer_events(event_type, created_at), offer_votes(value)`)
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
    if (!session?.access_token) return;
    fetch('/api/admin/product-metrics', { headers: { Authorization: 'Bearer ' + session.access_token } })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => json && setProductMetrics(json))
      .catch(() => {});
  }, [session?.access_token]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      await fetch('/api/admin/refresh-metrics', { method: 'POST', headers });
      await loadData();
      setToast('Datos actualizados');
    } catch {
      setToast('Error al actualizar');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const summary = {
    totalViews: data.reduce((s, r) => s + r.views, 0),
    totalOutbound: data.reduce((s, r) => s + r.outbound, 0),
    totalShares: data.reduce((s, r) => s + (r.shares ?? 0), 0),
    activeOffers: data.length,
  };
  const globalCtr =
    summary.totalViews > 0 ? ((summary.totalOutbound / summary.totalViews) * 100).toFixed(1) : null;
  const bestHourMexico =
    productMetrics?.best_hour_utc != null ? (productMetrics.best_hour_utc - 6 + 24) % 24 : null;

  const parseMlLeaders = () => {
    const lines = mlLeadersPaste.trim().split(/\n/).map((l) => l.trim()).filter(Boolean);
    const rows: { tag: string; ganancia: number }[] = [];
    for (const line of lines) {
      const parts = line.split(/[\t,;]/).map((p) => p.trim());
      const tag = parts[0] ?? '';
      const ganancia = Number(parts[1]?.replace(/[^\d.-]/g, '')) || 0;
      if (tag) rows.push({ tag, ganancia });
    }
    setMlLeadersRows(rows);
  };

  if (loading && data.length === 0) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600 dark:text-red-400">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Métricas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Resumen de la comunidad y actividad de ofertas.
        </p>
      </div>

      {/* Bloque 1: Lo más importante — comunidad */}
      {productMetrics && (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Resumen de la comunidad
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {productMetrics.new_users_today}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Usuarios nuevos hoy</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">(zona horaria México)</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-violet-600 dark:text-violet-400">
                {productMetrics.active_users_24h}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Activos en las últimas 24h</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">(quienes abrieron la app)</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {productMetrics.retention_48h_pct != null ? productMetrics.retention_48h_pct + '%' : '—'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Retención 48h <span className="text-violet-600 dark:text-violet-400">(métrica clave en beta)</span>
              </p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {bestHourMexico != null ? `${bestHourMexico}:00` : '—'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Mejor hora (MX)</p>
            </div>
          </div>
        </section>
      )}

      {/* Bloque 2: Actividad de ofertas */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Actividad de ofertas
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              disabled={loading}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-lg bg-violet-600 text-white px-4 py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
            >
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatNum(summary.totalViews)}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Vistas</p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatNum(summary.totalOutbound)}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Clics a tienda</p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{globalCtr ?? '—'}{globalCtr != null ? '%' : ''}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">CTR</p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-4">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.activeOffers}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Ofertas con actividad</p>
          </div>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Ordenar por:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm"
            >
              <option value="outbound">Clics a tienda</option>
              <option value="cazadas">Cazadas</option>
              <option value="views">Vistas</option>
              <option value="ctr">CTR</option>
              <option value="shares">Compartidos</option>
            </select>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left p-3 font-medium text-gray-700 dark:text-gray-300">Oferta</th>
                <th className="text-right p-3 font-medium text-gray-700 dark:text-gray-300">Vistas</th>
                <th className="text-right p-3 font-medium text-gray-700 dark:text-gray-300">Clics</th>
                <th className="text-right p-3 font-medium text-gray-700 dark:text-gray-300">CTR</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500 dark:text-gray-400">
                    No hay datos en este período
                  </td>
                </tr>
              ) : (
                sorted.slice(0, 50).map((row, i) => (
                  <tr key={row.id ?? i} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="p-3 max-w-[220px]">
                      {row.id ? (
                        <a href={`/?o=${row.id}`} target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline truncate block">
                          {row.title}
                        </a>
                      ) : (
                        <span className="truncate block text-gray-900 dark:text-gray-100">{row.title}</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{row.views}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{row.outbound}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">{row.cazadas ?? 0}</td>
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">
                      {row.ctr != null ? `${row.ctr}%` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {sorted.length > 50 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Mostrando las 50 primeras. Total: {sorted.length} ofertas.
          </p>
        )}
      </section>

      {/* Opcional: Afiliados y líderes ML */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <button
          type="button"
          onClick={() => setShowExtra(!showExtra)}
          className="w-full flex items-center justify-between text-left text-lg font-semibold text-gray-900 dark:text-gray-100"
        >
          <span>Más opciones (afiliados, líderes ML)</span>
          <span className="text-2xl text-gray-400">{showExtra ? '−' : '+'}</span>
        </button>
        {showExtra && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Líderes ML (pegar etiqueta,ganancia)</h3>
              <textarea
                placeholder="aventa_capitanjeshua,323.75"
                value={mlLeadersPaste}
                onChange={(e) => setMlLeadersPaste(e.target.value)}
                onBlur={parseMlLeaders}
                rows={3}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              />
              <button type="button" onClick={parseMlLeaders} className="mt-2 rounded-lg bg-amber-600 text-white px-3 py-1.5 text-sm">
                Aplicar
              </button>
              {mlLeadersRows.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-gray-700/50">
                        <th className="text-left p-2">Etiqueta</th>
                        <th className="text-right p-2">Ganancia (MXN)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mlLeadersRows.map((r, i) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="p-2 font-mono">{r.tag}</td>
                          <td className="p-2 text-right">${formatNum(r.ganancia)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-gray-500 mt-2">Total: ${formatNum(mlLeadersRows.reduce((s, r) => s + r.ganancia, 0))} MXN</p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-gray-900 dark:bg-gray-700 px-4 py-2.5 text-sm font-medium text-white shadow-lg" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
