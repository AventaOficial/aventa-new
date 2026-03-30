'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bot, CheckCircle2, ExternalLink, AlertTriangle } from 'lucide-react';

type BotStatusPayload = {
  enabled: boolean;
  cron: { path: string; schedule: string; runs_per_day: number };
  config: {
    bot_user_id_configured: boolean;
    max_per_run: number;
    min_discount_percent: number;
    category: string | null;
    urls_count: number;
    sample_urls: string[];
  };
  capacity: {
    estimated_processed_per_day: number;
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

  useEffect(() => {
    let cancel = false;
    const run = async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancel) {
            setError('Sin sesión');
            setLoading(false);
          }
          return;
        }
        const res = await fetch('/api/admin/bot-ingest-status', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const body = (await res.json().catch(() => ({}))) as BotStatusPayload & { error?: string };
        if (!res.ok) {
          if (!cancel) {
            setError(typeof body.error === 'string' ? body.error : 'No se pudo cargar estado del bot');
            setLoading(false);
          }
          return;
        }
        if (!cancel) {
          setData(body);
          setLoading(false);
        }
      } catch {
        if (!cancel) {
          setError('Error de red al cargar bot');
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5 shadow-sm">
      <div className="mb-3">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Bot className="h-5 w-5 text-violet-500" />
          Bot de ingesta (ofertas a moderación)
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Estado real del runtime: configuración, capacidad diaria estimada y variables requeridas.
        </p>
      </div>

      {loading ? <p className="text-sm text-gray-500 dark:text-gray-400">Cargando bot…</p> : null}
      {!loading && error ? <p className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}

      {!loading && !error && data ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                data.enabled
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                  : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
              }`}
            >
              {data.enabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {data.enabled ? 'Bot activo' : 'Bot desactivado'}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              Cron {data.cron.schedule} ({data.cron.runs_per_day} corridas/día)
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <p className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <span className="text-gray-500 dark:text-gray-400">`BOT_INGEST_USER_ID`:</span>{' '}
              <strong className={data.config.bot_user_id_configured ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}>
                {data.config.bot_user_id_configured ? 'configurado' : 'faltante'}
              </strong>
            </p>
            <p className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <span className="text-gray-500 dark:text-gray-400">Capacidad estimada:</span>{' '}
              <strong>{data.capacity.estimated_processed_per_day} URLs/día</strong>
            </p>
            <p className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <span className="text-gray-500 dark:text-gray-400">max_per_run:</span> {data.config.max_per_run}
            </p>
            <p className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
              <span className="text-gray-500 dark:text-gray-400">URLs fuente:</span> {data.config.urls_count}
            </p>
          </div>

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
              `BOT_INGEST_URLS` se guarda en una sola variable con múltiples líneas (no repetir la key).
            </p>
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
