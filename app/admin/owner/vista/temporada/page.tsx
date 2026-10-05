'use client';

import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import VistaShell from '../shell';
import { Ghost, Panel, StatusPill } from '../ui';
import { useVista } from '../live';

export default function TemporadaVistaPage() {
  const { data } = useVista();
  const source = data.announcements;
  const rows = source.data ?? [];
  const active = rows.filter((row) => row.active);
  return (
    <VistaShell
      title="Siguiente temporada"
      crumb="Siguiente temporada"
      subtitle="Los avisos activos del sitio. No hay una campaña con porcentajes inventados."
      toolbar={<Ghost href="/admin/announcements">Abrir avisos</Ghost>}
    >
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Avisos activos" icon={CalendarDays}>
          <p className="text-[32px] font-semibold tabular-nums text-white">{source.status === 'loading' ? '—' : active.length}</p>
          <p className="mt-1 text-[12px] text-white/45">{rows.length} avisos en total</p>
          <div className="mt-3"><StatusPill>{active.length ? 'Hay avisos en el sitio' : 'Sin avisos activos'}</StatusPill></div>
        </Panel>
        <Panel className="xl:col-span-8" title="Lista">
          {rows.length === 0 ? <p className="text-[12px] text-white/45">No hay avisos. Se crean en la herramienta de anuncios.</p> : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                  <div>
                    <p className="text-[13px] text-white">{row.title}</p>
                    <p className="text-[11px] text-white/40">{row.updated_at ?? 'Sin fecha'}</p>
                  </div>
                  {row.link ? <Link href={row.link} className="text-[11px] text-violet-300">Abrir</Link> : <span className="text-[11px] text-white/40">{row.active ? 'Activo' : 'Inactivo'}</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </VistaShell>
  );
}
