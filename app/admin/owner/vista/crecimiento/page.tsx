'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, FlaskConical, Repeat, Rocket, Target, TrendingUp, UserPlus, Users, UsersRound } from 'lucide-react';
import VistaShell from '../shell';
import { DateChip, Gauge, Ghost, KpiCard, Panel, Thin } from '../ui';
import { num, useVista } from '../live';
import { fetchJson, getToken } from '../../command/useCommandCenter';
import { HUNTER_GROWTH_EXPERIMENTS } from '@/lib/owner/hunterExperiments';
import type { GrowthDashboardPayload, TrafficLight } from '@/lib/owner/buildGrowthDashboard';

type GrowthState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: GrowthDashboardPayload };

const DOT: Record<TrafficLight, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  red: 'bg-rose-400',
};

const PRELAUNCH: Record<'done' | 'partial' | 'pending', { label: string; tone: string }> = {
  done: { label: 'Listo', tone: 'text-emerald-300' },
  partial: { label: 'En curso', tone: 'text-amber-300' },
  pending: { label: 'Pendiente', tone: 'text-white/45' },
};

function pct(ratio: number | null | undefined): string {
  return ratio == null ? '—' : `${Math.round(ratio * 100)}%`;
}

export default function CrecimientoVistaPage() {
  const { cmd } = useVista();
  const [growth, setGrowth] = useState<GrowthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error('Sin sesión');
        const data = await fetchJson<GrowthDashboardPayload>('/api/admin/growth-dashboard', token);
        if (active) setGrowth({ status: 'ready', data });
      } catch {
        if (active) setGrowth({ status: 'error' });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const g = growth.status === 'ready' ? growth.data : null;
  const human = cmd?.supply?.humanSupply ?? null;
  const funnel = cmd?.supply?.hunterGrowth?.d30 ?? null;
  const top = funnel?.firstSubmissions ?? null;
  const steps = [
    { label: 'Primeros envíos', value: funnel?.firstSubmissions ?? null },
    { label: 'Primeras aprobaciones', value: funnel?.firstApprovals ?? null },
    { label: 'Segundas contribuciones', value: funnel?.secondContributions ?? null },
    { label: 'Cazadores que repiten', value: funnel?.repeatHunters ?? null },
  ];
  const weekly = g?.users.growthWeeklyPct ?? null;

  return (
    <VistaShell
      title="Crecimiento"
      crumb="Crecimiento"
      subtitle="Usuarios y cazadores reales. Un envío sin aprobar no cuenta como éxito."
      toolbar={
        <>
          <DateChip />
          <Ghost href="/admin/owner/crecimiento">Costos y hoja de ruta</Ghost>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={Users} tint="bg-violet-500/20 text-violet-200" label="Usuarios registrados" value={num(g?.users.total)} sub={g ? `+${num(g.users.newToday)} hoy` : undefined} />
        <KpiCard icon={UserPlus} tint="bg-emerald-500/15 text-emerald-200" label="Nuevos 7 días" value={num(g?.users.new7d)} sub={g ? `${num(g.users.new30d)} en 30 días` : undefined} />
        <KpiCard icon={TrendingUp} tint="bg-fuchsia-500/15 text-fuchsia-200" label="Crecimiento semanal" value={weekly == null ? '—' : `${weekly >= 0 ? '+' : ''}${weekly}%`} />
        <KpiCard icon={Repeat} tint="bg-sky-500/15 text-sky-200" label="Retención 48 h" value={g?.users.retention48hPct == null ? '—' : `${g.users.retention48hPct}%`} />
        <KpiCard icon={UsersRound} tint="bg-indigo-500/15 text-indigo-200" label="Cazadores 30 días" value={num(human?.d30.contributors)} sub={human ? `${num(human.d30.offers)} ofertas` : undefined} />
        <KpiCard icon={Target} tint="bg-amber-500/15 text-amber-200" label="Aprobación de cazadores" value={pct(human?.d30.approvalRate)} sub={human ? `7 días: ${num(human.d7.contributors)} cazadores` : undefined} />
      </div>

      {growth.status === 'error' ? (
        <p className="text-[12px] text-white/45">No se pudo leer el tablero de usuarios. Las cifras de cazadores siguen abajo.</p>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Tu meta" icon={Rocket}>
          {g ? (
            <>
              <Gauge pct={g.aspiration.progressToMillionPct}>
                <p className="text-[20px] font-semibold tabular-nums text-white">{g.aspiration.progressToMillionPct}%</p>
                <p className="text-[10px] text-white/45">del camino al millón</p>
              </Gauge>
              <ul className="mt-3 space-y-1.5 text-[12px] text-white/70">
                <li className="flex justify-between gap-3"><span>Meta</span><b className="text-right text-white">{g.aspiration.targetLabel}</b></li>
                <li className="flex justify-between gap-3"><span>Etapa actual</span><b className="text-right text-white">{g.aspiration.currentStageLabel}</b></li>
                {g.aspiration.nextStageLabel && g.aspiration.progressToNextPct != null ? (
                  <li className="flex justify-between gap-3"><span>Hacia «{g.aspiration.nextStageLabel}»</span><b className="text-white">{g.aspiration.progressToNextPct}%</b></li>
                ) : null}
              </ul>
              <p className="mt-2 text-[11px] text-white/45">{g.aspiration.currentFocus}</p>
            </>
          ) : (
            <p className="text-[12px] text-white/45">{growth.status === 'loading' ? 'Cargando la meta.' : 'Sin lectura de la meta.'}</p>
          )}
        </Panel>

        <Panel className="xl:col-span-4" title="Embudo de cazadores · 30 días" icon={UsersRound}>
          {funnel ? (
            <ul className="space-y-3">
              {steps.map((step) => (
                <li key={step.label}>
                  <div className="flex justify-between text-[12px] text-white/70">
                    <span>{step.label}</span>
                    <b className="tabular-nums text-white">{num(step.value)}</b>
                  </div>
                  <Thin pct={top && step.value != null ? (step.value / top) * 100 : 0} />
                </li>
              ))}
              <li className="text-[11px] text-white/45">De primera aprobación a segunda contribución: {pct(funnel.approvalToSecond)}.</li>
            </ul>
          ) : (
            <p className="text-[12px] text-white/45">El embudo no está en esta lectura.</p>
          )}
        </Panel>

        <Panel className="xl:col-span-4" title="Qué hacer ahora" icon={Target}>
          {g && g.nextActions.length > 0 ? (
            <ul className="space-y-2">
              {g.nextActions.slice(0, 5).map((action) => (
                <li key={action.id} className="flex items-start gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[action.priority]}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-white">{action.title}</p>
                    <p className="text-[11px] text-white/45">{action.detail}</p>
                  </div>
                  {action.href ? (
                    <Link href={action.href} className="shrink-0 text-violet-300 hover:text-violet-200" aria-label={`Abrir: ${action.title}`}>
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-white/45">{growth.status === 'loading' ? 'Cargando acciones.' : 'Nada pendiente.'}</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-6" title="Experimentos activos" icon={FlaskConical}>
          <ul className="space-y-2">
            {HUNTER_GROWTH_EXPERIMENTS.map((experiment) => (
              <li key={experiment.id} className="rounded-xl bg-white/[0.03] px-3 py-2">
                <p className="text-[12.5px] font-medium text-white">{experiment.hypothesis}</p>
                <p className="mt-1 text-[11px] text-white/45">
                  Para: {experiment.target}. Éxito: {experiment.success}. Límite: {experiment.guardrail}.
                </p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="xl:col-span-6" title="Antes de captar usuarios" icon={Rocket} extra={<Ghost href="/admin/owner/crecimiento">Ver costos</Ghost>}>
          {g ? (
            <ul className="space-y-1.5">
              {g.prelaunch.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-white">{item.title}</p>
                    <p className="text-[11px] text-white/45">{item.detail}</p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold ${PRELAUNCH[item.status].tone}`}>{PRELAUNCH[item.status].label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-white/45">{growth.status === 'loading' ? 'Cargando la lista.' : 'Sin lectura de la lista.'}</p>
          )}
        </Panel>
      </div>
    </VistaShell>
  );
}
