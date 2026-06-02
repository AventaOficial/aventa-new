'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { OwnerDashboardPayload, PeriodKpis, TrafficLight } from '@/lib/owner/buildOwnerDashboard';
import { formatDiff } from '@/lib/owner/buildOwnerDashboard';
import AventaMapSection from './AventaMapSection';
import FounderModeGrid from './FounderModeGrid';
import InfrastructureSection from './InfrastructureSection';

function statusDot(status: TrafficLight): string {
  if (status === 'green') return 'bg-emerald-500';
  if (status === 'yellow') return 'bg-amber-500';
  return 'bg-red-500';
}

function formatNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX');
}

function formatMoneyCents(cents: number | null): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
}

function KpiCard({
  label,
  value,
  diff,
  highlight,
}: {
  label: string;
  value: string;
  diff?: { delta: number | null; label: string | null };
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 border ${
        highlight
          ? 'bg-violet-50/80 dark:bg-violet-950/30 border-violet-200/80 dark:border-violet-800/50'
          : 'bg-[#F5F5F7] dark:bg-[#111113] border-gray-200/60 dark:border-gray-800'
      }`}
    >
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">{value}</p>
      {diff?.label ? (
        <p
          className={`mt-1 text-xs font-medium flex items-center gap-1 ${
            diff.delta != null && diff.delta > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : diff.delta != null && diff.delta < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {diff.delta != null && diff.delta > 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : diff.delta != null && diff.delta < 0 ? (
            <TrendingDown className="h-3 w-3" />
          ) : null}
          {diff.label}
        </p>
      ) : null}
    </div>
  );
}

function PeriodSection({
  title,
  kpis,
  compareTo,
}: {
  title: string;
  kpis: PeriodKpis;
  compareTo?: PeriodKpis;
}) {
  const d = compareTo
    ? {
        active: formatDiff(kpis.activeUsers, compareTo.activeUsers),
        newU: formatDiff(kpis.newUsers, compareTo.newUsers),
        outbound: formatDiff(kpis.outbound, compareTo.outbound),
        ctr: formatDiff(kpis.ctr, compareTo.ctr),
        approved: formatDiff(kpis.offersApproved, compareTo.offersApproved),
      }
    : null;

  return (
    <section className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-5 md:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
      <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">{title}</h2>
      {!kpis.available && title !== 'Hoy' ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Algunos datos de eventos no están disponibles.</p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Activos" value={formatNum(kpis.activeUsers)} diff={d?.active} />
        <KpiCard label="Nuevos registros" value={formatNum(kpis.newUsers)} diff={d?.newU} />
        <KpiCard label="Clics a tienda" value={formatNum(kpis.outbound)} diff={d?.outbound} highlight />
        <KpiCard
          label="CTR"
          value={kpis.ctr != null ? `${kpis.ctr}%` : '—'}
          diff={
            d?.ctr?.delta != null && kpis.ctr != null && compareTo?.ctr != null
              ? { delta: Math.round((kpis.ctr - compareTo.ctr!) * 100) / 100, label: d.ctr.label }
              : undefined
          }
        />
        <KpiCard label="Vistas" value={formatNum(kpis.views)} />
        <KpiCard label="Aprobadas (mod)" value={formatNum(kpis.offersApproved)} diff={d?.approved} />
        {kpis.offersPending != null ? (
          <KpiCard label="Pendientes (ahora)" value={formatNum(kpis.offersPending)} />
        ) : null}
        <KpiCard label="Rechazadas (mod)" value={formatNum(kpis.offersRejected)} />
        <KpiCard label="Ofertas creadas" value={formatNum(kpis.offersCreated)} />
      </div>
    </section>
  );
}

export default function OwnerDashboardClient() {
  const [data, setData] = useState<OwnerDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError('Inicia sesión');
      setLoading(false);
      return;
    }
    const res = await fetch('/api/admin/owner-dashboard', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof json?.error === 'string' ? json.error : 'Error al cargar');
      setData(null);
      return;
    }
    setData(json as OwnerDashboardPayload);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await load();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Cargando panel del fundador…</div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 pb-10 max-w-5xl">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
            Fundador
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">
            Owner Dashboard
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Founder Mode · {data.timezone}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </header>

      <FounderModeGrid data={data} />

      {/* ACCIÓN RECOMENDADA — siempre visible tras Founder Mode */}
      <section className="rounded-3xl border-2 border-violet-300/80 dark:border-violet-700/80 bg-violet-50/50 dark:bg-violet-950/25 p-5 md:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
          Acción recomendada
        </p>
        <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{data.recommendedAction.title}</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{data.recommendedAction.detail}</p>
          </div>
          <Link
            href={data.recommendedAction.href}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold px-5 py-2.5 text-sm shrink-0"
          >
            Ir
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {data.alerts.length > 0 ? (
        <section className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-5 md:p-6">
          <h2 className="text-lg font-semibold text-[#1D1D1F] dark:text-gray-100">Alertas</h2>
          <ul className="mt-4 space-y-2">
            {data.alerts.map((a) => (
              <li
                key={a.id}
                className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm border ${
                  a.severity === 'red'
                    ? 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20'
                    : 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20'
                }`}
              >
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${statusDot(a.severity)}`} />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{a.title}</p>
                  <p className="text-gray-600 dark:text-gray-400">{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left bg-[#F5F5F7] dark:bg-[#111113] hover:bg-gray-100/80 dark:hover:bg-gray-900 transition-colors"
        >
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {showDetail ? 'Ocultar detalle completo' : 'Ver detalle completo del panel'}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">Mapa · KPIs · Infra</span>
        </button>
        {showDetail ? (
          <div className="p-4 md:p-5 space-y-6 border-t border-gray-200/70 dark:border-gray-800 bg-white dark:bg-[#0a0a0a]">
            <AventaMapSection />

      {/* RESUMEN */}
      <section className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-5 md:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <div className="flex items-start gap-4">
          <div className={`mt-1 h-3 w-3 rounded-full shrink-0 ${statusDot(data.summary.status)}`} />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-[#1D1D1F] dark:text-gray-100">{data.summary.headline}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{data.summary.subline}</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {data.growth.weeklyPct != null ? (
                <span
                  className={`rounded-lg px-2.5 py-1 font-medium ${
                    data.growth.weeklyPct >= 0
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200'
                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100'
                  }`}
                >
                  Registros 7d: {data.growth.weeklyPct >= 0 ? '+' : ''}
                  {data.growth.weeklyPct}%
                </span>
              ) : null}
              {data.growth.retention48hPct != null ? (
                <span className="rounded-lg px-2.5 py-1 font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200">
                  Retención 48h: {data.growth.retention48hPct}%
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <PeriodSection title="Hoy" kpis={data.today} compareTo={data.yesterday} />
      <PeriodSection title="Ayer" kpis={data.yesterday} />

      {/* SEMANA */}
      <section className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-5 md:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">Esta semana (7 días)</h2>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Clics a tienda" value={formatNum(data.week.outbound)} highlight />
          <KpiCard label="CTR" value={data.week.ctr != null ? `${data.week.ctr}%` : '—'} />
          <KpiCard label="Vistas" value={formatNum(data.week.views)} />
          <KpiCard label="Nuevos usuarios" value={formatNum(data.week.newUsers)} />
        </div>
        {data.week.topOffers.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top 5 ofertas (clics)</h3>
            <ul className="mt-2 space-y-2">
              {data.week.topOffers.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/oferta/${o.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900/50 text-sm"
                  >
                    <span className="truncate font-medium text-violet-600 dark:text-violet-400">{o.title}</span>
                    <span className="shrink-0 text-gray-600 dark:text-gray-400">
                      {o.outbound} clics{o.ctr != null ? ` · ${o.ctr}%` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {data.week.topCategories.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top categorías</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {data.week.topCategories.map((c) => (
                <li
                  key={c.category}
                  className="rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300"
                >
                  {c.category}: {c.outbound} clics
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* MES */}
      <section className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-5 md:p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">Este mes</h2>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard label="Clics a tienda" value={formatNum(data.month.outbound)} highlight />
          <KpiCard
            label="Ingreso bruto (ledger)"
            value={data.month.ledgerAvailable ? formatMoneyCents(data.month.ledgerGrossCents) : 'N/D'}
          />
          <KpiCard
            label="Ingreso estimado"
            value={
              data.month.estimatedRevenueCents != null
                ? formatMoneyCents(data.month.estimatedRevenueCents)
                : 'Sin dato'
            }
          />
        </div>
        {data.month.estimatedNote ? (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{data.month.estimatedNote}</p>
        ) : null}
        {data.month.ledgerNote && !data.month.ledgerAvailable ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{data.month.ledgerNote}</p>
        ) : null}
        {data.month.topOffer ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Oferta con más clics del mes:{' '}
            <Link href={`/oferta/${data.month.topOffer.id}`} className="font-medium text-violet-600 dark:text-violet-400">
              {data.month.topOffer.title}
            </Link>{' '}
            ({data.month.topOffer.outbound} clics)
          </p>
        ) : null}
      </section>

      {/* MODERACIÓN */}
      <section className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-5 md:p-6">
        <h2 className="text-lg font-semibold text-[#1D1D1F] dark:text-gray-100">Moderación</h2>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Pendientes" value={formatNum(data.moderation.pending)} />
          <KpiCard label="Aprobadas hoy" value={formatNum(data.moderation.approvedToday)} />
          <KpiCard label="Rechazadas hoy" value={formatNum(data.moderation.rejectedToday)} />
          <KpiCard
            label="SLA aprobación (7d)"
            value={
              data.moderation.avgApprovalHours != null
                ? `${data.moderation.avgApprovalHours}h`
                : '—'
            }
          />
        </div>
        {data.moderation.slaOk != null ? (
          <p
            className={`mt-3 text-sm font-medium flex items-center gap-2 ${
              data.moderation.slaOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {data.moderation.slaOk ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            Objetivo SLA: {data.moderation.slaHoursTarget}h —{' '}
            {data.moderation.slaOk ? 'dentro de meta' : 'por encima de meta'}
          </p>
        ) : data.moderation.slaNote ? (
          <p className="mt-3 text-xs text-gray-500">{data.moderation.slaNote}</p>
        ) : null}
        <Link href="/admin/moderation" className="mt-4 inline-block text-sm font-medium text-violet-600 dark:text-violet-400">
          Abrir cola →
        </Link>
      </section>

      <InfrastructureSection />

      {/* AFILIACIÓN */}
      <section className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-5 md:p-6">
        <h2 className="text-lg font-semibold text-[#1D1D1F] dark:text-gray-100">Afiliación</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <KpiCard
            label="Programas activos"
            value={`${data.affiliation.programsActive} / ${data.affiliation.programsTotal}`}
          />
          <KpiCard label="Tag Amazon" value={data.affiliation.amazonTagConfigured ? 'Sí' : 'No'} />
          <KpiCard label="Tag Mercado Libre" value={data.affiliation.mercadolibreTagConfigured ? 'Sí' : 'No'} />
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{data.affiliation.storeBreakdownNote}</p>
        {data.affiliation.outboundByStore.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-sm">
            {data.affiliation.outboundByStore.map((row) => (
              <li key={row.store} className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>{row.store}</span>
                <span className="font-medium">{row.outbound} clics</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-gray-500">Sin clics esta semana o sin datos.</p>
        )}
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
          Clics sin tag no se miden en base de datos — revisa variables en Vercel.
        </p>
      </section>

      {/* Operaciones + gaps */}
      <section className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-4 text-xs text-gray-500 dark:text-gray-400 space-y-2">
        <p>
          <strong className="text-gray-700 dark:text-gray-300">Operaciones:</strong> integridad{' '}
          {data.operations.integrityOk === true ? 'OK' : data.operations.integrityOk === false ? 'falló' : '—'} · cola
          escritura {data.operations.writeQueuePending} pendientes, {data.operations.writeQueueFailed} fallidos
        </p>
        <p>
          Enlaces:{' '}
          <Link href="/admin/operaciones" className="text-violet-600 dark:text-violet-400 underline">
            Operaciones
          </Link>
          {' · '}
          <Link href="/admin/metrics" className="text-violet-600 dark:text-violet-400 underline">
            Métricas
          </Link>
          {' · '}
          <Link href="/admin/commissions" className="text-violet-600 dark:text-violet-400 underline">
            Ledger
          </Link>
        </p>
        {data.dataGaps.length > 0 ? (
          <div>
            <p className="font-semibold text-gray-600 dark:text-gray-400 mt-2">Datos no disponibles o limitados:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              {data.dataGaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
