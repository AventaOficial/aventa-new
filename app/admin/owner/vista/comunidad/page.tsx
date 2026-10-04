'use client';

import { Flag, Heart, MessageCircle, Tag, ThumbsUp, User } from 'lucide-react';
import VistaShell from '../shell';
import { Columns, DateChip, Donut, Ghost, KpiCard, LineChart, Panel, PeriodBar, wave } from '../ui';

export default function ComunidadVistaPage() {
  return (
    <VistaShell
      title="Actividad de la comunidad"
      crumb="Actividad de la comunidad"
      subtitle="Publicaciones, votos, comentarios y participación de la comunidad."
      toolbar={<><DateChip /><PeriodBar /></>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={Tag} tint="bg-violet-500/20 text-violet-200" label="Ofertas publicadas" value="74" delta="18%" up />
        <KpiCard icon={ThumbsUp} tint="bg-sky-500/15 text-sky-200" label="Votos" value="1,284" delta="12%" up />
        <KpiCard icon={MessageCircle} tint="bg-cyan-500/15 text-cyan-200" label="Comentarios" value="326" delta="9%" up />
        <KpiCard icon={Heart} tint="bg-rose-500/15 text-rose-200" label="Favoritos" value="418" delta="6%" up />
        <KpiCard icon={Flag} tint="bg-amber-500/15 text-amber-200" label="Reportes" value="23" delta="4" up={false} />
        <KpiCard icon={User} tint="bg-emerald-500/15 text-emerald-200" label="Cazadores activos" value="46" delta="8%" up />
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Actividad de la semana" extra={<Ghost>Últimos 7 días</Ghost>}>
          <LineChart
            series={[
              { values: wave(14, 1, 70, 14), color: '#a78bfa' },
              { values: wave(14, 2, 30, 8), color: '#22d3ee' },
              { values: wave(14, 3, 18, 5), color: '#fb7185' },
            ]}
            labels={['26 sep', '29 sep', '2 oct']}
          />
        </Panel>
        <Panel className="xl:col-span-3" title="Mix de interacciones">
          <div className="flex items-center gap-3">
            <Donut parts={[{ pct: 60, color: '#a78bfa' }, { pct: 20, color: '#22d3ee' }, { pct: 20, color: '#fb7185' }]}>
              <span className="text-[16px] font-semibold text-white">2,028</span>
            </Donut>
            <ul className="space-y-1 text-[12px] text-white/70">
              <li>Votos · 1,284</li>
              <li>Comentarios · 326</li>
              <li>Favoritos · 418</li>
            </ul>
          </div>
        </Panel>
        <Panel className="xl:col-span-4" title="Por hora" extra={<Ghost href="/admin/owner/crecimiento">Ver crecimiento</Ghost>}>
          <Columns values={wave(16, 4, 40, 18)} labels={['00', '08', '16', '23']} />
        </Panel>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Temas con más movimiento" extra={<Ghost href="/plaza">Abrir Plaza</Ghost>}>
          <List rows={[['Ofertas del día', '48 mensajes', '8 min'], ['Dudas de cupones', '17 mensajes', '20 min'], ['Feedback de la app', '11 mensajes', '1 h'], ['Cazas de la semana', '9 mensajes', '2 h']]} />
        </Panel>
        <Panel title="Reportes recientes" extra={<Ghost href="/admin/moderation/reports">Ver reportes</Ghost>}>
          <List rows={[['Enlace roto', 'Electrónicos', '15 min'], ['Spam', 'Plaza', '40 min'], ['Oferta falsa', 'Moda', '1 h'], ['Contenido inapropiado', 'Comentario', '3 h']]} />
        </Panel>
      </div>
    </VistaShell>
  );
}

function List({ rows }: { rows: string[][] }) {
  return (
    <ul>
      {rows.map((r) => (
        <li key={r[0]} className="flex items-center justify-between gap-2 border-t border-white/[0.04] py-2 text-[12px] text-white/80">
          <span>{r[0]}</span>
          <span className="text-white/45">{r[1]}</span>
          <span className="text-white/35">{r[2]}</span>
        </li>
      ))}
    </ul>
  );
}
