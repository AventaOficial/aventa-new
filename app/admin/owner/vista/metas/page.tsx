'use client';

import { Check, Target } from 'lucide-react';
import VistaShell from '../shell';
import { DateChip, Donut, Ghost, Panel, Thin } from '../ui';

const GOALS: [string, string, number, boolean][] = [
  ['Vaciar cola de moderación', '11 pendientes', 40, false],
  ['Aprobar ofertas del día', '58 / 74', 78, false],
  ['Integridad del sistema', 'OK', 100, true],
  ['Reportes sin revisar', '23 abiertos', 20, false],
  ['Plaza al día', 'Temas activos', 70, false],
  ['Preparar Halloween', '42% de la checklist', 42, false],
];

export default function MetasVistaPage() {
  const done = GOALS.filter((g) => g[3]).length;
  return (
    <VistaShell
      title="Metas del día"
      crumb="Metas del día"
      subtitle="Señales del día para saber qué ya está listo y qué sigue abierto."
      toolbar={<><DateChip /><Ghost href="/equipo/gerencia">Abrir gerencia</Ghost></>}
    >
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Avance" icon={Target}>
          <div className="flex items-center gap-4">
            <Donut parts={[{ pct: Math.round((done / GOALS.length) * 100), color: '#a78bfa' }]}>
              <span className="text-[20px] font-semibold text-white">{done}/{GOALS.length}</span>
            </Donut>
            <div>
              <p className="text-[13px] text-white/80">Metas completadas</p>
              <p className="text-[12px] text-white/45">{Math.round((done / GOALS.length) * 100)}% del día</p>
            </div>
          </div>
        </Panel>
        <Panel className="xl:col-span-8" title="Lista del día">
          <ul className="space-y-2">
            {GOALS.map(([label, detail, pct, ok]) => (
              <li key={label} className="grid grid-cols-[20px_minmax(0,1fr)_120px_48px] items-center gap-3">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md border ${ok ? 'border-violet-400 bg-violet-600 text-white' : 'border-white/15'}`}>
                  {ok ? <Check className="h-3 w-3" aria-hidden /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-white">{label}</span>
                  <span className="text-[11px] text-white/40">{detail}</span>
                </span>
                <Thin pct={pct} />
                <b className="text-right text-[12px] tabular-nums text-white/70">{pct}%</b>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </VistaShell>
  );
}
