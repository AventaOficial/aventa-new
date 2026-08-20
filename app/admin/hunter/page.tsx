'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BowArrow, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import GlassCard from '@/app/components/panel/GlassCard';
import KpiCard from '@/app/components/panel/KpiCard';
import LoadingState from '@/app/components/panel/LoadingState';
import SectionHeader from '@/app/components/panel/SectionHeader';
import StatusBadge from '@/app/components/panel/StatusBadge';
import { HUNTER_MODULES, type HunterModuleStatus } from '@/lib/hunter/modules';

type HunterStatus = {
  enabled: boolean;
  paused_by_owner?: boolean;
  cron: { schedule: string; deployment_note?: string };
  config: {
    discover_ml?: boolean;
    amazon_asins_count?: number;
    amazon_paapi_enabled?: boolean;
    keepa_enabled?: boolean;
    urls_count: number;
    has_ingest_sources?: boolean;
    external_worker_ingest?: boolean;
    auto_approve_enabled?: boolean;
    auto_approve_min_score?: number;
    reject_below_score?: number;
  };
  capacity: {
    inserted_today_approx?: number | null;
  };
  offers: {
    pending_count: number | null;
    recent: Array<{
      id: string;
      title: string;
      status: string;
      created_at: string;
      store: string | null;
      price: number;
    }>;
  };
};

const MODULE_TONE: Record<HunterModuleStatus, 'ok' | 'attention' | 'neutral'> = {
  live: 'ok',
  partial: 'attention',
  planned: 'neutral',
};

const MODULE_LABEL: Record<HunterModuleStatus, string> = {
  live: 'En producción',
  partial: 'Parcial',
  planned: 'Siguiente',
};

export default function HunterPage() {
  const [data, setData] = useState<HunterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError('Sin sesión');
      setLoading(false);
      return;
    }
    const res = await fetch('/api/admin/bot-ingest-status', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      setError('No se pudo leer el estado del cazador');
      setLoading(false);
      return;
    }
    setData((await res.json()) as HunterStatus);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    setRunMsg(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setRunMsg('Sin sesión');
      setRunning(false);
      return;
    }
    const res = await fetch('/api/admin/bot-ingest-run-now', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      summary?: { inserted?: number };
    };
    setRunMsg(
      res.ok ? `Ciclo listo. Insertadas: ${body.summary?.inserted ?? '—'}` : body.error ?? 'Falló el ciclo'
    );
    setRunning(false);
    await load();
  };

  const runningOk = Boolean(data?.enabled && !data.paused_by_owner);
  const sources = [
    { name: 'Mercado Libre', on: Boolean(data?.config.discover_ml) },
    { name: 'Amazon', on: (data?.config.amazon_asins_count ?? 0) > 0 || Boolean(data?.config.amazon_paapi_enabled) },
    { name: 'Keepa (historial)', on: Boolean(data?.config.keepa_enabled) },
    { name: 'URLs / feeds', on: (data?.config.urls_count ?? 0) > 0 },
    { name: 'Worker externo', on: Boolean(data?.config.external_worker_ingest) },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] glass-dark p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Empleado digital</p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight text-white/90">
          <BowArrow className="h-8 w-8 text-violet-300" />
          AVENTA Hunter
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/50 leading-relaxed">
          No es una IA que recorre internet. Es el pipeline que ya tienes: recolector → precio → score → afiliado →
          publicar. Tú ves la bandeja; el cazador trabaja con cron y APIs.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {data ? (
            <StatusBadge tone={runningOk ? 'ok' : 'attention'} pulse={runningOk}>
              {runningOk ? 'Running' : data.paused_by_owner ? 'Pausado' : 'Apagado'}
            </StatusBadge>
          ) : null}
          <button
            type="button"
            onClick={() => void runNow()}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-full bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
            Explorar ahora
          </button>
          <Link href="/admin/moderation" className="text-sm text-violet-300 hover:underline">
            Cola de revisión
          </Link>
          <Link href="/admin/operaciones/trabajo" className="text-sm text-white/45 hover:underline">
            Automations
          </Link>
        </div>
        {runMsg ? <p className="mt-3 text-sm text-white/55">{runMsg}</p> : null}
      </section>

      {loading ? (
        <LoadingState message="Consultando al cazador…" />
      ) : error ? (
        <GlassCard>
          <p className="text-sm text-red-300">{error}</p>
        </GlassCard>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Publicadas hoy" value={String(data.capacity.inserted_today_approx ?? '—')} />
            <KpiCard label="Pendientes de revisión" value={String(data.offers.pending_count ?? '—')} />
            <KpiCard
              label="Auto-publicar desde"
              value={
                data.config.auto_approve_enabled ? `${data.config.auto_approve_min_score ?? '—'}` : 'Off'
              }
            />
            <KpiCard label="Descartar bajo" value={String(data.config.reject_below_score ?? '—')} />
          </div>

          <GlassCard>
            <SectionHeader title="Fuentes" subtitle="APIs y feeds, no scrape masivo cada 15 min" />
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {sources.map((s) => (
                <li key={s.name} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
                  <span className="text-sm text-white/80">{s.name}</span>
                  <StatusBadge tone={s.on ? 'ok' : 'neutral'}>{s.on ? 'Activa' : 'Off'}</StatusBadge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-white/35">Cron objetivo: {data.cron.schedule}. {data.cron.deployment_note}</p>
          </GlassCard>

          <GlassCard>
            <SectionHeader title="Últimos hallazgos" subtitle="Lo que el publisher acaba de insertar" />
            {data.offers.recent.length === 0 ? (
              <p className="mt-4 text-sm text-white/40">Aún no hay ofertas del cazador.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {data.offers.recent.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white/85">{o.title}</p>
                      <p className="text-xs text-white/40">
                        {o.store ?? 'Tienda'} · ${o.price.toLocaleString('es-MX')}
                      </p>
                    </div>
                    <StatusBadge
                      tone={o.status === 'approved' ? 'ok' : o.status === 'pending' ? 'attention' : 'neutral'}
                    >
                      {o.status}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </>
      ) : null}

      <GlassCard>
        <SectionHeader
          title="Los 8 sistemas"
          subtitle="Así se construye: módulos encima del ingest actual, no otro producto"
        />
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {HUNTER_MODULES.map((m) => (
            <li key={m.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-white/90">
                  {m.emoji} {m.name}
                </p>
                <StatusBadge tone={MODULE_TONE[m.status]}>{MODULE_LABEL[m.status]}</StatusBadge>
              </div>
              <p className="mt-1.5 text-xs text-white/45 leading-relaxed">{m.job}</p>
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}
