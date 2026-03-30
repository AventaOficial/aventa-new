'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, ExternalLink, Link2, XCircle } from 'lucide-react';

type ProgramStatus = {
  id: string;
  name: string;
  description: string;
  dashboardUrl: string;
  onboardingHint: string;
  active: boolean;
  configuredKeys: string[];
  missingKeys: string[];
};

type Payload = {
  programs: ProgramStatus[];
  summary?: {
    total: number;
    active: number;
    inactive: number;
  };
};

export default function AffiliateProgramsPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) {
            setError('Sin sesión');
            setLoading(false);
          }
          return;
        }
        const res = await fetch('/api/admin/affiliate-programs', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const body = (await res.json().catch(() => ({}))) as Payload & { error?: string };
        if (!res.ok) {
          if (!cancelled) {
            setError(typeof body.error === 'string' ? body.error : 'No se pudo cargar afiliadas');
            setLoading(false);
          }
          return;
        }
        if (!cancelled) {
          setData(body);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Error de red al cargar afiliadas');
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    const rows = data?.programs ?? [];
    return [...rows].sort((a, b) => {
      if (a.active === b.active) return a.name.localeCompare(b.name, 'es');
      return a.active ? -1 : 1;
    });
  }, [data?.programs]);

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Link2 className="h-5 w-5 text-violet-500" />
            Afiliadas (estado actual)
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Catálogo central de redes: activas por variables en runtime y pendientes por onboarding.
          </p>
        </div>
        {data?.summary ? (
          <p className="text-xs rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2.5 py-1 font-medium">
            {data.summary.active} activas / {data.summary.total} total
          </p>
        ) : null}
      </div>

      {loading ? <p className="text-sm text-gray-500 dark:text-gray-400">Cargando afiliadas…</p> : null}
      {!loading && error ? <p className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}

      {!loading && !error ? (
        <ul className="space-y-2.5">
          {sorted.map((p) => (
            <li
              key={p.id}
              className={`rounded-xl border px-3 py-3 ${
                p.active
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-900/10'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-[#1a1a1a]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{p.name}</p>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    p.active
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                      : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                  }`}
                >
                  {p.active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {p.active ? 'Activa' : 'Inactiva'}
                </span>
              </div>

              <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{p.description}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{p.onboardingHint}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <a
                  href={p.dashboardUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Dashboard
                  <ExternalLink className="h-3 w-3" />
                </a>
                <span className="text-gray-500 dark:text-gray-400">
                  Env: {p.configuredKeys.length > 0 ? p.configuredKeys.join(', ') : 'sin variables'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
