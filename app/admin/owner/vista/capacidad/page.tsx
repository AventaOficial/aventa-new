'use client';

import { Cpu, Gauge as GaugeIcon, HardDrive, Mail, Server, Users, Zap } from 'lucide-react';
import VistaShell from '../shell';
import { Columns, DateChip, Donut, Gauge, Ghost, KpiCard, LineChart, Panel, Spark, StatusPill, Thin, wave } from '../ui';

const SERVICES = [
  ['Vercel (Frontend)', '99.98%'],
  ['Supabase (Database)', '99.99%'],
  ['Supabase Auth', '99.99%'],
  ['Supabase Storage', '99.97%'],
  ['Upstash Redis', '99.98%'],
  ['Resend (Emails)', '99.98%'],
  ['Railway (Workers)', '99.94%'],
];

const JOBS = [
  ['Discovery Worker (IA)', 'Hace 12 min'],
  ['Quality Gate', 'Hace 8 min'],
  ['Precio Memory', 'Hace 1 h'],
  ['Sitemap & Indexación', 'Hace 2 h'],
  ['Envío de emails', 'Hace 3 h'],
  ['Limpieza de datos', 'Hace 6 h'],
  ['Backups', 'Hace 12 h'],
];

const COUNTRIES = [
  ['México', 46],
  ['Estados Unidos', 18],
  ['España', 9],
  ['Colombia', 6],
  ['Argentina', 4],
  ['Otros', 21],
];

const ENDPOINTS = [
  ['/api/offers', '120', '280 ms'],
  ['/api/search', '84', '310 ms'],
  ['/api/votes', '61', '190 ms'],
  ['/api/auth', '48', '240 ms'],
  ['/api/affiliate', '36', '240 ms'],
];

export default function CapacidadVistaPage() {
  return (
    <VistaShell
      title="Capacidad de Aventa"
      crumb="Capacidad de Aventa"
      subtitle="Monitoreo en tiempo real de la infraestructura, servicios y rendimiento del sistema."
      toolbar={
        <>
          <DateChip />
          <StatusPill>Operando normalmente</StatusPill>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard icon={Users} tint="bg-violet-500/20 text-violet-200" label="Usuarios simultáneos" value="1,284 / 3,000" sub="43%" delta="12%" up bar={43} />
        <KpiCard icon={Zap} tint="bg-sky-500/15 text-sky-200" label="Requests por minuto" value="320 / 1,000" sub="32%" delta="8%" up bar={32} />
        <KpiCard icon={Mail} tint="bg-emerald-500/15 text-emerald-200" label="Correos enviados (h)" value="180 / 2,000" sub="9%" delta="4%" up bar={9} />
        <KpiCard icon={Cpu} tint="bg-amber-500/15 text-amber-200" label="Procesamiento IA (h)" value="37 / 200" sub="19%" delta="18%" up bar={19} />
        <KpiCard icon={HardDrive} tint="bg-indigo-500/15 text-indigo-200" label="Storage (Supabase)" value="12.4 GB / 100 GB" sub="12%" delta="6%" up bar={12} />
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Usuarios en tiempo real" icon={Users} extra={<Ghost>Últimas 24 horas</Ghost>}>
          <p className="text-[28px] font-semibold tabular-nums text-white">1,284</p>
          <p className="text-[11px] text-emerald-300">En línea ahora · pico 1,842 a las 12:42</p>
          <LineChart series={[{ values: wave(24, 2, 900, 280), color: '#a78bfa' }]} labels={['00:00', '08:00', '16:00', '20:00']} />
          <ul className="mt-2 grid grid-cols-2 gap-x-4 text-[11px] text-white/60">
            {[['Home', '28%'], ['Explorar', '22%'], ['Oferta', '18%'], ['Buscar', '14%'], ['Perfil', '8%'], ['Otras', '10%']].map(([n, p]) => (
              <li key={n} className="flex justify-between border-t border-white/[0.04] py-1"><span>{n}</span><b className="text-white/80">{p}</b></li>
            ))}
          </ul>
        </Panel>
        <Panel className="xl:col-span-3" title="Capacidad estimada" icon={GaugeIcon}>
          <Gauge pct={57}>
            <p className="text-[20px] font-semibold text-white">3,000</p>
            <p className="text-[10px] text-white/45">usuarios simultáneos</p>
          </Gauge>
          <p className="mt-1 text-center text-[12px] text-white/70">Margen restante <b className="text-white">57%</b></p>
          <div className="mt-2 flex justify-center">
            <StatusPill>Operando normalmente</StatusPill>
          </div>
          <ul className="mt-3 space-y-1.5 text-[12px] text-white/70">
            <li>Si llegamos a 2,500 · Revisar infraestructura</li>
            <li>Si llegamos a 3,000 · Escalar recursos</li>
          </ul>
        </Panel>
        <Panel className="xl:col-span-4" title="Tiempo de respuesta" extra={<Ghost>Últimas 24 horas</Ghost>}>
          <p className="text-[28px] font-semibold tabular-nums text-white">342 ms</p>
          <p className="mb-2 text-[11px] text-rose-300">↓ 18% vs. ayer</p>
          <LineChart series={[{ values: wave(24, 5, 340, 40), color: '#67e8f9' }]} labels={['00:00', '08:00', '16:00', '20:00']} />
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Estado de servicios" icon={Server}>
          <p className="mb-2 text-[12px] text-emerald-300">Todos los servicios operando</p>
          <ul className="space-y-1.5">
            {SERVICES.map(([name, pct]) => (
              <li key={name} className="flex items-center gap-2 text-[12px]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-white/75">{name}</span>
                <span className="text-[10px] text-emerald-300">Operativo</span>
                <b className="w-12 text-right tabular-nums text-white/80">{pct}</b>
                <Spark values={wave(8, name.length, 99, 0.4)} />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="xl:col-span-3" title="Recursos del sistema" extra={<Ghost>Actualizar</Ghost>}>
          <div className="grid grid-cols-2 gap-3">
            {[['CPU', 28], ['RAM', 42], ['DB Connections', 18], ['Disk Usage', 12]].map(([name, pct]) => (
              <div key={String(name)}>
                <div className="flex items-center justify-between text-[12px]"><span className="text-white/70">{name}</span><b className="text-white">{pct}%</b></div>
                <Thin pct={Number(pct)} />
                <Columns values={wave(10, Number(pct), 20, 8)} height={36} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="xl:col-span-4" title="Cargas y procesos" extra={<Ghost href="/admin/operaciones">Ver todos</Ghost>}>
          <ul className="space-y-2">
            {JOBS.map(([name, age]) => (
              <li key={name} className="flex items-center gap-2 text-[12px]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-white/80">{name}</span>
                <span className="text-[10px] text-emerald-300">Ejecutándose</span>
                <span className="text-[10px] text-white/35">{age}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Errores y alertas" extra={<Ghost>Últimas 24 horas</Ghost>}>
          <div className="grid grid-cols-4 gap-2">
            {[
              ['5', 'Errores 5xx', '50%', false],
              ['12', 'Errores 4xx', '20%', false],
              ['37', 'Rate limit', '35%', true],
              ['0', 'Caídas de servicio', '', null],
            ].map(([n, l, d, up]) => (
              <div key={String(l)} className="rounded-xl bg-white/[0.03] p-2">
                <p className="text-[20px] font-semibold text-white">{n}</p>
                <p className="text-[10px] leading-tight text-white/45">{l}</p>
                {d ? <p className={up ? 'text-[10px] text-rose-300' : 'text-[10px] text-emerald-300'}>{up ? '↑' : '↓'} {d}</p> : null}
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="xl:col-span-4" title="Tráfico por país" extra={<Ghost>Ver todos</Ghost>}>
          <div className="flex gap-3">
            <Donut parts={COUNTRIES.map(([, p], i) => ({ pct: Number(p), color: ['#7c3aed', '#a78bfa', '#c4b5fd', '#22d3ee', '#34d399', '#64748b'][i] }))} size={108} stroke={12}>
              <span className="text-[10px] text-white/50">Países</span>
            </Donut>
            <ul className="min-w-0 flex-1 space-y-1">
              {COUNTRIES.map(([name, pct]) => (
                <li key={String(name)} className="flex items-center gap-2 text-[12px] text-white/75">
                  <span className="flex-1 truncate">{name}</span>
                  <b className="tabular-nums text-white">{pct}%</b>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
        <Panel className="xl:col-span-4" title="Top endpoints (carga)" extra={<Ghost>Ver todos</Ghost>}>
          <table className="w-full text-left text-[11px]">
            <thead className="text-white/40"><tr><th className="pb-2 font-medium">#</th><th>Endpoint</th><th>Requests/min</th><th>Tiempo</th></tr></thead>
            <tbody>
              {ENDPOINTS.map((r, i) => (
                <tr key={r[0]} className="border-t border-white/[0.04] text-white/80">
                  <td className="py-1.5 text-white/40">{i + 1}</td>
                  <td className="font-mono text-[10.5px]">{r[0]}</td>
                  <td className="tabular-nums">{r[1]}</td>
                  <td className="tabular-nums text-emerald-300">{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </VistaShell>
  );
}
