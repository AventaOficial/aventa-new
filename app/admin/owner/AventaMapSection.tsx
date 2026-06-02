'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CircleDollarSign,
  Cloud,
  Link2,
  Package,
  RefreshCw,
  Shield,
  Users,
  Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { AventaMapPayload, MapFlowId, MapFlowLive, MapTone } from '@/lib/owner/aventaMapModel';
import { MAP_FLOW_LABELS } from '@/lib/owner/aventaMapModel';

const FLOW_META: Record<
  MapFlowId,
  { icon: typeof Users; accent: string; glow: string; gridArea: string }
> = {
  usuarios: {
    icon: Users,
    accent: 'from-sky-500/20 to-blue-600/10',
    glow: 'shadow-sky-500/10',
    gridArea: 'usuarios',
  },
  ofertas: {
    icon: Package,
    accent: 'from-violet-500/25 to-fuchsia-600/10',
    glow: 'shadow-violet-500/15',
    gridArea: 'ofertas',
  },
  moderacion: {
    icon: Shield,
    accent: 'from-amber-500/20 to-orange-600/10',
    glow: 'shadow-amber-500/10',
    gridArea: 'moderacion',
  },
  afiliacion: {
    icon: Link2,
    accent: 'from-emerald-500/20 to-teal-600/10',
    glow: 'shadow-emerald-500/10',
    gridArea: 'afiliacion',
  },
  ingresos: {
    icon: CircleDollarSign,
    accent: 'from-yellow-500/20 to-amber-600/10',
    glow: 'shadow-yellow-500/10',
    gridArea: 'ingresos',
  },
  infraestructura: {
    icon: Cloud,
    accent: 'from-slate-500/25 to-violet-900/20',
    glow: 'shadow-slate-500/10',
    gridArea: 'infra',
  },
};

const NODE_POSITIONS: Record<MapFlowId, { x: number; y: number }> = {
  infraestructura: { x: 50, y: 12 },
  usuarios: { x: 18, y: 38 },
  moderacion: { x: 82, y: 38 },
  ofertas: { x: 50, y: 52 },
  afiliacion: { x: 22, y: 78 },
  ingresos: { x: 78, y: 78 },
};

function toneRing(tone: MapTone): string {
  if (tone === 'green') return 'ring-emerald-400/50 border-emerald-500/40';
  if (tone === 'yellow') return 'ring-amber-400/50 border-amber-500/40';
  if (tone === 'red') return 'ring-red-400/50 border-red-500/40';
  return 'ring-gray-400/30 border-gray-500/30';
}

function FlowSteps({ flow }: { flow: MapFlowLive }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
      {flow.steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-2 sm:flex-1 sm:min-w-[120px]">
          <div
            className={`flex-1 rounded-xl border bg-white/80 dark:bg-[#1a1a1a]/90 px-3 py-2.5 ${toneRing(flow.status.tone)}`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Paso {i + 1}
            </p>
            <p className="text-sm font-semibold text-[#1D1D1F] dark:text-gray-100 mt-0.5">{step.title}</p>
            <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 leading-snug">{step.description}</p>
          </div>
          {i < flow.steps.length - 1 ? (
            <ArrowRight
              className="hidden sm:block h-4 w-4 shrink-0 text-violet-400/70 dark:text-violet-500/60"
              aria-hidden
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MiniMap({ flows, links }: { flows: MapFlowLive[]; links: AventaMapPayload['links'] }) {
  return (
    <div className="relative aspect-[5/4] max-h-[280px] w-full rounded-2xl bg-black/25 ring-1 ring-white/10 overflow-hidden">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {links.map((link) => {
          const from = NODE_POSITIONS[link.from];
          const to = NODE_POSITIONS[link.to];
          return (
            <line
              key={`${link.from}-${link.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="rgba(167,139,250,0.35)"
              strokeWidth="0.6"
              strokeDasharray="2 1.5"
            />
          );
        })}
      </svg>
      {flows.map((flow) => {
        const pos = NODE_POSITIONS[flow.id];
        const meta = FLOW_META[flow.id];
        const Icon = meta.icon;
        return (
          <div
            key={flow.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${meta.accent} ring-2 ${toneRing(flow.status.tone)} shadow-lg ${meta.glow}`}
            >
              <Icon className="h-4 w-4 text-white/90" strokeWidth={2} />
            </div>
            <span className="text-[9px] font-semibold text-white/80 max-w-[72px] text-center leading-tight">
              {flow.title.replace('Flujo de ', '')}
            </span>
            <span className="text-[10px]">{flow.status.emoji}</span>
          </div>
        );
      })}
    </div>
  );
}

function FlowPanel({ flow, index }: { flow: MapFlowLive; index: number }) {
  const meta = FLOW_META[flow.id];
  const Icon = meta.icon;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      className={`rounded-3xl border bg-white dark:bg-[#1C1C1E] overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)] ${toneRing(flow.status.tone)}`}
    >
      <div className={`px-5 py-4 bg-gradient-to-r ${meta.accent} border-b border-gray-200/50 dark:border-gray-800/80`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 dark:bg-black/40 shadow-sm">
              <Icon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#1D1D1F] dark:text-gray-50">{flow.title}</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">{flow.subtitle}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 dark:bg-black/30 px-3 py-1 text-xs font-semibold">
            {flow.status.emoji} {flow.status.label}
          </span>
        </div>
        {flow.dependsOn.length > 0 ? (
          <p className="mt-3 text-[11px] text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Depende de: </span>
            {flow.dependsOn.map((d) => MAP_FLOW_LABELS[d]).join(' · ')}
          </p>
        ) : (
          <p className="mt-3 text-[11px] text-gray-500">Base del ecosistema — no depende de otros flujos</p>
        )}
      </div>

      <div className="p-5 space-y-4">
        <FlowSteps flow={flow} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#F5F5F7] dark:bg-[#111113] p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              Estado ahora
            </p>
            <ul className="mt-2 space-y-1">
              {flow.liveSignals.map((s) => (
                <li key={s} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-2">
                  <Zap className="h-3 w-3 shrink-0 text-amber-500 mt-0.5" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-red-200/50 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/15 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-700/80 dark:text-red-300/90">
              Impacto en el negocio
            </p>
            <p className="mt-2 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{flow.businessImpact}</p>
            <p className="mt-2 text-xs font-medium text-gray-600 dark:text-gray-400 italic">{flow.healthLine}</p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

export default function AventaMapSection() {
  const [data, setData] = useState<AventaMapPayload | null>(null);
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
    const res = await fetch('/api/admin/owner-map', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof json?.error === 'string' ? json.error : 'Error al cargar');
      setData(null);
      return;
    }
    setData(json as AventaMapPayload);
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
      <div className="rounded-3xl border border-dashed border-violet-300/50 dark:border-violet-800 p-10 text-center">
        <p className="text-sm text-gray-500 animate-pulse">Generando mapa del negocio…</p>
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

  const overallEmoji = data.overallTone === 'green' ? '🟢' : data.overallTone === 'yellow' ? '🟡' : '🔴';

  return (
    <section className="space-y-6" aria-labelledby="mapa-aventa-heading">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f0f12] via-[#1a1528] to-[#0d0d10] text-white p-5 md:p-7 border border-violet-500/20 shadow-[0_12px_48px_rgba(88,28,135,0.25)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, rgba(139,92,246,0.4) 0%, transparent 45%), radial-gradient(circle at 80% 70%, rgba(236,72,153,0.2) 0%, transparent 40%)',
          }}
          aria-hidden
        />
        <div className="relative flex flex-col lg:flex-row gap-6 lg:items-center">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-violet-300/90">Centro de mando</p>
            <h2 id="mapa-aventa-heading" className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight">
              Mapa de AVENTA
            </h2>
            <p className="mt-2 text-sm text-gray-300 max-w-lg leading-relaxed">
              Entiende el negocio en menos de 5 minutos: qué existe, qué depende de qué, cómo está hoy y qué pasa si
              algo falla.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-sm font-medium">
                {overallEmoji} {data.headline}
              </span>
              {data.legend.map((l) => (
                <span key={l.label} className="text-[11px] text-gray-400">
                  {l.emoji} {l.label}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-gray-500">
              {data.subline} · Actualizado{' '}
              {new Date(data.generatedAt).toLocaleString('es-MX', { timeZone: data.timezone })}
            </p>
          </div>
          <div className="w-full lg:w-[min(100%,320px)] shrink-0">
            <MiniMap flows={data.flows} links={data.links} />
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar mapa
          </button>
          <a
            href="#infra-heading"
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-medium"
          >
            Ver infraestructura detallada
          </a>
        </div>
      </div>

      <div className="space-y-5">
        {data.flows.map((flow, i) => (
          <FlowPanel key={flow.id} flow={flow} index={i} />
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
        Lectura sugerida: 5 minutos de arriba a abajo. Para KPIs y acciones del día, usa las secciones siguientes del
        panel.
      </div>
    </section>
  );
}
