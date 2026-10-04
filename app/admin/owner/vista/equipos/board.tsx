'use client';

import Link from 'next/link';
import { Shield } from 'lucide-react';
import type { TeamId } from '../../command/types';
import { TEAM_LABEL } from '../../command/types';
import VistaShell from '../shell';
import { DateChip, Donut, Ghost, KpiCard, LineChart, Panel, PeriodBar, StackedColumns, wave } from '../ui';
import type { TeamVista, Tone } from './content';
import { TEAM_VIEWS } from './content';

const TONE: Record<Tone, string> = {
  green: 'bg-emerald-500/15 text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-300',
  red: 'bg-rose-500/15 text-rose-300',
  gray: 'bg-white/10 text-white/50',
};

const ORDER: TeamId[] = ['moderacion', 'finanzas', 'growth', 'producto', 'hunter', 'comunidad', 'operaciones'];

export default function TeamBoard({ data }: { data: TeamVista }) {
  return (
    <VistaShell
      title={data.title}
      crumb={data.title}
      subtitle={data.subtitle}
      toolbar={
        <>
          <DateChip />
          <PeriodBar />
          <Ghost href={data.toolHref}>{data.toolLabel}</Ghost>
        </>
      }
    >
      <div className="flex gap-1 overflow-x-auto pb-1">
        {ORDER.map((id) => (
          <Link
            key={id}
            href={`/admin/owner/vista/equipos/${id}`}
            aria-current={id === data.id ? 'page' : undefined}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${id === data.id ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-white/55 hover:text-white'}`}
          >
            {TEAM_LABEL[id]}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {data.kpis.map((k) => (
          <KpiCard key={k.label} icon={Shield} tint="bg-violet-500/20 text-violet-200" label={k.label} value={k.value} sub={k.sub} delta={k.delta} up={k.up} />
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title={data.activity.title}>
          <StackedColumns
            labels={['00', '04', '08', '12', '16', '20']}
            series={data.activity.series.map((s, i) => ({ name: s.name, color: s.color, values: wave(12, i + 1, s.base, s.amp) }))}
          />
        </Panel>
        <Panel className="xl:col-span-3" title={data.status.title}>
          <div className="flex items-center gap-3">
            <Donut parts={data.status.parts.map((p) => ({ pct: p.pct, color: p.color }))} size={112}>
              <span className="text-[18px] font-semibold text-white">{data.status.center}</span>
              <span className="px-4 text-[10px] text-white/45">{data.status.caption}</span>
            </Donut>
            <ul className="min-w-0 flex-1 space-y-1 text-[11px] text-white/70">
              {data.status.parts.map((p) => (
                <li key={p.label} className="flex justify-between gap-2">
                  <span className="truncate">{p.label}</span>
                  <b className="tabular-nums text-white">{p.value} · {p.pct}%</b>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
        <Panel className="xl:col-span-4" title={data.trend.title} extra={<Ghost>Últimos 7 días</Ghost>}>
          <p className="text-[22px] font-semibold text-white">{data.trend.value}</p>
          <p className="mb-2 text-[11px] text-white/45">{data.trend.delta}</p>
          <LineChart series={[{ values: wave(16, 3, 40, 12), color: '#c4b5fd' }]} labels={['26 sep', '2 oct']} />
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-6" title={data.people.title} extra={<Ghost href={data.toolHref}>Ver todos</Ghost>}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-white/40">
                <tr>{data.people.columns.map((h) => <th key={h} className="whitespace-nowrap pb-2 pr-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.people.rows.map((r) => (
                  <tr key={r.cells[0]} className="border-t border-white/[0.04] text-white/80">
                    {r.cells.map((cell, i) => (
                      <td key={i} className="whitespace-nowrap py-1.5 pr-3">
                        {i === 1 && r.tone ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[r.tone]}`}>{cell}</span> : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel className="xl:col-span-3" title={data.queue.title} extra={<span className="text-[11px] text-white/45">{data.queue.count}</span>}>
          {data.queue.rows.length === 0 ? (
            <p className="rounded-xl border border-white/[0.06] px-3 py-4 text-[12px] text-white/45">Sin elementos en esta cola.</p>
          ) : (
            <ul className="space-y-2">
              {data.queue.rows.map((r) => (
                <li key={r.title} className="rounded-xl bg-white/[0.03] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[12px] font-medium text-white">{r.title}</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${TONE[r.tone]}`}>Pendiente</span>
                  </div>
                  <p className="mt-0.5 flex justify-between text-[10px] text-white/40"><span>{r.meta}</span><span>{r.age}</span></p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="xl:col-span-3" title={data.dist.title}>
          <div className="flex items-center gap-3">
            <Donut parts={data.dist.parts.map((p) => ({ pct: p.pct, color: p.color }))} size={96} stroke={10}>
              <span className="text-[16px] font-semibold text-white">{data.dist.center}</span>
            </Donut>
            <ul className="min-w-0 flex-1 space-y-1 text-[11px] text-white/70">
              {data.dist.parts.map((p) => (
                <li key={p.label} className="flex justify-between gap-2"><span className="truncate">{p.label}</span><b className="text-white">{p.value} ({p.pct}%)</b></li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title={data.recent.title} extra={<Ghost href={data.toolHref}>Ver todas</Ghost>}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-white/40"><tr>{data.recent.columns.map((h) => <th key={h} className="whitespace-nowrap pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {data.recent.rows.map((r) => (
                  <tr key={r.cells.join('|')} className="border-t border-white/[0.04] text-white/80">
                    {r.cells.map((cell, i) => (
                      <td key={i} className="whitespace-nowrap py-1.5 pr-3">
                        {i === 3 && r.tone ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[r.tone]}`}>{cell}</span> : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel className="xl:col-span-4" title={data.perf.title} extra={<Ghost>Últimos 7 días</Ghost>}>
          <StackedColumns
            labels={['26', '27', '28', '29', '30', '1', '2']}
            series={data.perf.series.map((s, i) => ({ name: s.name, color: s.color, values: wave(7, i + 4, s.base, s.amp) }))}
            height={120}
          />
        </Panel>
        <Panel className="xl:col-span-3" title="Alertas y recomendaciones">
          <ul className="space-y-2">
            {data.alerts.map((a) => (
              <li key={a.text} className="flex items-start gap-2 text-[12px]">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${a.tone === 'green' ? 'bg-emerald-400' : a.tone === 'amber' ? 'bg-amber-400' : a.tone === 'red' ? 'bg-rose-400' : 'bg-white/30'}`} aria-hidden />
                <span className="min-w-0 flex-1 text-white/75">{a.text}</span>
                <span className="shrink-0 text-[10px] text-white/35">{a.age}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </VistaShell>
  );
}

export function viewFor(id: string): TeamVista | null {
  return id in TEAM_VIEWS ? TEAM_VIEWS[id as TeamId] : null;
}
