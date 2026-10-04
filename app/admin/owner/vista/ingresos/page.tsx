'use client';

import { CircleDollarSign, ShoppingCart, Tag, PieChart, User, BarChart3, Bell, Lightbulb } from 'lucide-react';
import VistaShell from '../shell';
import { Columns, DateChip, Delta, Donut, Ghost, KpiCard, LineChart, Panel, PeriodBar, Thin } from '../ui';

const LINE = [8, 9, 11, 10, 12, 13, 12, 14, 15, 14, 16, 15, 17, 16, 18, 17, 19, 18, 20, 19, 21, 20, 22, 21, 23, 22, 24, 23, 25, 26];
const GMV = [40, 48, 44, 52, 60, 55, 70, 66, 80, 74, 90, 84, 96, 88, 110, 102, 120, 114, 130, 122, 140, 136, 150, 144, 160, 155, 170, 166, 180, 190];
const COM = GMV.map((n) => Math.round(n * 0.06));

const STORES = [
  ['1', 'Amazon', '$ 112,540.00', '$ 6,752.40', '+22%'],
  ['2', 'Mercado Libre', '$ 68,330.00', '$ 4,099.80', '+18%'],
  ['3', 'Nike', '$ 42,180.00', '$ 2,953.50', '+35%'],
  ['4', 'Liverpool', '$ 28,420.00', '$ 1,704.90', '-12%'],
  ['5', 'AliExpress', '$ 24,330.00', '$ 1,460.20', '+28%'],
];

const OFFERS = [
  ['1', 'AirPods Pro 2 · 30%', 'Amazon', '1,248', '$ 4,320.50'],
  ['2', 'Nintendo Switch OLED', 'Mercado Libre', '892', '$ 3,210.00'],
  ['3', 'Nike Air Max 50%', 'Nike', '721', '$ 2,880.30'],
  ['4', 'Monitor 27" 165Hz', 'Amazon', '612', '$ 2,450.10'],
  ['5', 'PlayStation 5 Slim', 'Liverpool', '689', '$ 2,110.40'],
];

const CATS = [
  ['Electrónicos', '$ 148,420.00', '$ 8,520.30', 46],
  ['Moda', '$ 72,330.00', '$ 4,210.20', 23],
  ['Hogar', '$ 39,420.00', '$ 2,340.10', 12],
  ['Videojuegos', '$ 26,510.00', '$ 1,520.80', 8],
  ['Belleza', '$ 18,420.00', '$ 1,080.30', 6],
  ['Otros', '$ 8,440.00', '$ 748.80', 5],
];

export default function IngresosVistaPage() {
  return (
    <VistaShell
      title="Ingresos estimados"
      crumb="Ingresos estimados"
      subtitle="Rendimiento de la monetización y economía de afiliación."
      toolbar={
        <>
          <DateChip />
          <PeriodBar />
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={CircleDollarSign} tint="bg-violet-500/20 text-violet-200" label="Ingresos estimados (hoy)" value="$ 18,420.50" delta="18.4%" up />
        <KpiCard icon={ShoppingCart} tint="bg-fuchsia-500/15 text-fuchsia-200" label="GMV generado (hoy)" value="$ 312,540.00" delta="12%" up />
        <KpiCard icon={Tag} tint="bg-emerald-500/15 text-emerald-200" label="Comisiones generadas (hoy)" value="$ 18,420.50" delta="18%" up />
        <KpiCard icon={PieChart} tint="bg-violet-500/15 text-violet-200" label="Parte Aventa (30%)" value="$ 5,526.15" delta="18%" up />
        <KpiCard icon={User} tint="bg-sky-500/15 text-sky-200" label="Parte usuarios (70%)" value="$ 12,894.35" delta="18%" up />
        <KpiCard icon={BarChart3} tint="bg-indigo-500/15 text-indigo-200" label="EPC (ganancia por click)" value="$ 1.48" delta="12%" up />
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Ingresos estimados" icon={CircleDollarSign} extra={<Ghost>Últimos 30 días</Ghost>}>
          <p className="text-[22px] font-semibold tabular-nums text-white">$ 18,420.50</p>
          <p className="mb-2 mt-1">
            <Delta text="18.4%" up />
          </p>
          <LineChart series={[{ values: LINE, color: '#a78bfa' }]} labels={['2 sep', '17 sep', '2 oct']} />
        </Panel>
        <Panel className="xl:col-span-4" title="Desglose de ingresos" icon={PieChart} extra={<Ghost>Hoy</Ghost>}>
          <div className="flex flex-wrap items-center gap-4">
            <Donut parts={[{ pct: 30, color: '#8b5cf6' }, { pct: 70, color: '#c4b5fd' }]}>
              <span className="text-[13px] font-semibold tabular-nums text-white">$ 18,420.50</span>
              <span className="text-[10px] text-white/45">Total estimado</span>
            </Donut>
            <ul className="min-w-0 flex-1 space-y-2 text-[12px]">
              <li className="flex justify-between gap-3 text-white/70"><span>Comisiones brutas</span><b className="text-white">$ 18,420.50 · 100%</b></li>
              <li className="flex justify-between gap-3 text-white/70"><span>Parte Aventa (30%)</span><b className="text-white">$ 5,526.15 · 30%</b></li>
              <li className="flex justify-between gap-3 text-white/70"><span>Parte usuarios (70%)</span><b className="text-white">$ 12,894.35 · 70%</b></li>
            </ul>
          </div>
        </Panel>
        <Panel className="xl:col-span-4" title="GMV y comisiones" icon={BarChart3} extra={<Ghost>Últimos 30 días</Ghost>}>
          <Columns values={GMV} color="#7c3aed" labels={['2 sep', '17 sep', '2 oct']} />
          <p className="mt-1 text-[10px] text-white/40">Comisiones en la serie corta: {COM[COM.length - 1].toLocaleString('es-MX')}</p>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Métricas de conversión" extra={<Ghost>Hoy</Ghost>}>
          <ol className="grid grid-cols-4 gap-2">
            {[
              ['Visitas a ofertas', '12,482', '100%'],
              ['Clicks a tienda', '4,821', '38.6%'],
              ['Conversiones (estimadas)', '312', '6.5%'],
              ['Comisión estimada', '$ 18,420.50', '$ 1.48 EPC'],
            ].map(([l, v, s]) => (
              <li key={l} className="rounded-xl bg-white/[0.03] px-2 py-2">
                <p className="text-[10px] leading-tight text-white/45">{l}</p>
                <p className="mt-1 text-[14px] font-semibold tabular-nums text-white">{v}</p>
                <p className="text-[10px] text-violet-300">{s}</p>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel className="xl:col-span-4" title="Top tiendas por ingresos" extra={<Ghost href="/admin/owner/vista/ofertas">Ver todas</Ghost>}>
          <Table head={['#', 'Tienda', 'GMV', 'Comisión', 'Tendencia']} rows={STORES} lastUp />
        </Panel>
        <Panel className="xl:col-span-4" title="Top ofertas por ingresos" extra={<Ghost href="/admin/owner/vista/ofertas">Ver todas</Ghost>}>
          <Table head={['#', 'Oferta', 'Tienda', 'Clicks', 'Comisión']} rows={OFFERS} />
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Rendimiento por categoría" extra={<Ghost>Hoy</Ghost>}>
          <table className="w-full text-left text-[11px]">
            <thead className="text-white/40">
              <tr>{['Categoría', 'GMV', 'Comisión', '% del total'].map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {CATS.map(([name, gmv, com, pct]) => (
                <tr key={String(name)} className="border-t border-white/[0.04] text-white/75">
                  <td className="py-1.5">{name}</td>
                  <td className="tabular-nums">{gmv}</td>
                  <td className="tabular-nums">{com}</td>
                  <td className="w-24"><Thin pct={Number(pct)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel className="xl:col-span-3" title="Proyección mensual" extra={<Ghost>Octubre 2026</Ghost>}>
          <p className="text-[22px] font-semibold tabular-nums text-white">$ 542,310</p>
          <p className="text-[11px] text-white/45">72% de la meta · $ 750,000</p>
          <div className="mt-2"><Thin pct={72} /></div>
          <Columns values={GMV.slice(0, 16)} height={88} labels={['1 oct', '31 oct']} />
        </Panel>
        <Panel className="xl:col-span-3" title="Alertas y estado" icon={Bell} extra={<Ghost>Ver todas</Ghost>}>
          <ul className="space-y-2 text-[12px]">
            <Note tone="ok" text="Tracking funcionando correctamente" age="Hace 12 min" />
            <Note tone="ok" text="EPC 12% mayor que ayer" age="Hace 1 h" />
            <Note tone="warn" text="3 ofertas con baja conversión" age="Hace 2 h" />
            <Note tone="bad" text="1 tienda con tracking intermitente · AliExpress" age="Hace 3 h" />
          </ul>
        </Panel>
        <Panel className="xl:col-span-2" title="Oportunidades" icon={Lightbulb} extra={<Ghost>Ver más</Ghost>}>
          <ul className="space-y-2 text-[12px]">
            <Note tone="ok" text="Aumentar contenido en Electrónicos · +18%" />
            <Note tone="ok" text="Mejorar conversiones en Moda" />
            <Note tone="warn" text="Activar más ofertas en Super.mx" />
            <Note tone="bad" text="Crear campaña Especial Halloween · +25%" />
          </ul>
        </Panel>
      </div>
    </VistaShell>
  );
}

function Table({ head, rows, lastUp = false }: { head: string[]; rows: string[][]; lastUp?: boolean }) {
  return (
    <table className="w-full text-left text-[11px]">
      <thead className="text-white/40">
        <tr>{head.map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.join('|')} className="border-t border-white/[0.04] text-white/80">
            {r.map((cell, i) => (
              <td key={i} className="py-1.5 pr-2 tabular-nums">
                {lastUp && i === r.length - 1 ? <Delta text={cell.replace('+', '').replace('-', '')} up={!cell.startsWith('-')} suffix="" /> : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Note({ tone, text, age }: { tone: 'ok' | 'warn' | 'bad'; text: string; age?: string }) {
  const dot = tone === 'ok' ? 'bg-emerald-400' : tone === 'warn' ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="min-w-0 flex-1 text-white/75">{text}</span>
      {age ? <span className="shrink-0 text-[10px] text-white/35">{age}</span> : null}
    </li>
  );
}
