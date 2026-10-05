'use client';

import Link from 'next/link';
import { Shield } from 'lucide-react';
import type { TeamId } from '../../command/types';
import { TEAM_LABEL } from '../../command/types';
import { teamSnapshot } from '../../command/ceo/teamSnapshot';
import VistaShell from '../shell';
import { DateChip, Ghost, KpiCard, Panel, PeriodBar } from '../ui';
import { useVista } from '../live';
import type { TeamVista } from './content';
import { TEAM_VIEWS } from './content';

const ORDER: TeamId[] = ['moderacion', 'finanzas', 'growth', 'producto', 'hunter', 'comunidad', 'operaciones'];

export default function TeamBoard({ data }: { data: TeamVista }) {
  const { range, changeRange, base, cmd, priorities } = useVista();
  const snap = teamSnapshot(data.id, base, cmd, priorities);
  const teamPriorities = priorities.filter((item) => item.team === data.id);
  const people = data.id === 'moderacion' ? cmd?.moderation.moderators ?? [] : [];
  return (
    <VistaShell
      title={data.title}
      crumb={data.title}
      subtitle={data.subtitle}
      toolbar={
        <>
          <DateChip />
          <PeriodBar value={range} onChange={changeRange} />
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {snap.metrics.map((metric) => (
          <KpiCard key={metric.label} icon={Shield} tint="bg-violet-500/20 text-violet-200" label={metric.label} value={metric.value ?? '—'} sub={metric.value == null ? metric.why : undefined} />
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title={data.people.title} extra={<Ghost href={data.toolHref}>Abrir herramienta</Ghost>}>
          {people.length === 0 ? (
            <p className="text-[12px] text-white/45">No hay una lista de personas para este equipo en el período. La operación sigue en {data.toolLabel.toLowerCase()}.</p>
          ) : (
            <table className="w-full text-left text-[11px]">
              <thead className="text-white/40"><tr>{['Persona', 'Decisiones', 'Aprobadas', 'Rechazadas'].map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.userId} className="border-t border-white/[0.04] text-white/80">
                    <td className="py-1.5 pr-3">{person.displayName ?? 'Sin nombre'}</td>
                    <td className="tabular-nums">{person.decisions}</td>
                    <td className="tabular-nums">{person.approved}</td>
                    <td className="tabular-nums">{person.rejected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel className="xl:col-span-5" title="Lo que pide atención">
          {teamPriorities.length === 0 ? <p className="text-[12px] text-white/45">{snap.alert?.text ?? 'Ninguna regla de este equipo está activa.'}</p> : (
            <ul className="space-y-2">
              {teamPriorities.map((item) => (
                <li key={item.id} className="rounded-xl bg-white/[0.03] px-3 py-2">
                  <p className="text-[12px] text-white/80">{item.problem}</p>
                  <Link href={item.href} className="mt-1 inline-block text-[11px] font-semibold text-violet-300">{item.action}</Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </VistaShell>
  );
}

export function viewFor(id: string): TeamVista | null {
  return id in TEAM_VIEWS ? TEAM_VIEWS[id as TeamId] : null;
}
