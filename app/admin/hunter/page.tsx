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

const SOURCE_HEALTH_ORDER = [
  'ml_worker',
  'ml_api_legacy',
  'amazon_asin',
  'amazon_paapi',
  'env_urls',
] as const;

const SCHEDULER_STATE_COPY: Record<string, string> = {
  healthy: 'El hunter se está disparando dentro del intervalo esperado.',
  degraded: 'El hunter llega tarde, pero sigue llegando. Vigilar.',
  stale: 'El hunter lleva demasiado sin dispararse. Está entrando poca supply nueva.',
  down: 'El hunter no se está disparando. No está entrando supply nueva.',
  disabled: 'Todas las fuentes están desactivadas a propósito.',
};

type HunterHealthPayload = {
  isHunting: boolean;
  huntingLevel?: 'healthy' | 'degraded' | 'down';
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
  dayToDay?: {
    recommendation: string;
    sourcesHealthy: number;
    sourcesDegraded: number;
    sourcesDown: number;
    sourcesNotConfigured: number;
    sourcesConfigured: number;
    candidates: number;
    inserted: number;
    duplicates: number;
    skipped: number;
    errors: number;
    sources: Array<{
      id: string;
      displayName: string;
      configuration: 'configured' | 'not_configured' | 'disabled';
      affiliateStatus: string;
      healthStatus: string | null;
      breakerState: string | null;
      lastRunAt: string | null;
      itemsFound: number;
      itemsInserted: number;
      duplicates: number;
      skipped: number;
      errors: number;
      latencyMs: number | null;
      lastErrorCode: string | null;
    }>;
  };
  mercadoLibreQuality?: {
    apiHealth: 'healthy' | 'degraded' | 'down';
    imageQualityPct: number;
    averageValidImages: number;
    affiliateReadinessPct: number;
    urlResolutionPct: number;
    priceResolutionPct: number;
    urlsReceived: number;
    urlsResolved: number;
    apiSuccess: number;
    api401: number;
    api403: number;
    apiTimeout: number;
    htmlFallback: number;
    imagesApi: number;
    imagesFallback: number;
    imagesRejected: number;
    affiliateReady: number;
    affiliateMissing: number;
    mlPriceRequests: number;
    mlPriceResolved: number;
    mlPriceUnavailable: number;
    mlPrice401: number;
    mlPrice403: number;
    mlPrice404: number;
    mlPrice429: number;
    mlPriceTimeout: number;
    mlPriceFallback: number;
    mlPriceSourceBreakdown: Record<string, number>;
  };
  dealVerifier?: {
    evaluated: number;
    autoApproved: number;
    review: number;
    rejected: number;
    errors: number;
    topReasons: Array<{ reason: string; count: number }>;
  };
  schedulerHealth?: {
    worstState: 'healthy' | 'degraded' | 'stale' | 'down' | 'disabled';
    needsAttention: boolean;
    sources: Array<{
      sourceId: string;
      state: 'healthy' | 'degraded' | 'stale' | 'down' | 'disabled';
      lastRunAt: string | null;
      hoursSinceLastRun: number | null;
      expectedIntervalMinutes: number;
      expectedRunsPerDay: number;
      reason: string;
    }>;
  };
  pendingHealth?: {
    total: number;
    fresh: number;
    stale: number;
    expiring: number;
    expired: number;
    highQualityStale: number;
    lowQualityStale: number;
    duplicate: number;
    snoozed: number;
    needsAttention: number;
    oldestPendingHours: number | null;
    byAction: Record<'KEEP' | 'PRIORITIZE' | 'SNOOZE' | 'REVIEW' | 'REJECT', number>;
    topAttention: Array<{
      offerId: string;
      state: string;
      action: string;
      ageHours: number | null;
      score: number | null;
      reasons: string[];
    }>;
  };
  shadowCycles?: Array<{
    cycleId: string;
    startedAt: string;
    finishedAt: string;
    evaluated: number;
    autoApprove: number;
    humanReview: number;
    autoReject: number;
    autoApprovePct: number;
    humanReviewPct: number;
    autoRejectPct: number;
    autonomousPct: number;
    avgConfidence: number;
    avgScore: number | null;
    duplicatePass: number;
    duplicateFail: number;
    duplicateUnknown: number;
    imageFound: number;
    imageMissing: number;
    topReasons: Array<{ code: string; label?: string; count: number }>;
    bySource: Record<string, { evaluated: number; autoApprove: number; humanReview: number; autoReject: number }>;
    policyVersion: string;
    schemaVersion: number;
  }>;
  autonomousDecision?: {
    evaluated: number;
    autoApprove: number;
    humanReview: number;
    autoReject: number;
    autonomousPct: number;
    autoApprovePct?: number;
    humanReviewPct?: number;
    autoRejectPct?: number;
    avgConfidence?: number;
    duplicatePass?: number;
    duplicateFail?: number;
    duplicateUnknown?: number;
    imageFound?: number;
    imageMissing?: number;
    verifier?: { autoApprove: number; review: number; reject: number };
    topReasons: Array<{ reason: string; code?: string; label?: string; count: number }>;
    recent?: Array<{
      source: string;
      decision: string;
      confidence: number;
      score: number | null;
      reasons: string[];
      at: string;
    }>;
    avgScore?: number | null;
    bySource: Record<string, { evaluated: number; autoApprove: number; humanReview: number; autoReject: number }>;
    firstAt?: string | null;
    lastAt?: string | null;
    currentCycle?: {
      evaluated: number;
      autoApprovePct: number;
      humanReviewPct: number;
      autoRejectPct: number;
      autonomousPct: number;
      startedAt: string | null;
      endedAt: string | null;
    };
    lastCycle?: {
      evaluated: number;
      autoApprovePct: number;
      humanReviewPct: number;
      autoRejectPct: number;
      autonomousPct: number;
      startedAt: string | null;
      endedAt: string | null;
    };
    persistence?: 'process_memory';
  };
  hunterEnrichment?: {
    candidatesFound: number;
    enriched: number;
    imageFound: number;
    imageMissing: number;
    titleFound: number;
    priceFound: number;
    enrichmentFailed: number;
    completePct: number;
    fullyComplete?: number;
    fullyCompletePct?: number;
    persistence?: 'process_memory';
  };
  metricUniverses?: {
    sourceHealth: { persistence: string; itemsFound: string };
    hunterEnrichment: { persistence: string };
    dealVerifier: { persistence: string };
    autonomousShadow: { persistence: string };
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

  // Persistido en DB (otro isolate), no las métricas en memoria de este proceso.
  const lastShadowCycle = health?.shadowCycles?.[0] ?? null;
  const prevShadowCycle = health?.shadowCycles?.[1] ?? null;
  const pending = health?.pendingHealth ?? null;
  const scheduler = health?.schedulerHealth ?? null;
  const dayToDay = health?.dayToDay ?? null;
  const mlQuality = health?.mercadoLibreQuality ?? null;

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
          Pipeline multifuente + medición shadow de autonomía. El motor observa; no publica ni rechaza.
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
            <SectionHeader
              title="Hunting"
              subtitle={health?.reason ?? 'Salud agregada de las fuentes del cazador'}
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <StatusBadge
                tone={
                  health?.huntingLevel === 'healthy'
                    ? 'ok'
                    : health?.huntingLevel === 'degraded'
                      ? 'attention'
                      : 'attention'
                }
                pulse={health?.huntingLevel === 'healthy'}
              >
                {health?.huntingLevel === 'healthy'
                  ? 'Healthy'
                  : health?.huntingLevel === 'degraded'
                    ? 'Degraded'
                    : 'Down'}
              </StatusBadge>
              <StatusBadge tone={health?.isHunting ? 'ok' : 'neutral'}>
                {health?.isHunting ? 'Cazando' : 'Sin yield reciente'}
              </StatusBadge>
              <p className="text-xs text-white/45">
                Último insert:{' '}
                {health?.lastInsertAt ? new Date(health.lastInsertAt).toLocaleString('es-MX') : '—'}
              </p>
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Scheduler health"
              subtitle="¿Se está disparando el hunter? Es otra pregunta que si la fuente respondió bien la última vez."
            />
            {scheduler ? (
              <>
                <p className="mt-3 text-sm text-white/80">
                  {SCHEDULER_STATE_COPY[scheduler.worstState]}
                </p>
                <ul className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3">
                  {scheduler.sources.map((row) => (
                    <li key={row.sourceId} className="text-xs text-white/50">
                      <span className="font-mono text-white/80">{row.sourceId}</span>{' '}
                      <span
                        className={
                          row.state === 'healthy'
                            ? 'text-emerald-300/80'
                            : row.state === 'disabled'
                              ? 'text-white/35'
                              : row.state === 'degraded'
                                ? 'text-amber-300/80'
                                : 'text-rose-300/80'
                        }
                      >
                        {row.state}
                      </span>
                      {row.hoursSinceLastRun == null
                        ? ' · nunca corrió'
                        : ` · hace ${row.hoursSinceLastRun} h`}
                      <span className="text-white/35">
                        {' '}
                        — {row.reason} (esperado cada {row.expectedIntervalMinutes} min ≈{' '}
                        {row.expectedRunsPerDay}/día)
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-white/35">
                  Las tolerancias son múltiplos del intervalo que promete cada fuente, no minutos
                  fijos. Un cron puede llegar tarde; lo que importa es que deje de llegar.
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin datos de scheduler.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Pending health"
              subtitle="Clasificación derivada de la cola pending. Recomendación, no acción: nada se ejecuta solo."
            />
            {pending ? (
              <>
                <p className="mt-3 text-sm text-white/80">
                  {pending.needsAttention === 0
                    ? `Todo bien. ${pending.total} pending en cola, ninguna requiere atención.`
                    : `Revisar ${pending.needsAttention} ${pending.needsAttention === 1 ? 'oferta' : 'ofertas'} de ${pending.total} pending.`}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                  <KpiCard label="Total pending" value={String(pending.total)} />
                  <KpiCard label="Fresh" value={String(pending.fresh)} />
                  <KpiCard label="Stale" value={String(pending.stale)} />
                  <KpiCard label="Por caducar" value={String(pending.expiring)} />
                  <KpiCard label="Caducadas" value={String(pending.expired)} />
                  <KpiCard label="Duplicadas" value={String(pending.duplicate)} />
                  <KpiCard label="Pospuestas" value={String(pending.snoozed)} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard label="Stale buenas" value={String(pending.highQualityStale)} />
                  <KpiCard label="Stale flojas" value={String(pending.lowQualityStale)} />
                  <KpiCard label="Priorizar" value={String(pending.byAction?.PRIORITIZE ?? 0)} />
                  <KpiCard label="Revisar" value={String(pending.byAction?.REVIEW ?? 0)} />
                </div>
                {pending.topAttention.length > 0 ? (
                  <ul className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3">
                    {pending.topAttention.map((row) => (
                      <li key={row.offerId} className="text-xs text-white/50">
                        <a
                          href={`/admin/moderation?focus=${row.offerId}`}
                          className="text-white/80 underline decoration-white/20 underline-offset-2 hover:text-white"
                        >
                          {row.action}
                        </a>{' '}
                        <span className="font-mono text-white/65">{row.state}</span>
                        {row.ageHours != null ? ` · ${row.ageHours} h` : ''}
                        {row.score != null ? ` · score ${row.score}` : ''}
                        {row.reasons.length > 0 ? (
                          <span className="text-white/35"> — {row.reasons.join(' · ')}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 text-xs text-white/35">
                  La más antigua lleva{' '}
                  {pending.oldestPendingHours == null ? '—' : `${pending.oldestPendingHours} h`} en cola.
                  Stale = {'>'} 72 h sin moderar. Abre cualquiera en Focus con el enlace de su acción.
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin datos de cola pending.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Shadow cycle (persistido)"
              subtitle="Último ciclo del worker guardado en hunter_shadow_cycles. NO es realtime: es una foto del ciclo ya cerrado."
            />
            {lastShadowCycle ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <KpiCard label="Evaluados" value={String(lastShadowCycle.evaluated)} />
                  <KpiCard label="Auto approve %" value={`${lastShadowCycle.autoApprovePct}%`} />
                  <KpiCard label="Human review %" value={`${lastShadowCycle.humanReviewPct}%`} />
                  <KpiCard label="Auto reject %" value={`${lastShadowCycle.autoRejectPct}%`} />
                  <KpiCard label="Autonomous %" value={`${lastShadowCycle.autonomousPct}%`} />
                  <KpiCard
                    label="Score promedio"
                    value={lastShadowCycle.avgScore == null ? '—' : String(lastShadowCycle.avgScore)}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
                  <KpiCard label="dup pass" value={String(lastShadowCycle.duplicatePass)} />
                  <KpiCard label="dup fail" value={String(lastShadowCycle.duplicateFail)} />
                  <KpiCard label="dup unknown" value={String(lastShadowCycle.duplicateUnknown)} />
                  <KpiCard label="imagen ok" value={String(lastShadowCycle.imageFound)} />
                  <KpiCard label="imagen missing" value={String(lastShadowCycle.imageMissing)} />
                </div>
                <p className="mt-3 text-xs text-white/35">
                  Cerrado:{' '}
                  {lastShadowCycle.finishedAt
                    ? new Date(lastShadowCycle.finishedAt).toLocaleString('es-MX')
                    : '—'}
                  {' · policy '}
                  <span className="font-mono">{lastShadowCycle.policyVersion}</span>
                  {' · schema v'}
                  {lastShadowCycle.schemaVersion}
                </p>
                <p className="mt-1 text-xs text-white/35">
                  {prevShadowCycle
                    ? `Ciclo previo: ${prevShadowCycle.evaluated} eval, autónomo ${prevShadowCycle.autonomousPct}% (${
                        prevShadowCycle.finishedAt
                          ? new Date(prevShadowCycle.finishedAt).toLocaleString('es-MX')
                          : '—'
                      })`
                    : 'Ciclo previo: aún no hay un segundo ciclo persistido.'}
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">
                Sin ciclos persistidos. Se escribe uno al cerrar cada corrida con candidatos evaluados;
                si la tabla hunter_shadow_cycles no existe todavía, aplica la migración.
              </p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Shadow Autonomy (este isolate)"
              subtitle="AUTO_APPROVE = podrían publicarse solos. Autonomous % = AUTO_APPROVE + AUTO_REJECT. No publica. Memoria de ESTE isolate — en Vercel no es el batch de ml_worker (eso vive en hunter_source_health)."
            />
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Evaluados" value={String(health?.autonomousDecision?.evaluated ?? 0)} />
              <KpiCard
                label="Auto approve %"
                value={`${health?.autonomousDecision?.autoApprovePct ?? 0}%`}
              />
              <KpiCard
                label="Human review %"
                value={`${health?.autonomousDecision?.humanReviewPct ?? 0}%`}
              />
              <KpiCard
                label="Auto reject %"
                value={`${health?.autonomousDecision?.autoRejectPct ?? 0}%`}
              />
              <KpiCard
                label="Autonomous %"
                value={`${health?.autonomousDecision?.autonomousPct ?? 0}%`}
              />
              <KpiCard
                label="Confidence promedio"
                value={String(health?.autonomousDecision?.avgConfidence ?? 0)}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                label="Score promedio"
                value={
                  health?.autonomousDecision?.avgScore == null
                    ? '—'
                    : String(health.autonomousDecision.avgScore)
                }
              />
              <KpiCard
                label="Ciclo actual eval"
                value={String(health?.autonomousDecision?.currentCycle?.evaluated ?? 0)}
              />
              <KpiCard
                label="Ciclo actual autónomo"
                value={`${health?.autonomousDecision?.currentCycle?.autonomousPct ?? 0}%`}
              />
              <KpiCard
                label="Ciclo previo autónomo"
                value={`${health?.autonomousDecision?.lastCycle?.autonomousPct ?? 0}%`}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="AUTO_APPROVE" value={String(health?.autonomousDecision?.autoApprove ?? 0)} />
              <KpiCard label="HUMAN_REVIEW" value={String(health?.autonomousDecision?.humanReview ?? 0)} />
              <KpiCard label="AUTO_REJECT" value={String(health?.autonomousDecision?.autoReject ?? 0)} />
              <KpiCard
                label="Verifier auto"
                value={String(health?.autonomousDecision?.verifier?.autoApprove ?? health?.dealVerifier?.autoApproved ?? 0)}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
              <KpiCard label="dup pass" value={String(health?.autonomousDecision?.duplicatePass ?? 0)} />
              <KpiCard label="dup fail" value={String(health?.autonomousDecision?.duplicateFail ?? 0)} />
              <KpiCard label="dup unknown" value={String(health?.autonomousDecision?.duplicateUnknown ?? 0)} />
              <KpiCard label="imagen ok" value={String(health?.autonomousDecision?.imageFound ?? 0)} />
              <KpiCard label="imagen missing" value={String(health?.autonomousDecision?.imageMissing ?? 0)} />
            </div>
            <p className="mt-3 text-xs text-white/35">
              Found (DB) ≠ Evaluados shadow (este isolate). Autonomous % = AUTO_APPROVE + AUTO_REJECT.
              Primera/última decisión:{' '}
              {health?.autonomousDecision?.firstAt
                ? new Date(health.autonomousDecision.firstAt).toLocaleString('es-MX')
                : '—'}
              {' → '}
              {health?.autonomousDecision?.lastAt
                ? new Date(health.autonomousDecision.lastAt).toLocaleString('es-MX')
                : '—'}
              {health?.autonomousDecision?.currentCycle?.evaluated
                ? ` · Ciclo actual: ${health.autonomousDecision.currentCycle.evaluated} eval, autónomo ${health.autonomousDecision.currentCycle.autonomousPct}%`
                : ''}
              {health?.autonomousDecision?.lastCycle?.evaluated
                ? ` · Ciclo previo: ${health.autonomousDecision.lastCycle.evaluated} eval, autónomo ${health.autonomousDecision.lastCycle.autonomousPct}%`
                : ''}
            </p>
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Bottlenecks"
              subtitle="Causas agrupadas de HUMAN_REVIEW. Códigos estables. No cambia publicación."
            />
            {(health?.autonomousDecision?.topReasons?.length ?? 0) > 0 ? (
              <ul className="mt-4 space-y-1.5">
                {health!.autonomousDecision!.topReasons.map((r) => (
                  <li key={r.code ?? r.reason} className="text-xs text-white/50">
                    <span className="text-white/70">×{r.count}</span>{' '}
                    <span className="font-mono text-white/65">{r.code ?? r.reason}</span>
                    {r.label ? <span className="text-white/40"> — {r.label}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-white/40">
                Aún sin HUMAN_REVIEW en este proceso. Corre un ciclo para observar.
              </p>
            )}
            {(health?.autonomousDecision?.recent?.length ?? 0) > 0 ? (
              <ul className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3">
                {health!.autonomousDecision!.recent!.slice(-8).reverse().map((row, i) => (
                  <li key={`${row.at}-${i}`} className="text-xs text-white/45">
                    <span className="text-white/70">{row.decision}</span>
                    {' · '}
                    {row.source}
                    {' · c '}
                    {row.confidence}
                    {row.score != null ? ` · s ${row.score}` : ''}
                    {row.reasons.length > 0 ? ` · ${row.reasons.join(', ')}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </GlassCard>

          <GlassCard>
            <SectionHeader title="Shadow by source" subtitle="Decisiones shadow agrupadas por fuente Hunter" />
            <ul className="mt-4 space-y-2">
              {SOURCE_HEALTH_ORDER.map((sourceId) => {
                const row = health?.autonomousDecision?.bySource?.[sourceId];
                return (
                  <li
                    key={sourceId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-white/50"
                  >
                    <span className="text-white/80">{nameById.get(sourceId) ?? sourceId}</span>
                    <span>
                      eval {row?.evaluated ?? 0} · AA {row?.autoApprove ?? 0} · HR {row?.humanReview ?? 0} · AR{' '}
                      {row?.autoReject ?? 0}
                    </span>
                  </li>
                );
              })}
            </ul>
          </GlassCard>

          <GlassCard>
            <SectionHeader title="Source Health" subtitle="Último batch persistido en hunter_source_health. found = payload crudo, no Shadow evaluated." />
            <ul className="mt-4 space-y-2">
              {SOURCE_HEALTH_ORDER.map((sourceId) => {
                const row = (health?.rows ?? []).find((r) => r.sourceId === sourceId);
                const status = row?.displayStatus ?? 'disabled';
                return (
                  <li
                    key={sourceId}
                    className="flex flex-col gap-1 rounded-xl bg-white/[0.03] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white/85">
                        {healthEmoji(status)} {nameById.get(sourceId) ?? sourceId}
                      </p>
                      <p className="text-xs text-white/40">
                        {sourceId}
                        {row ? ` · breaker ${row.breakerState}` : ' · sin telemetría'}
                        {row?.lastErrorCode ? ` · err ${row.lastErrorCode}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                      <StatusBadge tone={healthTone(status)}>{status}</StatusBadge>
                      <span>found {row?.itemsFound ?? 0}</span>
                      <span>ins {row?.itemsInserted ?? 0}</span>
                      <span>dup {row?.duplicates ?? 0}</span>
                      <span>err {row?.errors ?? 0}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Mercado Libre quality"
              subtitle="Resolución de URL, API como fuente principal e imágenes oficiales del item. Universo separado de shadow."
            />
            {mlQuality ? (
              <>
                <div className="mt-3 flex flex-wrap gap-3">
                  <KpiCard label="API" value={mlQuality.apiHealth.toUpperCase()} />
                  <KpiCard label="URL resueltas" value={`${mlQuality.urlResolutionPct}%`} />
                  <KpiCard label="Imágenes" value={`${mlQuality.imageQualityPct}%`} />
                  <KpiCard label="Precio" value={`${mlQuality.priceResolutionPct}%`} />
                  <KpiCard label="Affiliate ready" value={`${mlQuality.affiliateReadinessPct}%`} />
                  <KpiCard label="Prom. fotos" value={String(mlQuality.averageValidImages)} />
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/45">
                  <span>urls {mlQuality.urlsReceived}</span>
                  <span>resolved {mlQuality.urlsResolved}</span>
                  <span>api ok {mlQuality.apiSuccess}</span>
                  <span>401 {mlQuality.api401}</span>
                  <span>403 {mlQuality.api403}</span>
                  <span>timeout {mlQuality.apiTimeout}</span>
                  <span>html fb {mlQuality.htmlFallback}</span>
                  <span>img api {mlQuality.imagesApi}</span>
                  <span>img fb {mlQuality.imagesFallback}</span>
                  <span>rejected {mlQuality.imagesRejected}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/45">
                  <span>price req {mlQuality.mlPriceRequests}</span>
                  <span>price ok {mlQuality.mlPriceResolved}</span>
                  <span>price miss {mlQuality.mlPriceUnavailable}</span>
                  <span>price 403 {mlQuality.mlPrice403}</span>
                  <span>price fb {mlQuality.mlPriceFallback}</span>
                  {Object.entries(mlQuality.mlPriceSourceBreakdown ?? {}).map(([src, n]) => (
                    <span key={src}>
                      {src} {n}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin datos ML quality en este isolate.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Day-to-Day supply"
              subtitle="Retailers sin afiliado requerido. Not configured no es DOWN: no hay método de discovery usable todavía."
            />
            {dayToDay ? (
              <>
                <p className="mt-3 text-sm text-white/80">{dayToDay.recommendation}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/45">
                  <span>candidatos {dayToDay.candidates}</span>
                  <span>nuevas {dayToDay.inserted}</span>
                  <span>dup {dayToDay.duplicates}</span>
                  <span>skip {dayToDay.skipped}</span>
                  <span>err {dayToDay.errors}</span>
                  <span>sin config {dayToDay.sourcesNotConfigured}</span>
                </div>
                <ul className="mt-4 space-y-2">
                  {dayToDay.sources.map((src) => (
                    <li
                      key={src.id}
                      className="flex flex-col gap-1 rounded-xl bg-white/[0.03] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm text-white/85">{src.displayName}</p>
                        <p className="text-xs text-white/40">
                          {src.id}
                          {src.breakerState ? ` · breaker ${src.breakerState}` : ''}
                          {src.lastErrorCode ? ` · ${src.lastErrorCode}` : ''}
                          {src.lastRunAt
                            ? ` · última ${new Date(src.lastRunAt).toLocaleString('es-MX')}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                        <StatusBadge
                          tone={src.configuration === 'not_configured' ? 'neutral' : 'attention'}
                        >
                          {src.configuration === 'not_configured'
                            ? 'NOT CONFIGURED'
                            : src.configuration.toUpperCase()}
                        </StatusBadge>
                        <span>monetización {src.affiliateStatus}</span>
                        <span>found {src.itemsFound}</span>
                        <span>ins {src.itemsInserted}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin datos Day-to-Day.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Enrichment"
              subtitle="Completitud del snapshot. Mismo isolate que ingest — 0 en este panel es esperado si ml_worker corrió en otra función serverless."
            />
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Candidatos" value={String(health?.hunterEnrichment?.candidatesFound ?? 0)} />
              <KpiCard label="Con imagen" value={String(health?.hunterEnrichment?.imageFound ?? 0)} />
              <KpiCard label="Sin imagen" value={String(health?.hunterEnrichment?.imageMissing ?? 0)} />
              <KpiCard
                label="% imagen"
                value={`${health?.hunterEnrichment?.completePct ?? 0}%`}
              />
              <KpiCard label="Enriquecidos" value={String(health?.hunterEnrichment?.enriched ?? 0)} />
              <KpiCard label="Fallos" value={String(health?.hunterEnrichment?.enrichmentFailed ?? 0)} />
              <KpiCard
                label="% completos"
                value={`${health?.hunterEnrichment?.fullyCompletePct ?? 0}%`}
              />
              <KpiCard label="Con título" value={String(health?.hunterEnrichment?.titleFound ?? 0)} />
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Deal Verifier"
              subtitle="Decisión productiva del verifier (no es el motor shadow). Memoria de proceso."
            />
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Evaluados" value={String(health?.dealVerifier?.evaluated ?? 0)} />
              <KpiCard label="Auto-approved" value={String(health?.dealVerifier?.autoApproved ?? 0)} />
              <KpiCard label="Review" value={String(health?.dealVerifier?.review ?? 0)} />
              <KpiCard label="Rejected" value={String(health?.dealVerifier?.rejected ?? 0)} />
            </div>
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
