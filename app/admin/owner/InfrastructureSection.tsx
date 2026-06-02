'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Bot,
  Cloud,
  Database,
  Link2,
  Mail,
  RefreshCw,
  Server,
  Shield,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { InfraDependencyView, InfraGroupId, InfrastructurePayload } from '@/lib/owner/infrastructureCatalog';

const GROUP_ICONS: Record<InfraGroupId, typeof Server> = {
  infraestructura: Cloud,
  afiliacion: Link2,
  automatizacion: Bot,
  autenticacion: Shield,
  correos: Mail,
  analitica: Activity,
};

function statusBorder(status: InfraDependencyView['status']): string {
  if (status === 'active' || status === 'configured') {
    return 'border-emerald-200/80 dark:border-emerald-800/50';
  }
  if (status === 'partial') return 'border-amber-200/80 dark:border-amber-800/50';
  if (status === 'inactive') return 'border-red-200/80 dark:border-red-900/50';
  return 'border-gray-200/70 dark:border-gray-800';
}

function DependencyCard({ dep }: { dep: InfraDependencyView }) {
  return (
    <article
      className={`rounded-2xl border bg-[#F5F5F7]/60 dark:bg-[#111113]/80 p-4 flex flex-col gap-3 ${statusBorder(dep.status)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-[#1D1D1F] dark:text-gray-100 text-sm leading-snug">{dep.name}</h4>
        <span
          className="shrink-0 text-xs font-medium whitespace-nowrap"
          title={dep.statusLabel}
        >
          {dep.statusEmoji} {dep.statusLabel}
        </span>
      </div>

      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        <span className="font-medium text-gray-700 dark:text-gray-300">Uso: </span>
        {dep.usage}
      </p>

      <div className="grid gap-2 text-xs">
        <p className="text-gray-600 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300">Costo (repo): </span>
          {dep.costCurrent}
        </p>
        {dep.runtimeDetail ? (
          <p className="rounded-lg bg-white/70 dark:bg-black/20 px-2.5 py-1.5 text-[11px] text-violet-800 dark:text-violet-200 font-mono leading-snug">
            Runtime: {dep.runtimeDetail}
          </p>
        ) : null}
      </div>

      {dep.scaleWhen.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-500 mb-1">
            Escalar / activar cuando
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-gray-600 dark:text-gray-400">
            {dep.scaleWhen.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-auto pt-2 border-t border-gray-200/60 dark:border-gray-800 text-[11px] text-gray-600 dark:text-gray-400">
        <span className="font-medium text-red-700/90 dark:text-red-300/90">Si falla: </span>
        {dep.failureImpact}
      </p>

      {dep.repoRefs.length > 0 ? (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate" title={dep.repoRefs.join(', ')}>
          {dep.repoRefs[0]}
          {dep.repoRefs.length > 1 ? ` +${dep.repoRefs.length - 1}` : ''}
        </p>
      ) : null}
    </article>
  );
}

export default function InfrastructureSection() {
  const [data, setData] = useState<InfrastructurePayload | null>(null);
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
      return;
    }
    const res = await fetch('/api/admin/owner-infrastructure', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof json?.error === 'string' ? json.error : 'Error al cargar');
      setData(null);
      return;
    }
    setData(json as InfrastructurePayload);
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
      <div className="rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-sm text-gray-500">
        Cargando mapa de infraestructura…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-200 dark:border-red-900/50 p-6 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <section className="space-y-6" aria-labelledby="infra-heading">
      <div className="rounded-3xl bg-gradient-to-br from-[#1d1d1f] via-[#252528] to-[#1a1a1a] text-white p-5 md:p-6 border border-gray-800/80 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/20 ring-1 ring-violet-400/30">
              <Database className="h-5 w-5 text-violet-300" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300/90">
                Centro de control
              </p>
              <h2 id="infra-heading" className="text-xl md:text-2xl font-semibold tracking-tight mt-0.5">
                Infraestructura y dependencias
              </h2>
              <p className="mt-1 text-sm text-gray-400 max-w-xl">
                Solo servicios documentados en el repositorio. Estado en runtime según variables de entorno (sin
                facturación real de proveedores).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-white/5 px-3 py-2.5 text-center">
            <p className="text-2xl font-semibold">{data.summary.active}</p>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">OK / config</p>
          </div>
          <div className="rounded-xl bg-amber-500/10 px-3 py-2.5 text-center ring-1 ring-amber-500/20">
            <p className="text-2xl font-semibold text-amber-200">{data.summary.partial}</p>
            <p className="text-[10px] uppercase tracking-wide text-amber-200/70">Parcial</p>
          </div>
          <div className="rounded-xl bg-red-500/10 px-3 py-2.5 text-center ring-1 ring-red-500/20">
            <p className="text-2xl font-semibold text-red-200">{data.summary.inactive}</p>
            <p className="text-[10px] uppercase tracking-wide text-red-200/70">Inactivo</p>
          </div>
          <div className="rounded-xl bg-white/5 px-3 py-2.5 text-center">
            <p className="text-2xl font-semibold">{data.summary.total}</p>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Total</p>
          </div>
        </div>

        {data.summary.criticalInactive.length > 0 ? (
          <p className="mt-4 text-sm text-red-200 bg-red-500/10 rounded-xl px-3 py-2 border border-red-500/20">
            Crítico sin cubrir: {data.summary.criticalInactive.join(', ')}
          </p>
        ) : null}

        <p className="mt-3 text-[11px] text-gray-500">
          Actualizado{' '}
          {new Date(data.generatedAt).toLocaleString('es-MX', { timeZone: data.timezone })} · {data.timezone}
        </p>
      </div>

      {data.groups.map((group) => {
        const Icon = GROUP_ICONS[group.id];
        const deps = data.dependencies.filter((d) => d.group === group.id);
        return (
          <div key={group.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              <div>
                <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-gray-100">{group.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{group.subtitle}</p>
              </div>
              <span className="ml-auto text-xs font-medium text-gray-400">{deps.length} servicios</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {deps.map((dep) => (
                <DependencyCard key={dep.id} dep={dep} />
              ))}
            </div>
          </div>
        );
      })}

      <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-4 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-3 items-center">
        <Server className="h-4 w-4 shrink-0" />
        <span>
          Detalle operativo del bot y crons:{' '}
          <Link href="/admin/operaciones/trabajo" className="text-violet-600 dark:text-violet-400 font-medium underline">
            Operaciones → Trabajo
          </Link>
        </span>
        <span>·</span>
        <span>
          Programas afiliados:{' '}
          <Link href="/operaciones" className="text-violet-600 dark:text-violet-400 font-medium underline">
            Centro de operaciones
          </Link>
        </span>
      </div>
    </section>
  );
}
