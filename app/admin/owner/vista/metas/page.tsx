'use client';

import { Check, Target } from 'lucide-react';
import Link from 'next/link';
import VistaShell from '../shell';
import { DateChip, Donut, Ghost, Panel, Thin } from '../ui';
import { useVista } from '../live';

export default function MetasVistaPage() {
  const { goals } = useVista();
  const known = goals.filter((goal) => goal.done != null);
  const done = known.filter((goal) => goal.done).length;
  const pct = known.length ? Math.round((done / known.length) * 100) : 0;
  return (
    <VistaShell
      title="Metas del día"
      crumb="Metas del día"
      subtitle="Se calculan con la cola, las aprobaciones y la integridad. No hay una checklist aparte."
      toolbar={<><DateChip /><Ghost href="/equipo/gerencia">Abrir gerencia</Ghost></>}
    >
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Avance" icon={Target}>
          <div className="flex items-center gap-4">
            <Donut parts={[{ pct, color: '#a78bfa' }]}>
              <span className="text-[20px] font-semibold text-white">{known.length ? `${done}/${known.length}` : '—'}</span>
            </Donut>
            <p className="text-[12px] text-white/55">{pct}% de las metas con dato ya están listas.</p>
          </div>
        </Panel>
        <Panel className="xl:col-span-8" title="Metas">
          <ul className="space-y-3">
            {goals.map((goal) => {
              const progress = goal.target && goal.current != null && goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : goal.done ? 100 : 0;
              return (
                <li key={goal.id}>
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <Link href={goal.href} className="text-white/80 hover:text-white">{goal.label}</Link>
                    {goal.done ? <Check className="h-4 w-4 text-emerald-400" aria-label="Lista" /> : <span className="text-white/40">{goal.done == null ? 'Sin dato' : 'Abierta'}</span>}
                  </div>
                  <p className="text-[10px] text-white/40">{goal.rule}</p>
                  <Thin pct={progress} />
                </li>
              );
            })}
            {goals.length === 0 ? <li className="text-[12px] text-white/45">Cargando metas.</li> : null}
          </ul>
        </Panel>
      </div>
    </VistaShell>
  );
}
