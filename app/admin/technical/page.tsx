'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Check, Copy, Database, RefreshCw, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type BotStatus = {
  enabled: boolean;
  env_ingest_enabled?: boolean;
  paused_by_owner?: boolean;
  cron: { schedule: string; deployment_note?: string };
  config: {
    profile?: string;
    bot_user_id_configured: boolean;
    daily_max?: number;
    normal_max_range?: [number, number];
    auto_approve_enabled?: boolean;
    auto_approve_min_score?: number;
    urls_count: number;
    discover_ml?: boolean;
    amazon_asins_count?: number;
    amazon_source?: string;
    amazon_paapi_enabled?: boolean;
    keepa_enabled?: boolean;
    has_ingest_sources?: boolean;
  };
  capacity: {
    inserted_today_approx?: number | null;
    note: string;
  };
  env_required: string[];
  env_status: Record<string, boolean>;
  env_missing: string[];
};

type IntegrityResult = {
  ok: boolean;
  finishedAt: string;
  summary: { total: number; failed: number; passed: number };
  checks: Array<{ name: string; ok: boolean; detail: string }>;
};

export default function TechnicalPage() {
  const [botData, setBotData] = useState<BotStatus | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [botRes, intRes] = await Promise.all([
        fetch('/api/admin/bot-ingest-status', { headers }),
        fetch('/api/admin/system-integrity', { headers }),
      ]);

      const botJson = botRes.ok ? await botRes.json().catch(() => null) : null;
      const intJson = intRes.ok ? await intRes.json().catch(() => null) : null;
      setBotData(botJson);
      setIntegrity(intJson?.result ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const report = useMemo(() => {
    return `# AVENTA - Technical Report
Generated: ${new Date().toISOString()}

## Bot Status
- Enabled: ${botData?.enabled ? 'Yes' : 'No'}
- Paused by owner: ${botData?.paused_by_owner ? 'Yes' : 'No'}
- Profile: ${botData?.config.profile ?? 'standard'}
- Bot user configured: ${botData?.config.bot_user_id_configured ? 'Yes' : 'No'}
- Daily max: ${botData?.config.daily_max ?? 'Not set'}
- Normal range: ${botData?.config.normal_max_range?.join('–') ?? '—'}
- Auto approve: ${botData?.config.auto_approve_enabled ? `On >= ${botData?.config.auto_approve_min_score ?? '?'}` : 'Off'}
- URL sources: ${botData?.config.urls_count ?? 0}
- ML discovery: ${botData?.config.discover_ml ? 'Active' : 'Off'}
- Amazon ASINs: ${botData?.config.amazon_asins_count ?? 0}
- Amazon source: ${botData?.config.amazon_source ?? 'scrape'}
- PA-API enabled: ${botData?.config.amazon_paapi_enabled ? 'Yes' : 'No'}
- Keepa enabled: ${botData?.config.keepa_enabled ? 'Yes' : 'No'}
- Inserted today approx: ${botData?.capacity.inserted_today_approx ?? 'N/A'}
- Capacity note: ${botData?.capacity.note ?? ''}

Environment variables:
${botData?.env_required.map((key) => `  ${key}: ${botData.env_status[key] ? 'OK' : 'MISSING'}`).join('\n') ?? 'No data'}

Missing:
${botData?.env_missing.join(', ') || 'None'}

Cron:
- Schedule: ${botData?.cron.schedule ?? '—'}
- Note: ${botData?.cron.deployment_note ?? '—'}

## System Integrity
- Overall: ${integrity?.ok ? 'OK' : 'FAILED'}
- Finished at: ${integrity?.finishedAt ?? 'N/A'}
- Summary: ${integrity ? `${integrity.summary.passed}/${integrity.summary.total} passed` : 'No data'}
${integrity?.checks.map((c) => `  [${c.ok ? 'OK' : 'FAIL'}] ${c.name}: ${c.detail}`).join('\n') ?? ''}`;
  }, [botData, integrity]);

  const copyReport = async () => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
          Cuarto de máquinas
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">
          Datos técnicos
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          Estado crudo del bot e integridad del sistema para debugging y copy-paste a IA.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={copyReport}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 bg-violet-600 text-white text-sm font-semibold transition-transform active:scale-95 hover:bg-violet-700"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copiar reporte completo
          </button>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 bg-gray-100 dark:bg-[#111113] text-gray-800 dark:text-gray-200 text-sm font-semibold transition-transform active:scale-95 hover:bg-gray-200 dark:hover:bg-[#202024]"
          >
            <RefreshCw className="h-4 w-4" />
            Recargar
          </button>
        </div>
      </section>

      {loading ? (
        <div className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-6 text-sm text-gray-500 dark:text-gray-400">
          Cargando datos técnicos...
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-violet-500" />
              <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">Bot de ingesta</h2>
            </div>
            {botData ? (
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 ${botData.enabled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                    {botData.enabled ? 'Habilitado' : 'Deshabilitado'}
                  </span>
                  {botData.paused_by_owner ? (
                    <span className="rounded-full px-3 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      Pausado por owner
                    </span>
                  ) : null}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[#F5F5F7] dark:bg-[#111113] p-4">
                    <p className="text-gray-500 dark:text-gray-400">Perfil</p>
                    <p className="mt-1 font-semibold text-[#1D1D1F] dark:text-gray-100">{botData.config.profile ?? 'standard'}</p>
                  </div>
                  <div className="rounded-2xl bg-[#F5F5F7] dark:bg-[#111113] p-4">
                    <p className="text-gray-500 dark:text-gray-400">Cron</p>
                    <p className="mt-1 font-semibold text-[#1D1D1F] dark:text-gray-100">{botData.cron.schedule}</p>
                  </div>
                  <div className="rounded-2xl bg-[#F5F5F7] dark:bg-[#111113] p-4">
                    <p className="text-gray-500 dark:text-gray-400">Fuentes Amazon</p>
                    <p className="mt-1 font-semibold text-[#1D1D1F] dark:text-gray-100">
                      {botData.config.amazon_asins_count ?? 0} ASINs · {botData.config.amazon_source ?? 'scrape'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#F5F5F7] dark:bg-[#111113] p-4">
                    <p className="text-gray-500 dark:text-gray-400">Hoy</p>
                    <p className="mt-1 font-semibold text-[#1D1D1F] dark:text-gray-100">
                      {botData.capacity.inserted_today_approx ?? '—'} insertadas
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl bg-[#F5F5F7] dark:bg-[#111113] p-4">
                  <p className="font-medium text-[#1D1D1F] dark:text-gray-100">Variables de entorno</p>
                  <ul className="mt-2 space-y-1">
                    {botData.env_required.map((key) => (
                      <li key={key} className="flex items-center gap-2 text-xs">
                        <span className={`inline-block w-2 h-2 rounded-full ${botData.env_status[key] ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <code>{key}</code>
                        <span className="text-gray-500 dark:text-gray-400">{botData.env_status[key] ? 'ok' : 'faltante'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No se pudo cargar el estado del bot.</p>
            )}
          </section>

          <section className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-violet-500" />
              <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">Integridad del sistema</h2>
            </div>
            {integrity ? (
              <div className="mt-4 space-y-4">
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${integrity.ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                  <ShieldAlert className="h-4 w-4" />
                  {integrity.ok ? 'Sistema OK' : 'Fallos detectados'}
                </div>
                <div className="rounded-2xl bg-[#F5F5F7] dark:bg-[#111113] p-4 text-sm">
                  <p className="text-gray-500 dark:text-gray-400">Última ejecución</p>
                  <p className="mt-1 font-semibold text-[#1D1D1F] dark:text-gray-100">
                    {new Date(integrity.finishedAt).toLocaleString('es-MX')}
                  </p>
                  <p className="mt-2 text-gray-500 dark:text-gray-400">
                    {integrity.summary.passed}/{integrity.summary.total} checks OK
                  </p>
                </div>
                <div className="rounded-2xl bg-[#F5F5F7] dark:bg-[#111113] p-4">
                  <ul className="space-y-2 text-sm">
                    {integrity.checks.map((check) => (
                      <li key={check.name} className="border-b border-gray-200/70 dark:border-gray-800 pb-2 last:border-b-0 last:pb-0">
                        <p className="font-medium text-[#1D1D1F] dark:text-gray-100">
                          [{check.ok ? 'OK' : 'FAIL'}] {check.name}
                        </p>
                        <p className="text-gray-500 dark:text-gray-400">{check.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No hay datos de integridad guardados.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
