'use client';

import { Server } from 'lucide-react';
import VistaShell from '../shell';
import { DateChip, Ghost, KpiCard, Panel, StatusPill } from '../ui';
import { num, useVista } from '../live';

const TONE: Record<string, string> = {
  healthy: 'text-emerald-300',
  degraded: 'text-amber-300',
  blocked: 'text-rose-300',
  unknown: 'text-white/50',
};

export default function CapacidadVistaPage() {
  const { base, cmd } = useVista();
  const health = base?.systemHealth;
  const hunter = cmd?.hunter;
  return (
    <VistaShell
      title="Capacidad de Aventa"
      crumb="Capacidad de Aventa"
      subtitle="Estado real de los componentes y de la cola. No hay porcentajes de uptime inventados."
      toolbar={<><DateChip /><Ghost href="/admin/infraestructura">Abrir infraestructura</Ghost></>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <KpiCard icon={Server} tint="bg-violet-500/20 text-violet-200" label="Salud general" value={health?.overall ?? '—'} />
        <KpiCard icon={Server} tint="bg-emerald-500/15 text-emerald-200" label="Integridad" value={cmd?.operations.integrityOk == null ? '—' : cmd.operations.integrityOk ? 'OK' : 'Con fallos'} sub={cmd?.operations.integrityFailed != null ? `${cmd.operations.integrityFailed} chequeos` : undefined} />
        <KpiCard icon={Server} tint="bg-amber-500/15 text-amber-200" label="Cola de escritura" value={num(cmd?.operations.queuePending)} sub={cmd?.operations.queueFailed != null ? `${cmd.operations.queueFailed} fallidas` : undefined} />
        <KpiCard icon={Server} tint="bg-sky-500/15 text-sky-200" label="Última corrida hunter" value={hunter?.lastRunStatus ?? '—'} sub={hunter?.lastRunAt ?? undefined} />
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Componentes">
          <ul className="space-y-2">
            {(health?.components ?? []).map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                <div>
                  <p className="text-[13px] font-medium text-white">{item.id}</p>
                  <p className="text-[11px] text-white/45">{item.detail}</p>
                </div>
                <span className={`text-[11px] font-semibold ${TONE[item.status] ?? TONE.unknown}`}>{item.status}</span>
              </li>
            ))}
            {(health?.components.length ?? 0) === 0 ? <li className="text-[12px] text-white/45">Sin lectura de salud.</li> : null}
          </ul>
        </Panel>
        <Panel className="xl:col-span-5" title="Suministro">
          <ul className="space-y-2 text-[13px] text-white/75">
            <li className="flex items-center justify-between">Modo <StatusPill>{base?.supply.mode ?? '—'}</StatusPill></li>
            <li className="flex justify-between">Escritura <b>{health?.supplyWriteEnabled ? 'encendida' : 'apagada'}</b></li>
            <li className="flex justify-between">Descubiertos <b>{num(hunter?.discovered)}</b></li>
            <li className="flex justify-between">Verificados <b>{num(hunter?.verified)}</b></li>
            <li className="flex justify-between">Listos para aprobar <b>{num(base?.supply.approvalReady)}</b></li>
          </ul>
        </Panel>
      </div>
    </VistaShell>
  );
}
