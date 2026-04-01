'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bot, CheckCircle2, ExternalLink, AlertTriangle } from 'lucide-react';

type BotStatusPayload = {
  enabled: boolean;
  env_ingest_enabled?: boolean;
  paused_by_owner?: boolean;
  cron: { path: string; schedule: string; runs_per_day_estimate?: number; deployment_note?: string };
  config: {
    bot_user_id_configured: boolean;
    profile?: 'standard' | 'mega';
    timezone?: string;
    normal_max_range?: [number, number];
    boost_max_offers?: number;
    morning_sustained?: boolean;
    morning_hour_start?: number;
    morning_hour_end_exclusive?: number;
    morning_max_per_run?: [number, number];
    daily_max?: number;
    candidate_pool_max?: number;
    auto_approve_enabled?: boolean;
    auto_approve_min_score?: number;
    reject_below_score?: number;
    min_discount_percent: number;
    category: string | null;
    urls_count: number;
    sample_urls: string[];
    discover_ml?: boolean;
    ml_queries_count?: number;
    ml_categories_count?: number;
    ml_use_default_queries?: boolean;
    ml_min_sold?: number;
    ml_fetch_reviews?: boolean;
    min_rating?: number;
    tech_categories_count?: number;
    amazon_asins_count?: number;
    amazon_source?: 'scrape' | 'paapi';
    amazon_paapi_enabled?: boolean;
    keepa_enabled?: boolean;
    has_ingest_sources?: boolean;
  };
  capacity: {
    estimated_inserted_ceiling_per_day?: number;
    inserted_today_approx?: number | null;
    note: string;
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
  env_required: string[];
  env_status: Record<string, boolean>;
  env_missing: string[];
};

export default function BotIngestPanel() {
  const [data, setData] = useState<BotStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runNowLoading, setRunNowLoading] = useState(false);
  const [runNowMsg, setRunNowMsg] = useState<string | null>(null);
  const [runNowSkipBreakdown, setRunNowSkipBreakdown] = useState<Array<{ reason: string; count: number }> | null>(
    null
  );
  const [runNowSourceStats, setRunNowSourceStats] = useState<
    Array<{ source: string; collected: number; evaluated: number; inserted: number; duplicate: number; skipped: number; errors: number }>
    | null
  >(null);
  const [pauseToggleSaving, setPauseToggleSaving] = useState(false);
  const [pauseToggleError, setPauseToggleError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
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
    const body = (await res.json().catch(() => ({}))) as BotStatusPayload & { error?: string };
    if (!res.ok) {
      setError(typeof body.error === 'string' ? body.error : 'No se pudo cargar estado del bot');
      setLoading(false);
      return;
    }
    setData(body);
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        await loadStatus();
      } catch {
        if (!cancel) {
          setError('Error de red al cargar bot');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [loadStatus]);

  return (
    <section className="rounded-[28px] border border-gray-200/70 dark:border-gray-800 bg-white dark:bg-[#1C1C1E] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400 mb-2">
          Operaciones
        </p>
        <h2 className="font-semibold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Bot className="h-5 w-5 text-violet-500" />
          Bot de ingesta (motor v3)
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          Score, filtros de calidad, auto-aprobación de ofertas top y tope diario. Automatización: Pro/cron externo
          cada ~15 min o «Ejecutar ahora» (Vercel Hobby no permite ese intervalo en vercel.json).
        </p>
      </div>

      {loading ? <p className="text-sm text-gray-500 dark:text-gray-400">Cargando bot…</p> : null}
      {!loading && error ? <p className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}

      {!loading && !error && data ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-violet-200/70 dark:border-violet-900/40 bg-violet-50/70 dark:bg-violet-950/20 px-4 py-4">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                checked={!data.paused_by_owner}
                disabled={pauseToggleSaving}
                onChange={async (e) => {
                  const allowRun = e.target.checked;
                  setPauseToggleError(null);
                  setPauseToggleSaving(true);
                  try {
                    const supabase = createClient();
                    const {
                      data: { session },
                    } = await supabase.auth.getSession();
                    if (!session?.access_token) {
                      setPauseToggleError('Sin sesión');
                      return;
                    }
                    const res = await fetch('/api/admin/app-config', {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({
                        key: 'bot_ingest_paused',
                        value: !allowRun,
                      }),
                    });
                    if (!res.ok) {
                      const j = await res.json().catch(() => ({}));
                      setPauseToggleError(typeof j?.error === 'string' ? j.error : 'No se pudo guardar');
                      return;
                    }
                    await loadStatus();
                  } catch {
                    setPauseToggleError('Error de red al guardar');
                  } finally {
                    setPauseToggleSaving(false);
                  }
                }}
              />
              <span className="text-sm text-gray-800 dark:text-gray-200">
                <span className="font-medium">Permitir ejecución del bot</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Si lo desmarcas, el cron y &quot;Ejecutar ahora&quot; no procesan ofertas aunque{' '}
                  <code className="text-[11px]">BOT_INGEST_ENABLED=1</code> en Vercel. Útil hasta que quieras prender
                  ingesta (p. ej. cuando ya tengas publicidad).
                </span>
              </span>
            </label>
            {pauseToggleError ? (
              <p className="mt-2 text-xs text-red-600 dark:text-red-300">{pauseToggleError}</p>
            ) : null}
          </div>

          <div className="rounded-3xl bg-[#F5F5F7] dark:bg-[#111113] p-4">
            <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={runNowLoading}
              onClick={async () => {
                setRunNowLoading(true);
                setRunNowMsg(null);
                setRunNowSkipBreakdown(null);
                setRunNowSourceStats(null);
                try {
                  const supabase = createClient();
                  const {
                    data: { session },
                  } = await supabase.auth.getSession();
                  if (!session?.access_token) {
                    setRunNowMsg('Sin sesión para ejecutar');
                    return;
                  }
                  const res = await fetch('/api/admin/bot-ingest-run-now', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${session.access_token}` },
                  });
                  const body = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setRunNowMsg(typeof body?.error === 'string' ? body.error : 'Falló ejecución manual');
                    return;
                  }
                  if (body?.pausedByOwner) {
                    setRunNowMsg('Bot pausado desde Trabajo: no se procesó nada.');
                    return;
                  }
                  setRunNowMsg(
                    `Corrida (${body?.runMode ?? '?'}): inserted=${body?.summary?.inserted ?? 0}, auto=${body?.summary?.autoApproved ?? 0}, dup=${body?.summary?.duplicate ?? 0}, skip=${body?.summary?.skipped ?? 0}, err=${body?.summary?.errors ?? 0}`
                  );
                  const fromSummary = body?.summary?.skipReasonCounts as Record<string, number> | undefined;
                  if (fromSummary && typeof fromSummary === 'object') {
                    const rows = Object.entries(fromSummary)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 14)
                      .map(([reason, count]) => ({ reason, count }));
                    if (rows.length > 0) setRunNowSkipBreakdown(rows);
                  } else if (Array.isArray(body?.results)) {
                    const map = new Map<string, number>();
                    for (const r of body.results as { status?: string; reason?: string }[]) {
                      if (r?.status === 'skipped' && typeof r?.reason === 'string') {
                        map.set(r.reason, (map.get(r.reason) ?? 0) + 1);
                      }
                    }
                    const rows = [...map.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 14)
                      .map(([reason, count]) => ({ reason, count }));
                    if (rows.length > 0) setRunNowSkipBreakdown(rows);
                  }
                  const sourceStats = body?.summary?.sourceStats as
                    | Record<string, { collected?: number; evaluated?: number; inserted?: number; duplicate?: number; skipped?: number; errors?: number }>
                    | undefined;
                  if (sourceStats && typeof sourceStats === 'object') {
                    const rows = Object.entries(sourceStats)
                      .map(([source, stats]) => ({
                        source,
                        collected: stats?.collected ?? 0,
                        evaluated: stats?.evaluated ?? 0,
                        inserted: stats?.inserted ?? 0,
                        duplicate: stats?.duplicate ?? 0,
                        skipped: stats?.skipped ?? 0,
                        errors: stats?.errors ?? 0,
                      }))
                      .filter((row) => row.collected > 0 || row.evaluated > 0)
                      .sort((a, b) => b.evaluated - a.evaluated);
                    if (rows.length > 0) setRunNowSourceStats(rows);
                  }
                } catch {
                  setRunNowMsg('Error de red al ejecutar bot');
                } finally {
                  setRunNowLoading(false);
                }
              }}
              className="inline-flex items-center gap-1 rounded-full bg-violet-600 text-white px-4 py-2 text-xs font-semibold transition-transform active:scale-95 hover:bg-violet-700 disabled:opacity-50"
            >
              {runNowLoading ? 'Ejecutando…' : 'Ejecutar ahora'}
            </button>
            <div className="flex flex-col gap-1 min-w-0 max-w-full">
              {runNowMsg ? <span className="text-xs text-gray-600 dark:text-gray-300">{runNowMsg}</span> : null}
              {runNowSkipBreakdown && runNowSkipBreakdown.length > 0 ? (
                <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/25 px-3 py-2">
                  <p className="text-[11px] font-medium text-amber-900 dark:text-amber-100">
                    Motivos de “skipped” (ajusta variables en Vercel según lo que más salga):
                  </p>
                  <ul className="mt-1.5 text-[11px] text-amber-950/85 dark:text-amber-100/90 list-disc pl-4 space-y-0.5">
                    {runNowSkipBreakdown.map(({ reason, count }) => (
                      <li key={reason}>
                        <strong>{count}×</strong> {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {runNowSourceStats && runNowSourceStats.length > 0 ? (
                <div className="rounded-2xl border border-sky-200/80 dark:border-sky-900/50 bg-sky-50/60 dark:bg-sky-950/25 px-3 py-2">
                  <p className="text-[11px] font-medium text-sky-900 dark:text-sky-100">
                    Salud por fuente en esta corrida:
                  </p>
                  <ul className="mt-1.5 text-[11px] text-sky-950/85 dark:text-sky-100/90 list-disc pl-4 space-y-0.5">
                    {runNowSourceStats.map((row) => (
                      <li key={row.source}>
                        <strong>{row.source}</strong> · collected={row.collected}, eval={row.evaluated}, inserted=
                        {row.inserted}, dup={row.duplicate}, skip={row.skipped}, err={row.errors}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                data.enabled
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                  : data.paused_by_owner
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                    : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
              }`}
            >
              {data.enabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {data.enabled
                ? 'Ejecución permitida'
                : data.paused_by_owner
                  ? 'Pausado (Trabajo)'
                  : data.env_ingest_enabled === false
                    ? 'Off en Vercel'
                    : 'No listo'}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              Objetivo si automatizas: {data.cron.schedule}
              {typeof data.cron.runs_per_day_estimate === 'number'
                ? ` (~${data.cron.runs_per_day_estimate} disparos/día)`
                : null}
            </span>
          </div>
          {data.cron.deployment_note ? (
            <p className="text-xs text-amber-800 dark:text-amber-200/90 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3">
              {data.cron.deployment_note}
            </p>
          ) : null}

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <p className="rounded-2xl border border-gray-200/70 dark:border-gray-800 px-4 py-3 bg-white dark:bg-[#151517]">
              <span className="text-gray-500 dark:text-gray-400">`BOT_INGEST_USER_ID`:</span>{' '}
              <strong className={data.config.bot_user_id_configured ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}>
                {data.config.bot_user_id_configured ? 'configurado' : 'faltante'}
              </strong>
            </p>
            <p className="rounded-2xl border border-gray-200/70 dark:border-gray-800 px-4 py-3 bg-white dark:bg-[#151517]">
              <span className="text-gray-500 dark:text-gray-400">Tope diario (env):</span>{' '}
              <strong>{data.config.daily_max ?? '—'}</strong>
              {typeof data.capacity.inserted_today_approx === 'number' ? (
                <span className="text-gray-500 dark:text-gray-400">
                  {' '}
                  · hoy ~{data.capacity.inserted_today_approx}
                </span>
              ) : null}
            </p>
            <p className="rounded-2xl border border-gray-200/70 dark:border-gray-800 px-4 py-3 bg-white dark:bg-[#151517]">
              <span className="text-gray-500 dark:text-gray-400">Por corrida (normal):</span>{' '}
              <strong>
                {data.config.normal_max_range
                  ? `${data.config.normal_max_range[0]}–${data.config.normal_max_range[1]}`
                  : '—'}
              </strong>
              {typeof data.config.boost_max_offers === 'number' ? (
                <span className="text-gray-500 dark:text-gray-400"> · boost legacy (1×/día): {data.config.boost_max_offers}</span>
              ) : null}
              {data.config.morning_sustained ? (
                <span className="text-gray-500 dark:text-gray-400">
                  {' '}
                  · mañana sostenida {data.config.morning_hour_start ?? '?'}-{Number(data.config.morning_hour_end_exclusive ?? 11) - 1}:59h ·{' '}
                  {data.config.morning_max_per_run
                    ? `${data.config.morning_max_per_run[0]}–${data.config.morning_max_per_run[1]}/corrida`
                    : '2–5/corrida'}
                </span>
              ) : null}
            </p>
            <p className="rounded-2xl border border-gray-200/70 dark:border-gray-800 px-4 py-3 bg-white dark:bg-[#151517]">
              <span className="text-gray-500 dark:text-gray-400">Perfil:</span>{' '}
              <strong>{data.config.profile ?? 'standard'}</strong>
            </p>
            <p className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <span className="text-gray-500 dark:text-gray-400">URLs fuente:</span> {data.config.urls_count}
            </p>
            {typeof data.config.discover_ml === 'boolean' ? (
              <p className="rounded-2xl border border-gray-200/70 dark:border-gray-800 px-4 py-3 sm:col-span-2 bg-white dark:bg-[#151517]">
                <span className="text-gray-500 dark:text-gray-400">Descubrimiento ML (API):</span>{' '}
                <strong>{data.config.discover_ml ? 'activo' : 'off'}</strong>
                {data.config.discover_ml ? (
                  <span className="text-gray-500 dark:text-gray-400">
                    {' '}
                    · queries {data.config.ml_queries_count ?? 0} · categorías {data.config.ml_categories_count ?? 0}
                    {data.config.ml_use_default_queries ? ' · defaults si vacío' : ''}
                    {typeof data.config.ml_min_sold === 'number' ? ` · vendidos ≥${data.config.ml_min_sold}` : ''}
                    {data.config.ml_fetch_reviews ? ' · reseñas ML' : ''}
                  </span>
                ) : null}
              </p>
            ) : null}
            {typeof data.config.auto_approve_min_score === 'number' ? (
              <p className="rounded-2xl border border-gray-200/70 dark:border-gray-800 px-4 py-3 sm:col-span-2 bg-white dark:bg-[#151517]">
                <span className="text-gray-500 dark:text-gray-400">Score:</span>{' '}
                {data.config.auto_approve_enabled === false ? (
                  <strong className="text-amber-700 dark:text-amber-300">solo moderación</strong>
                ) : (
                  <>
                    auto ≥ <strong>{data.config.auto_approve_min_score}</strong>
                  </>
                )}
                {typeof data.config.reject_below_score === 'number' ? (
                  <span className="text-gray-500 dark:text-gray-400"> · descartar &lt; {data.config.reject_below_score}</span>
                ) : null}
                {typeof data.config.candidate_pool_max === 'number' ? (
                  <span className="text-gray-500 dark:text-gray-400"> · pool/corrida {data.config.candidate_pool_max}</span>
                ) : null}
              </p>
            ) : null}
            {typeof data.config.amazon_asins_count === 'number' ? (
              <p className="rounded-2xl border border-gray-200/70 dark:border-gray-800 px-4 py-3 bg-white dark:bg-[#151517]">
                <span className="text-gray-500 dark:text-gray-400">ASINs Amazon (pool):</span>{' '}
                <strong>{data.config.amazon_asins_count}</strong>
                <span className="text-gray-500 dark:text-gray-400">
                  {' '}
                  · fuente {data.config.amazon_source ?? 'scrape'}
                  {data.config.amazon_paapi_enabled ? ' · PA-API on' : ''}
                  {data.config.keepa_enabled ? ' · Keepa on' : ''}
                </span>
              </p>
            ) : null}
            {data.config.has_ingest_sources === false ? (
              <p className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 sm:col-span-2 text-amber-900 dark:text-amber-100 text-xs">
                No hay fuentes de ingesta: define URLs, <code className="text-[11px]">BOT_INGEST_DISCOVER_ML=1</code> o{' '}
                <code className="text-[11px]">BOT_INGEST_AMAZON_ASINS</code>.
              </p>
            ) : null}
          </div>

          {typeof data.capacity.estimated_inserted_ceiling_per_day === 'number' ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Techo orientativo de inserciones/día (antes del tope y calidad real):{' '}
              <strong>{data.capacity.estimated_inserted_ceiling_per_day}</strong>
            </p>
          ) : null}
          <p className="text-xs text-gray-500 dark:text-gray-400">{data.capacity.note}</p>
          {data.offers.pending_count != null ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Pendientes del bot en moderación: <strong>{data.offers.pending_count}</strong>
            </p>
          ) : null}

          {data.offers.recent.length > 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Últimas ofertas creadas por el bot</p>
              <ul className="space-y-1">
                {data.offers.recent.map((o) => (
                  <li key={o.id} className="text-xs flex items-center justify-between gap-2">
                    <span className="truncate text-gray-700 dark:text-gray-300">
                      {o.title}
                    </span>
                    <span className="shrink-0 text-gray-500 dark:text-gray-400">
                      {o.status} · ${Number(o.price).toLocaleString('es-MX')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-2">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Variables de entorno del bot</p>
            <ul className="space-y-1 text-xs">
              {data.env_required.map((key) => (
                <li key={key} className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      data.env_status[key] ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                  />
                  <code className="text-[11px]">{key}</code>
                  <span className="text-gray-500 dark:text-gray-400">
                    {data.env_status[key] ? 'ok' : 'faltante'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
              `BOT_INGEST_URLS` es opcional si usas descubrimiento ML o ASINs. Varias URLs en una sola variable (líneas o comas).
            </p>
            {data.env_missing.length > 0 ? (
              <p className="mt-2 text-[11px] text-red-600 dark:text-red-300">
                Pendiente: {data.env_missing.join(' · ')}
              </p>
            ) : null}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Endpoint cron: <code className="text-[11px]">{data.cron.path}</code> (protegido por <code className="text-[11px]">CRON_SECRET</code>)
          </p>
          <a
            href="https://vercel.com/docs/cron-jobs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
          >
            Docs de cron en Vercel
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}
    </section>
  );
}
