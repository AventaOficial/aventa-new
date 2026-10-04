'use client';

import { Wallet } from 'lucide-react';
import VistaShell from '../shell';
import { DateChip, Donut, Ghost, KpiCard, Panel, PeriodBar, StackedColumns, wave } from '../ui';

export default function PagosVistaPage() {
  return (
    <VistaShell
      title="Pagos pendientes"
      crumb="Pagos pendientes"
      subtitle="Conteos por estado. Los montos se consultan en Contabilidad; esta vista no los muestra."
      toolbar={<><DateChip /><PeriodBar /><Ghost href="/equipo/contabilidad">Abrir contabilidad</Ghost></>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={Wallet} tint="bg-violet-500/20 text-violet-200" label="Abiertos" value="14" sub="Pendientes + en revisión" delta="8%" up={false} />
        <KpiCard icon={Wallet} tint="bg-rose-500/15 text-rose-200" label="Pendientes" value="8" delta="2" up={false} />
        <KpiCard icon={Wallet} tint="bg-amber-500/15 text-amber-200" label="En revisión" value="6" delta="1" up={false} />
        <KpiCard icon={Wallet} tint="bg-emerald-500/15 text-emerald-200" label="Listos" value="22" delta="6%" up />
        <KpiCard icon={Wallet} tint="bg-sky-500/15 text-sky-200" label="Lotes del mes" value="3" delta="1" up />
        <KpiCard icon={Wallet} tint="bg-indigo-500/15 text-indigo-200" label="Congelados" value="6" sub="Flujo protegido" />
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Por estado">
          <div className="flex items-center gap-4">
            <Donut parts={[{ pct: 52, color: '#34d399' }, { pct: 19, color: '#fb7185' }, { pct: 14, color: '#fbbf24' }, { pct: 15, color: '#38bdf8' }]}>
              <span className="text-[18px] font-semibold text-white">42</span>
              <span className="text-[10px] text-white/45">pagos</span>
            </Donut>
            <ul className="space-y-1 text-[12px] text-white/70">
              <li>Listos · 22</li>
              <li>Pendientes · 8</li>
              <li>En revisión · 6</li>
              <li>Congelados · 6</li>
            </ul>
          </div>
        </Panel>
        <Panel className="xl:col-span-5" title="Lotes de la semana">
          <StackedColumns
            labels={['26', '27', '28', '29', '30', '1', '2']}
            series={[
              { name: 'Listos', color: '#34d399', values: wave(7, 1, 8, 3) },
              { name: 'En revisión', color: '#fbbf24', values: wave(7, 2, 3, 1) },
            ]}
          />
        </Panel>
        <Panel className="xl:col-span-3" title="Últimos lotes" extra={<Ghost href="/equipo/contabilidad">Ver pagos</Ghost>}>
          <ul>
            {[['2026-10', 'En revisión', '14 pagos'], ['2026-09', 'Listo', '22 pagos'], ['2026-08', 'Listo', '19 pagos']].map(([a, b, c]) => (
              <li key={a} className="flex items-center justify-between border-t border-white/[0.04] py-2 text-[12px]">
                <b className="text-white">{a}</b>
                <span className="text-white/70">{b}</span>
                <span className="text-white/40">{c}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </VistaShell>
  );
}
