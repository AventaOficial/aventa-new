'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Heart, Hourglass, Tag } from 'lucide-react';
import VistaShell from '../shell';
import { Columns, DateChip, Donut, Ghost, KpiCard, LineChart, Panel, PeriodBar, wave } from '../ui';

const RECENT = [
  { offer: 'AirPods Pro 2 · 30%', author: '@techlover', cat: 'Electrónicos', state: 'Aprobada', age: '12 min' },
  { offer: 'Zapatillas Nike · 40%', author: '@modafans', cat: 'Moda', state: 'Aprobada', age: '28 min' },
  { offer: 'Monitor 27" 165Hz', author: '@gamerpro', cat: 'Videojuegos', state: 'Pendiente', age: '42 min' },
  { offer: 'Freidora de aire · 30%', author: '@hogarplus', cat: 'Hogar', state: 'Aprobada', age: '1 h' },
  { offer: 'Perfume Dior · 25%', author: '@beautyshop', cat: 'Belleza', state: 'Rechazada', age: '2 h' },
];

const TONE: Record<string, string> = {
  Aprobada: 'bg-emerald-500/15 text-emerald-300',
  Pendiente: 'bg-amber-500/15 text-amber-300',
  Rechazada: 'bg-rose-500/15 text-rose-300',
};

export default function OfertasVistaPage() {
  const [estado, setEstado] = useState('Todos');
  const [cat, setCat] = useState('Todas');
  const rows = useMemo(
    () => RECENT.filter((r) => (estado === 'Todos' || r.state === estado) && (cat === 'Todas' || r.cat === cat)),
    [estado, cat],
  );
  return (
    <VistaShell
      title="Ofertas publicadas"
      crumb="Ofertas publicadas"
      subtitle="Gestión, moderación y rendimiento de las ofertas publicadas en Aventa."
      toolbar={
        <>
          <DateChip />
          <PeriodBar />
          <Ghost href="/admin/moderation">Ver todas las ofertas</Ghost>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={Tag} tint="bg-violet-500/20 text-violet-200" label="Ofertas publicadas (hoy)" value="74" delta="18%" up />
        <KpiCard icon={CheckCircle2} tint="bg-emerald-500/15 text-emerald-200" label="Aprobadas" value="58" sub="78% del total" delta="12%" up />
        <KpiCard icon={Hourglass} tint="bg-amber-500/15 text-amber-200" label="Pendientes" value="11" sub="15% del total" delta="25%" up={false} />
        <KpiCard icon={Heart} tint="bg-rose-500/15 text-rose-200" label="Rechazadas" value="5" sub="7% del total" delta="17%" up={false} />
        <KpiCard icon={Clock} tint="bg-sky-500/15 text-sky-200" label="Tiempo promedio de moderación" value="2h 14m" delta="32%" up={false} />
        <KpiCard icon={CheckCircle2} tint="bg-violet-500/15 text-violet-200" label="Tasa de aprobación" value="78%" delta="6%" up />
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Evolución de ofertas" extra={<Ghost>Últimos 7 días</Ghost>}>
          <LineChart
            series={[
              { name: 'Publicadas', values: wave(14, 1, 70, 12), color: '#a78bfa' },
              { name: 'Aprobadas', values: wave(14, 2, 52, 8), color: '#34d399' },
              { name: 'Pendientes', values: wave(14, 3, 14, 4), color: '#fbbf24' },
              { name: 'Rechazadas', values: wave(14, 4, 6, 2), color: '#fb7185' },
            ]}
            labels={['26 sep', '29 sep', '2 oct']}
          />
          <ul className="mt-2 flex flex-wrap gap-3 text-[10px] text-white/50">
            <li>Publicadas</li><li>Aprobadas</li><li>Pendientes</li><li>Rechazadas</li>
          </ul>
        </Panel>
        <Panel className="xl:col-span-3" title="Estado de las ofertas (hoy)">
          <div className="flex items-center gap-4">
            <Donut parts={[{ pct: 78, color: '#34d399' }, { pct: 15, color: '#fbbf24' }, { pct: 7, color: '#fb7185' }]}>
              <span className="text-[22px] font-semibold text-white">74</span>
              <span className="text-[10px] text-white/45">ofertas totales</span>
            </Donut>
            <ul className="space-y-1.5 text-[12px] text-white/70">
              <li>Aprobadas · 58 (78%)</li>
              <li>Pendientes · 11 (15%)</li>
              <li>Rechazadas · 5 (7%)</li>
            </ul>
          </div>
        </Panel>
        <Panel className="xl:col-span-4" title="Ofertas por categoría" extra={<Ghost>Hoy</Ghost>}>
          <Columns values={[18, 14, 12, 8, 7, 6, 5, 4]} labels={['Electrónicos', 'Moda', 'Hogar', 'Videojuegos', 'Belleza', 'Otros', 'Deportes', 'Salud']} />
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Rank title="Top ofertas por votos" metric="Votos" rows={[['AirPods Pro 2 · 30%', '482', 'Aprobada'], ['Nintendo Switch OLED', '421', 'Aprobada'], ['Nike Air Max 50%', '398', 'Aprobada'], ['Monitor 27" 165Hz', '356', 'Aprobada'], ['PlayStation 5 Slim', '312', 'Aprobada']]} />
        <Rank title="Top ofertas por clicks" metric="Clicks" rows={[['iPhone 15 Pro · 20%', '1,284', 'Aprobada'], ['Zapatillas Nike · 40%', '982', 'Aprobada'], ['Xbox Series X · 15%', '721', 'Aprobada'], ['Freidora de aire · 30%', '689', 'Aprobada'], ['Perfume Dior · 25%', '612', 'Aprobada']]} />
        <Rank title="Top ofertas por comisión estimada" metric="Comisión est." rows={[['MacBook Air M3', '$ 4,320.50', 'Aprobada'], ['iPhone 15 Pro · 20%', '$ 3,820.10', 'Aprobada'], ['PlayStation 5 Slim', '$ 2,450.30', 'Aprobada'], ['Nintendo Switch OLED', '$ 2,110.40', 'Aprobada'], ['Monitor 27" 165Hz', '$ 1,780.20', 'Aprobada']]} />
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Ofertas recientes" extra={<Ghost href="/admin/moderation">Ver todas</Ghost>}>
          <table className="w-full text-left text-[11px]">
            <thead className="text-white/40"><tr>{['Oferta', 'Autor', 'Categoría', 'Estado', 'Hace'].map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.offer} className="border-t border-white/[0.04] text-white/80">
                  <td className="py-1.5 pr-2">{r.offer}</td>
                  <td>{r.author}</td>
                  <td>{r.cat}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[r.state]}`}>{r.state}</span></td>
                  <td className="text-white/45">{r.age}</td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={5} className="py-3 text-white/40">Ninguna oferta de la composición coincide con el filtro.</td></tr> : null}
            </tbody>
          </table>
        </Panel>
        <Panel className="xl:col-span-4" title="Actividad de moderación" extra={<Ghost href="/admin/owner/vista/equipos/moderacion">Ver todas</Ghost>}>
          <ul className="space-y-2 text-[12px] text-white/75">
            {[
              ['Ana Torres', 'Aprobó una oferta', 'AirPods Pro 2 · 30%', '12 min'],
              ['Carlos Mendoza', 'Rechazó una oferta', 'Cafetera · 15%', '18 min'],
              ['Diego Ruiz', 'Aprobó una oferta', 'Zapatillas Nike · 40%', '28 min'],
              ['Sofía García', 'Rechazó una oferta', 'Enlace inválido', '35 min'],
              ['Luis Herrera', 'Aprobó una oferta', 'Monitor 27" 165Hz', '42 min'],
            ].map(([who, what, item, age]) => (
              <li key={who + item} className="flex items-baseline justify-between gap-2 border-t border-white/[0.04] pt-1.5">
                <span><b className="text-white">{who}</b> · {what} · <span className="text-white/50">{item}</span></span>
                <span className="shrink-0 text-[10px] text-white/35">{age}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="xl:col-span-3" title="Filtro y búsqueda" extra={<button type="button" className="text-[10px] text-white/45" onClick={() => { setEstado('Todos'); setCat('Todas'); }}>Limpiar</button>}>
          <label className="block text-[10px] text-white/45">
            Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#10101a] px-2 py-1.5 text-[12px] text-white">
              {['Todos', 'Aprobada', 'Pendiente', 'Rechazada'].map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
          <label className="mt-2 block text-[10px] text-white/45">
            Categoría
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#10101a] px-2 py-1.5 text-[12px] text-white">
              {['Todas', 'Electrónicos', 'Moda', 'Videojuegos', 'Hogar', 'Belleza'].map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
          <p className="mt-3 text-[10px] leading-snug text-white/35">Filtra la lista de ofertas recientes de esta composición. No consulta la base.</p>
        </Panel>
      </div>
    </VistaShell>
  );
}

function Rank({ title, metric, rows }: { title: string; metric: string; rows: string[][] }) {
  return (
    <Panel title={title} extra={<Ghost>Ver todas</Ghost>}>
      <table className="w-full text-left text-[11px]">
        <thead className="text-white/40"><tr><th className="pb-2 font-medium">#</th><th>Oferta</th><th>{metric}</th><th>Estado</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r[0]} className="border-t border-white/[0.04] text-white/80">
              <td className="py-1.5 text-white/40">{i + 1}</td>
              <td>{r[0]}</td>
              <td className="tabular-nums">{r[1]}</td>
              <td><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[r[2]] ?? ''}`}>{r[2]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
