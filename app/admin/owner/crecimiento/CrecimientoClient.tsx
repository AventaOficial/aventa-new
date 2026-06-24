'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { GrowthDashboardPayload, TrafficLight } from '@/lib/owner/buildGrowthDashboard';
import {
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  RefreshCw,
  Rocket,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';

function formatNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX');
}

function formatMoneyRange(min: number, max: number): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
  if (min === max) return fmt(min);
  if (min === 0) return `Gratis – ${fmt(max)}/mes aprox.`;
  return `${fmt(min)} – ${fmt(max)}/mes aprox.`;
}

function statusDot(status: TrafficLight): string {
  if (status === 'green') return 'bg-emerald-500';
  if (status === 'yellow') return 'bg-amber-500';
  return 'bg-red-500';
}

function roadmapBadge(status: 'done' | 'partial' | 'pending'): string {
  if (status === 'done') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  if (status === 'partial') return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

function roadmapLabel(status: 'done' | 'partial' | 'pending'): string {
  if (status === 'done') return 'Listo';
  if (status === 'partial') return 'En curso';
  return 'Pendiente';
}

export default function CrecimientoClient() {
  const [data, setData] = useState<GrowthDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    const res = await fetch('/api/admin/growth-dashboard', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof json?.error === 'string' ? json.error : 'Error al cargar');
      setData(null);
      return;
    }
    setData(json as GrowthDashboardPayload);
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
    return <div className="p-6 text-sm text-gray-500">Cargando Crecimiento AVENTA…</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { aspiration, users, infrastructure, roadmap, nextActions } = data;

  return (
    <div className="space-y-6 pb-12 max-w-5xl">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Link
            href="/admin/owner"
            className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Owner Dashboard
          </Link>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
            Fundador
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100 flex items-center gap-2">
            <Rocket className="h-8 w-8 text-violet-600 dark:text-violet-400" />
            Crecimiento AVENTA
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-xl">
            Cuántos usuarios tienes, en qué etapa vas, cuándo pagar más en Supabase/Upstash/Vercel y qué toca
            evolucionar en código. Meta: {aspiration.targetLabel}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </header>

      {/* Meta millón */}
      <section className="rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-700 text-white p-6 md:p-8 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-violet-200">Tu meta</p>
            <p className="mt-2 text-2xl md:text-3xl font-semibold">{aspiration.targetLabel}</p>
            <p className="mt-2 text-violet-100 text-sm">
              Etapa actual: <strong>{aspiration.currentStageLabel}</strong> — {aspiration.currentHeadline}
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold tabular-nums">{aspiration.progressToMillionPct}%</p>
            <p className="text-xs text-violet-200">del camino al millón</p>
          </div>
        </div>
        <div className="mt-5 h-2.5 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-white transition-all duration-500"
            style={{ width: `${Math.max(2, aspiration.progressToMillionPct)}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-violet-100">
          <Users className="inline h-4 w-4 mr-1" />
          {formatNum(aspiration.totalUsers)} usuarios registrados
          {aspiration.nextStageLabel && aspiration.progressToNextPct != null
            ? ` · ${aspiration.progressToNextPct}% hacia etapa «${aspiration.nextStageLabel}»`
            : ''}
        </p>
        <p className="mt-2 text-sm text-violet-50/90">{aspiration.currentFocus}</p>
      </section>

      {/* KPIs usuarios */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total usuarios', value: formatNum(users.total) },
          { label: 'Nuevos hoy', value: `+${formatNum(users.newToday)}` },
          { label: 'Nuevos 7 días', value: formatNum(users.new7d) },
          { label: 'Activos 24h', value: formatNum(users.active24h) },
          { label: 'Nuevos 30 días', value: formatNum(users.new30d) },
          {
            label: 'Crecimiento semanal',
            value: users.growthWeeklyPct != null ? `${users.growthWeeklyPct >= 0 ? '+' : ''}${users.growthWeeklyPct}%` : '—',
          },
          { label: 'Retención 48h', value: users.retention48hPct != null ? `${users.retention48hPct}%` : '—' },
          { label: 'Ofertas aprobadas', value: formatNum(data.content.offersApproved) },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-[#1C1C1E] p-4"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400">{kpi.label}</p>
            <p className="mt-1 text-xl font-semibold text-[#1D1D1F] dark:text-gray-100">{kpi.value}</p>
          </div>
        ))}
      </section>

      {/* Próximas acciones */}
      <section className="rounded-3xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-[#1C1C1E] p-5 md:p-6">
        <h2 className="text-lg font-semibold text-[#1D1D1F] dark:text-gray-100 flex items-center gap-2">
          <Target className="h-5 w-5 text-violet-600" />
          Qué hacer ahora
        </h2>
        <ul className="mt-4 space-y-3">
          {nextActions.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-[#F5F5F7]/60 dark:bg-[#111113] p-3"
            >
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusDot(a.priority)}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{a.title}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{a.detail}</p>
              </div>
              {a.href ? (
                <Link href={a.href} className="shrink-0 text-violet-600 dark:text-violet-400">
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* Infra y costos */}
      <section className="rounded-3xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-[#1C1C1E] p-5 md:p-6">
        <h2 className="text-lg font-semibold text-[#1D1D1F] dark:text-gray-100 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-violet-600" />
          Infraestructura y cuándo pagar más
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Costos orientativos en MXN. Confirma siempre en el panel de cada proveedor (Upstash → Usage, Supabase →
          Billing).
        </p>
        <div className="mt-4 space-y-4">
          {infrastructure.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border border-gray-200/80 dark:border-gray-700 p-4 md:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${statusDot(row.status)}`} />
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{row.name}</h3>
                </div>
                <p className="text-sm font-medium text-violet-700 dark:text-violet-300">
                  {formatMoneyRange(row.costReferenceMxn.min, row.costReferenceMxn.max)}
                </p>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{row.currentPlanHint}</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{row.freeLimitNote}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Cuándo subir de plan</p>
              <ul className="mt-1.5 space-y-1">
                {row.upgradeWhen.map((w) => (
                  <li key={w} className="text-sm text-gray-700 dark:text-gray-300 flex gap-2">
                    <span className="text-violet-500">·</span>
                    {w}
                  </li>
                ))}
              </ul>
              {row.panelUrl ? (
                <a
                  href={row.panelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline"
                >
                  Abrir panel
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Operación: cola write_queue {data.operations.writeQueuePending} pendientes ·{' '}
          {data.operations.writeQueueFailed} fallidos · eventos en modo{' '}
          <code className="text-violet-600 dark:text-violet-400">{data.operations.eventWriteMode}</code>
          {data.operations.upstashConfigured ? ' · Upstash OK' : ' · ⚠ Upstash no detectado en env'}
        </p>
      </section>

      {/* Roadmap código */}
      <section className="rounded-3xl border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-[#1C1C1E] p-5 md:p-6">
        <h2 className="text-lg font-semibold text-[#1D1D1F] dark:text-gray-100">Hoja de ruta técnica</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Evolución del código e infra para soportar el crecimiento sin rehacer AVENTA.
        </p>
        <div className="mt-4 space-y-4">
          {roadmap.map((phase) => (
            <div key={phase.id} className="rounded-2xl border border-gray-200/80 dark:border-gray-700 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${roadmapBadge(phase.codeStatus)}`}>
                  {roadmapLabel(phase.codeStatus)}
                </span>
                <span className="text-xs text-gray-500">{phase.userRange}</span>
              </div>
              <h3 className="mt-2 font-semibold text-gray-900 dark:text-gray-100">{phase.title}</h3>
              <ul className="mt-2 space-y-1">
                {phase.items.map((item) => (
                  <li key={item} className="text-sm text-gray-600 dark:text-gray-400 flex gap-2">
                    <span className="text-violet-400">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Docs: {data.docsRefs.join(' · ')}
        </p>
      </section>
    </div>
  );
}
