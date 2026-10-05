'use client';

import { UserPlus, Users } from 'lucide-react';
import VistaShell from '../shell';
import { DateChip, Ghost, KpiCard, LineChart, Panel, PeriodBar } from '../ui';
import { deltaOf, num, seriesValues, useVista } from '../live';

export default function UsuariosVistaPage() {
  const { range, changeRange, cmd } = useVista();
  const activeDelta = deltaOf(cmd?.users.newUsers);
  const series = seriesValues((cmd?.series.points ?? []).map((p) => ({ label: p.label, value: p.newUsers })));
  const activeSeries = seriesValues((cmd?.series.points ?? []).map((p) => ({ label: p.label, value: p.activeUsers })));
  return (
    <VistaShell
      title="Usuarios en tiempo real"
      crumb="Usuarios en tiempo real"
      subtitle="Altas y último acceso registrados. Aventa no mide presencia en vivo ni en qué pantalla está cada persona."
      toolbar={<><DateChip /><PeriodBar value={range} onChange={changeRange} /><Ghost href="/admin/users">Abrir usuarios</Ghost></>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KpiCard icon={Users} tint="bg-violet-500/20 text-violet-200" label="Con último acceso" value={num(cmd?.users.activeUsers)} sub={cmd?.series.activeUsersAvailable === false ? 'Lectura incompleta' : undefined} />
        <KpiCard icon={UserPlus} tint="bg-emerald-500/15 text-emerald-200" label="Nuevos" value={num(cmd?.users.newUsers.value)} delta={activeDelta?.text} up={activeDelta?.up} />
        <KpiCard icon={Users} tint="bg-sky-500/15 text-sky-200" label="Publicando" value={num(cmd?.community.activeHunters.value)} delta={deltaOf(cmd?.community.activeHunters)?.text} up={deltaOf(cmd?.community.activeHunters)?.up} />
        <KpiCard icon={Users} tint="bg-amber-500/15 text-amber-200" label="Perfiles" value={num(cmd?.users.totalProfiles)} />
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Altas del período" extra={<Ghost>{cmd?.range.label ?? 'Período'}</Ghost>}>
          <p className="text-[28px] font-semibold tabular-nums text-white">{num(cmd?.users.newUsers.value)}</p>
          {series.values.length > 1 ? <LineChart series={[{ values: series.values, color: '#a78bfa' }]} labels={series.labels} height={180} /> : <p className="mt-3 text-[12px] text-white/45">Sin serie de altas.</p>}
        </Panel>
        <Panel className="xl:col-span-5" title="Últimos accesos por tramo">
          {activeSeries.values.length > 1 ? <LineChart series={[{ values: activeSeries.values, color: '#38bdf8' }]} labels={activeSeries.labels} /> : <p className="text-[12px] text-white/45">Sin serie de accesos. No hay mapa de pantallas.</p>}
        </Panel>
      </div>
    </VistaShell>
  );
}
