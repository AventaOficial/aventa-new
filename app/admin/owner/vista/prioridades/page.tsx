'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';
import VistaShell from '../shell';
import { DateChip, Ghost, Panel } from '../ui';
import { TEAM_LABEL, type PrioritySeverity } from '../../command/types';
import { num, useVista } from '../live';

const COLUMNS: { id: PrioritySeverity; title: string; tone: string }[] = [
  { id: 'critical', title: 'Crítico', tone: 'text-rose-300' },
  { id: 'high', title: 'Alto', tone: 'text-orange-300' },
  { id: 'medium', title: 'Medio', tone: 'text-amber-300' },
  { id: 'info', title: 'Info', tone: 'text-violet-200' },
];

export default function PrioridadesVistaPage() {
  const { priorities } = useVista();
  return (
    <VistaShell
      title="Prioridades del CEO"
      crumb="Prioridades del CEO"
      subtitle="Salen de las mismas reglas del mosaico. Cada tarjeta abre la herramienta que la resuelve."
      toolbar={<><DateChip /><Ghost href="/admin/owner">Volver al mosaico</Ghost></>}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = priorities.filter((item) => item.severity === col.id);
          return (
            <Panel key={col.id} title={col.title} icon={Zap}>
              {items.length === 0 ? <p className="text-[12px] text-white/40">Nada en esta columna.</p> : (
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className="rounded-xl bg-white/[0.03] px-3 py-2">
                      <p className={`text-[11px] font-semibold ${col.tone}`}>{num(item.quantity)} · {TEAM_LABEL[item.team]}</p>
                      <p className="mt-1 text-[12px] text-white/80">{item.problem}</p>
                      <p className="mt-1 text-[11px] text-white/40">{item.reason}</p>
                      <Link href={item.href} className="mt-2 inline-block text-[11px] font-semibold text-violet-300">{item.action}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          );
        })}
      </div>
    </VistaShell>
  );
}
