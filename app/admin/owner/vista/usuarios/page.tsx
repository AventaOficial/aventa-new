'use client';

import { UserPlus, Users } from 'lucide-react';
import VistaShell from '../shell';
import { Columns, DateChip, Ghost, KpiCard, LineChart, Panel, PeriodBar, wave } from '../ui';

export default function UsuariosVistaPage() {
  return (
    <VistaShell
      title="Usuarios en tiempo real"
      crumb="Usuarios en tiempo real"
      subtitle="Accesos, altas y publicación. Aventa no registra presencia en vivo: las cifras de esta vista son la composición de referencia."
      toolbar={<><DateChip /><PeriodBar /></>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KpiCard icon={Users} tint="bg-violet-500/20 text-violet-200" label="Con último acceso" value="1,284" delta="12%" up />
        <KpiCard icon={UserPlus} tint="bg-emerald-500/15 text-emerald-200" label="Nuevos" value="86" delta="14%" up />
        <KpiCard icon={Users} tint="bg-sky-500/15 text-sky-200" label="Publicando" value="46" delta="8%" up />
        <KpiCard icon={Users} tint="bg-amber-500/15 text-amber-200" label="Pico del día" value="1,842" sub="12:42" delta="6%" up />
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Accesos por hora" extra={<Ghost>Últimas 24 horas</Ghost>}>
          <p className="text-[28px] font-semibold tabular-nums text-white">1,284</p>
          <p className="mb-2 text-[11px] text-white/45">Pico 1,842 usuarios a las 12:42</p>
          <LineChart series={[{ values: wave(24, 2, 900, 280), color: '#a78bfa' }]} labels={['00:00', '08:00', '16:00', '20:00']} height={180} />
        </Panel>
        <Panel className="xl:col-span-5" title="Dónde están">
          <ul className="space-y-2">
            {[['Home', 28], ['Explorar', 22], ['Oferta', 18], ['Buscar', 14], ['Perfil', 8], ['Otras', 10]].map(([name, pct]) => (
              <li key={String(name)} className="grid grid-cols-[100px_1fr_36px] items-center gap-2 text-[12px] text-white/75">
                <span>{name}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-violet-400" style={{ width: `${pct}%` }} /></span>
                <b className="text-right tabular-nums">{pct}%</b>
              </li>
            ))}
          </ul>
          <Columns values={wave(12, 6, 40, 16)} height={72} />
        </Panel>
      </div>
    </VistaShell>
  );
}
