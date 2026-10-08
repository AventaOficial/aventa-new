'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readEconomicState } from '@/lib/economy/economicState';
import type { AventaMapPayload, MapTone } from '@/lib/owner/aventaMapModel';
import { createClient } from '@/lib/supabase/client';

type NodeState = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'FROZEN' | 'DISABLED' | 'UNKNOWN';

type MapNode = {
  id: string;
  label: string;
  href: string;
  group: 'core' | 'money' | 'system';
  state: NodeState;
  does: string;
  metric: string;
};

const TONE: Record<MapTone, NodeState> = {
  green: 'HEALTHY',
  yellow: 'WARNING',
  red: 'CRITICAL',
  neutral: 'UNKNOWN',
};

function toneOf(flows: AventaMapPayload['flows'] | null, id: string): NodeState {
  const flow = flows?.find((item) => item.id === id);
  if (!flow) return 'UNKNOWN';
  return TONE[flow.status.tone] ?? 'UNKNOWN';
}

export default function ArchitectureMap() {
  const economy = readEconomicState();
  const [flows, setFlows] = useState<AventaMapPayload['flows'] | null>(null);
  const [selected, setSelected] = useState<string>('supply');

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/admin/owner-map', { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json().catch(() => null)) as AventaMapPayload | null;
      if (active && res.ok && json?.flows) setFlows(json.flows);
    })();
    return () => {
      active = false;
    };
  }, []);

  const payout: NodeState = economy.payoutStatus === 'FROZEN' ? 'FROZEN' : 'HEALTHY';
  const fiscal: NodeState = economy.fiscalPolicyStatus === 'UNCONFIRMED' ? 'FROZEN' : 'HEALTHY';
  const nodes: MapNode[] = [
    { id: 'users', label: 'Usuarios', href: '/admin/users', group: 'core', state: toneOf(flows, 'usuarios'), does: 'Personas que entran, votan y cazan.', metric: 'Tono del flujo de usuarios', },
    { id: 'supply', label: 'Supply', href: '/admin/supply', group: 'core', state: toneOf(flows, 'ofertas'), does: 'Ofertas que alimentan el catálogo.', metric: 'Tono del flujo de ofertas', },
    { id: 'offers', label: 'Ofertas', href: '/admin/supply', group: 'core', state: toneOf(flows, 'ofertas'), does: 'Lo que se crea y se publica.', metric: 'Misma lectura de oferta', },
    { id: 'hunters', label: 'Hunters', href: '/admin/hunters-ai', group: 'core', state: toneOf(flows, 'ofertas'), does: 'Candidatos de máquina a revisión humana.', metric: 'Cola editorial', },
    { id: 'moderation', label: 'Moderación', href: '/admin/moderation', group: 'core', state: toneOf(flows, 'moderacion'), does: 'Decide qué oferta ve la comunidad.', metric: 'Tono de la cola', },
    { id: 'growth', label: 'Growth', href: '/admin/owner/crecimiento', group: 'core', state: toneOf(flows, 'usuarios'), does: 'Si la comunidad y los cazadores crecen.', metric: 'Tono de usuarios', },
    { id: 'attribution', label: 'Atribución', href: '/admin/owner/economia', group: 'money', state: toneOf(flows, 'afiliacion'), does: 'Une un clic o una orden con un creador.', metric: 'Tono de afiliación', },
    { id: 'commission', label: 'Comisión', href: '/admin/commissions', group: 'money', state: fiscal, does: 'Dinero de la tienda, pendiente hasta confirmarse.', metric: 'Política fiscal sin confirmar', },
    { id: 'rewards', label: 'Rewards', href: '/admin/rewards', group: 'money', state: payout, does: 'Parte del creador. Congelado no es roto.', metric: 'Payout congelado', },
    { id: 'payout', label: 'Payout', href: '/admin/owner/payouts', group: 'money', state: payout, does: 'Salida de dinero. Hoy no sale.', metric: 'Sandbox, compuerta cerrada', },
    { id: 'analytics', label: 'Analytics', href: '/admin/metrics', group: 'system', state: 'UNKNOWN', does: 'Lectura de uso. No es el libro de dinero.', metric: 'Métricas de producto', },
    { id: 'infra', label: 'Infraestructura', href: '/admin/infraestructura', group: 'system', state: toneOf(flows, 'infraestructura'), does: 'Lo que mantiene el sitio en pie.', metric: 'Tono de infraestructura', },
    { id: 'health', label: 'Health', href: '/admin/health', group: 'system', state: toneOf(flows, 'infraestructura'), does: 'Si la base responde.', metric: 'Pulso de sistema', },
    { id: 'technical', label: 'Technical', href: '/admin/technical', group: 'system', state: toneOf(flows, 'infraestructura'), does: 'Detalle del bot y de la integridad.', metric: 'Cuarto de máquinas', },
    { id: 'mcp', label: 'MCP', href: '/admin/machine-clients', group: 'system', state: 'UNKNOWN', does: 'Bots externos que solo proponen.', metric: 'Clientes registrados', },
    { id: 'distribution', label: 'Distribución', href: '/admin/distribution', group: 'system', state: 'UNKNOWN', does: 'Publicaciones hacia fuera. No paga.', metric: 'Motor de distribución', },
  ];
  const current = nodes.find((node) => node.id === selected) ?? nodes[0]!;

  return (
    <section className="space-y-4" aria-label="Mapa de arquitectura">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Sistema</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Systems Map</h1>
        <p className="mt-1 max-w-xl text-sm text-white/50">Aventa se lee como usuarios, oferta y dinero. Congelado no es una falla.</p>
      </header>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => setSelected(node.id)}
            className={`rounded-2xl border px-3 py-3 text-left ${selected === node.id ? 'border-violet-400/40 bg-violet-500/10' : 'border-white/10 bg-white/[0.03]'}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-white">{node.label}</span>
              <StatePill state={node.state} />
            </span>
          </button>
        ))}
      </div>
      <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
        <p className="text-base font-semibold text-white">{current.label}</p>
        <p className="mt-2">{current.does}</p>
        <p className="mt-2 text-white/50">Estado: {labelOf(current.state)}. Señal: {current.metric}.</p>
        <Link href={current.href} className="mt-3 inline-block text-violet-300 hover:underline">
          Abrir
        </Link>
      </aside>
    </section>
  );
}

function labelOf(state: NodeState): string {
  if (state === 'FROZEN') return 'Congelado';
  if (state === 'HEALTHY') return 'Sano';
  if (state === 'WARNING') return 'Aviso';
  if (state === 'CRITICAL') return 'Crítico';
  if (state === 'DISABLED') return 'Apagado';
  return 'Sin dato';
}

function StatePill({ state }: { state: NodeState }) {
  const tone =
    state === 'HEALTHY'
      ? 'text-emerald-300'
      : state === 'WARNING'
        ? 'text-amber-300'
        : state === 'CRITICAL'
          ? 'text-rose-300'
          : state === 'FROZEN'
            ? 'text-sky-200'
            : 'text-white/40';
  return <span className={`text-[10px] font-semibold uppercase tracking-wide ${tone}`}>{labelOf(state)}</span>;
}
