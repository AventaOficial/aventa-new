'use client';

import { Zap } from 'lucide-react';
import VistaShell from '../shell';
import { DateChip, Ghost, Panel } from '../ui';

const COLS: { title: string; tone: string; items: { n: string; text: string; team: string; action: string }[] }[] = [
  {
    title: 'Crítico',
    tone: 'text-rose-300',
    items: [
      { n: '11', text: 'Ofertas pendientes con más de 6 horas en cola.', team: 'Moderación', action: 'Revisar' },
      { n: '1', text: 'Tienda con tracking intermitente.', team: 'Growth', action: 'Investigar' },
    ],
  },
  {
    title: 'Alto',
    tone: 'text-orange-300',
    items: [
      { n: '23', text: 'Reportes de comunidad sin revisar.', team: 'Comunidad', action: 'Abrir' },
      { n: '6', text: 'Pagos en revisión.', team: 'Finanzas', action: 'Ver lote' },
      { n: '3', text: 'Ofertas con baja conversión.', team: 'Growth', action: 'Revisar' },
    ],
  },
  {
    title: 'Medio',
    tone: 'text-amber-300',
    items: [
      { n: '42%', text: 'Preparación de Halloween a medias.', team: 'Temporada', action: 'Continuar' },
      { n: '4', text: 'Escrituras todavía en cola.', team: 'Operaciones', action: 'Ver cola' },
      { n: '310 ms', text: 'El endpoint de búsqueda es el más lento.', team: 'Producto', action: 'Medir' },
    ],
  },
];

export default function PrioridadesVistaPage() {
  return (
    <VistaShell
      title="Prioridades del CEO"
      crumb="Prioridades del CEO"
      subtitle="Lo que conviene decidir ahora: delegar, revisar o investigar."
      toolbar={<><DateChip /><Ghost href="/admin/owner">Volver al tablero</Ghost></>}
    >
      <div className="grid gap-3 lg:grid-cols-3">
        {COLS.map((col) => (
          <Panel key={col.title} title={col.title} icon={Zap}>
            <ul className="space-y-2">
              {col.items.map((item) => (
                <li key={item.text} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <b className={`text-[18px] tabular-nums ${col.tone}`}>{item.n}</b>
                    <span className="text-[10px] text-white/40">{item.team}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-white/80">{item.text}</p>
                  <p className="mt-2 text-[11px] font-semibold text-violet-200">{item.action}</p>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </VistaShell>
  );
}
