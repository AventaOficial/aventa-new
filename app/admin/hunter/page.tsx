'use client';

import { startTransition, useCallback, useEffect, useState } from 'react';
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

type HunterHealthPayload = {
  isHunting: boolean;
  reason: string;
  lastInsertAt: string | null;
  rows: Array<{
    sourceId: string;
    displayStatus: 'healthy' | 'degraded' | 'down' | 'disabled';
    status: string;
    breakerState: string;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    itemsFound: number;
    itemsInserted: number;
    duplicates: number;
    errors: number;
    lastErrorCode: string | null;
  }>;
  catalog: Array<{ id: string; displayName: string }>;
  dealVerifier?: {
    evaluated: number;
    autoApproved: number;
    review: number;
    rejected: number;
    errors: number;
    topReasons: Array<{ reason: string; count: number }>;
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

function healthTone(status: string): 'ok' | 'attention' | 'neutral' {
  if (status === 'healthy') return 'ok';
  if (status === 'degraded' || status === 'down') return 'attention';
  return 'neutral';
}

function healthEmoji(status: string): string {
  if (status === 'healthy') return '🟢';
  if (status === 'degraded') return '🟡';
  if (status === 'down') return '🔴';
  return '⚫';
}

export default function HunterPage() {
  const [data, setData] = useState<HunterStatus | null>(null);
  const [health, setHealth] = useState<HunterHealthPayload | null>(null);
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
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const [statusRes, healthRes] = await Promise.all([
      fetch('/api/admin/bot-ingest-status', { headers }),
      fetch('/api/admin/hunter-health', { headers }),
    ]);
    if (!statusRes.ok) {
      setError('No se pudo leer el estado del cazador');
      setLoading(false);
      return;
    }
    setData((await statusRes.json()) as HunterStatus);
    if (healthRes.ok) {
      setHealth((await healthRes.json()) as HunterHealthPayload);
    }
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
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
      enabled?: boolean;
      pausedByOwner?: boolean;
      runMode?: string;
      summary?: {
        inserted?: number;
        skipped?: number;
        rejected?: number;
        duplicate?: number;
        stageCounts?: { collected?: number; evaluated?: number };
        skipReasonCounts?: Record<string, number>;
        sourceStats?: { ml_api?: { collected?: number } };
      };
    };
    if (!res.ok) {
      setRunMsg(body.error ?? 'Falló el ciclo');
      setRunning(false);
      await load();
      return;
    }
    if (body.pausedByOwner) {
      setRunMsg('Pausado en Automations (Permitir ejecución del bot).');
    } else if (body.enabled === false) {
      setRunMsg('Bot apagado en env (BOT_INGEST_ENABLED).');
    } else {
      const topSkips = Object.entries(body.summary?.skipReasonCounts ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, n]) => `${reason} ×${n}`)
        .join(' · ');
      const mlCollected = body.summary?.sourceStats?.ml_api?.collected ?? 0;
      const collected = body.summary?.stageCounts?.collected ?? 0;
      setRunMsg(
        [
          `Modo ${body.runMode ?? '—'}.`,
          `Insertadas ${body.summary?.inserted ?? 0}`,
          `omitidas ${body.summary?.skipped ?? 0}`,
          `rechazadas ${body.summary?.rejected ?? 0}`,
          `dup ${body.summary?.duplicate ?? 0}.`,
          `Pool ${collected} (ML búsqueda ${mlCollected}).`,
          topSkips
            ? `Top filtros: ${topSkips}`
            : mlCollected === 0
              ? 'Sin candidatos ML: API bloqueada o sin resultados.'
              : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
    }
    setRunning(false);
    await load();
  };

  const runningOk = Boolean(data?.enabled && !data.paused_by_owner);
  const nameById = new Map((health?.catalog ?? []).map((c) => [c.id, c.displayName]));

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] glass-dark p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Empleado digital</p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight text-white/90">
          <BowArrow className="h-8 w-8 text-violet-300" />
          AVENTA Hunter
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/50 leading-relaxed">
          Pipeline multifuente: recolector → precio → Deal Verifier → afiliado → publicar. Un fallo de una fuente no
          apaga el cazador.
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
          <GlassCard>
            <SectionHeader title="¿Aventa está cazando?" subtitle={health?.reason ?? 'Salud multifuente'} />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <StatusBadge tone={health?.isHunting ? 'ok' : 'attention'} pulse={Boolean(health?.isHunting)}>
                {health?.isHunting ? 'SÍ' : 'NO'}
              </StatusBadge>
              <p className="text-xs text-white/45">
                Última caza con insert:{' '}
                {health?.lastInsertAt ? new Date(health.lastInsertAt).toLocaleString('es-MX') : '—'}
              </p>
            </div>
            <ul className="mt-4 space-y-2">
              {(health?.rows ?? []).map((row) => (
                <li
                  key={row.sourceId}
                  className="flex flex-col gap-1 rounded-xl bg-white/[0.03] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white/85">
                      {healthEmoji(row.displayStatus)} {nameById.get(row.sourceId) ?? row.sourceId}
                    </p>
                    <p className="text-xs text-white/40">
                      breaker {row.breakerState}
                      {row.lastErrorCode ? ` · err ${row.lastErrorCode}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                    <StatusBadge tone={healthTone(row.displayStatus)}>{row.displayStatus}</StatusBadge>
                    <span>found {row.itemsFound}</span>
                    <span>ins {row.itemsInserted}</span>
                    <span>dup {row.duplicates}</span>
                    <span>err {row.errors}</span>
                  </div>
                </li>
              ))}
              {!health?.rows?.length ? (
                <li className="text-sm text-white/40">
                  Aún no hay telemetría de fuentes (corre un ciclo o aplica la migración).
                </li>
              ) : null}
            </ul>
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Deal Verifier"
              subtitle="Evaluaciones en este proceso (proceso). Se reinicia al redeploy."
            />
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Evaluados" value={String(health?.dealVerifier?.evaluated ?? 0)} />
              <KpiCard label="Auto-approved" value={String(health?.dealVerifier?.autoApproved ?? 0)} />
              <KpiCard label="Review" value={String(health?.dealVerifier?.review ?? 0)} />
              <KpiCard label="Rejected" value={String(health?.dealVerifier?.rejected ?? 0)} />
            </div>
            {(health?.dealVerifier?.topReasons?.length ?? 0) > 0 ? (
              <ul className="mt-4 space-y-1.5">
                {health!.dealVerifier!.topReasons.map((r) => (
                  <li key={r.reason} className="text-xs text-white/50">
                    <span className="text-white/70">×{r.count}</span> {r.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-white/40">Aún sin razones registradas en este proceso.</p>
            )}
          </GlassCard>

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
            <SectionHeader title="Últimos hallazgos" subtitle="Lo que el publisher acaba de insertar" />
            {data.offers.recent.length === 0 ? (
              <p className="mt-4 text-sm text-white/40">Aún no hay ofertas del cazador.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {data.offers.recent.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5"
                  >
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
