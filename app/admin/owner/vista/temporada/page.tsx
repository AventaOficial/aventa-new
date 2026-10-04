'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Check, Flag, Lightbulb, Target } from 'lucide-react';
import VistaShell from '../shell';
import { Columns, Donut, Ghost, Panel, Thin } from '../ui';

const START = new Date('2026-10-15T00:00:00-06:00').getTime();

function useCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const diff = Math.max(0, START - now);
  return {
    live: diff > 0,
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    min: Math.floor((diff % 3_600_000) / 60_000),
    sec: Math.floor((diff % 60_000) / 1000),
  };
}

const PHASES = [
  ['Contenido', 80, '#34d399'],
  ['Ofertas', 60, '#a78bfa'],
  ['Moderación', 40, '#8b5cf6'],
  ['Banners', 30, '#c4b5fd'],
  ['Videos', 20, '#818cf8'],
  ['Landing', 0, '#64748b'],
];

const CATS = [
  ['Disfraces', 120, 24],
  ['Decoración', 100, 20],
  ['Electrónicos', 80, 16],
  ['Videojuegos', 60, 12],
  ['Hogar', 50, 10],
  ['Moda', 40, 8],
  ['Juguetes', 30, 6],
  ['Otros', 20, 4],
];

const CHECKS: [string, string, boolean][] = [
  ['Investigar tendencias y keywords', '1/1', true],
  ['Subir 30 ofertas iniciales', '30/30', true],
  ['Crear 10 videos de publicidad', '10/10', true],
  ['Diseñar banners principales', '2/5', false],
  ['Configurar landing de temporada', '0/1', false],
  ['Preparar campaña de emails/push', '0/1', false],
  ['Revisar moderación y reglas especiales', '0/1', false],
  ['Verificar tracking y enlaces de afiliado', '0/1', false],
];

const KEYWORDS = [
  ['Disfraces de Halloween', '100', '+250%'],
  ['Decoración Halloween', '85', '+180%'],
  ['Halloween electrónica', '72', '+120%'],
  ['Cañón de dulces', '68', '+95%'],
  ['Máscaras de Halloween', '64', '+90%'],
];

export default function TemporadaVistaPage() {
  const t = useCountdown();
  const [tab, setTab] = useState('Todos');
  return (
    <VistaShell
      title="Siguiente temporada de ofertas"
      crumb="Siguiente temporada de ofertas"
      subtitle="Planificación, contenido y ejecución de campañas especiales."
      toolbar={
        <>
          <span className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/80">Halloween 2026</span>
          <Ghost href="/admin/announcements">Ver todas las temporadas</Ghost>
        </>
      }
    >
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-r from-[#2a0a4a] via-[#3b0764] to-[#1e1036] p-4 sm:p-5">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_70%_40%,rgba(251,146,60,0.35),transparent_55%)]" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[28px] font-black tracking-tight text-orange-300">HALLOWEEN</p>
            <p className="mt-1 inline-flex rounded-full bg-orange-500/20 px-2 py-0.5 text-[11px] font-semibold text-orange-100">15 – 31 Octubre 2026</p>
            <p className="mt-2 max-w-md text-[13px] text-white/75">Descuentos, cupones y las mejores ofertas de Halloween. Disfraces, decoración, electrónicos, gaming, hogar y más.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <p className="mb-2 text-[11px] text-white/55">{t.live ? 'Comienza en' : 'Temporada en curso'}</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                [t.days, 'días'],
                [t.hours, 'horas'],
                [t.min, 'min'],
                [t.sec, 'seg'],
              ].map(([n, l]) => (
                <div key={String(l)}>
                  <p className="text-[22px] font-semibold tabular-nums text-white">{String(n).padStart(2, '0')}</p>
                  <p className="text-[10px] text-white/45">{l}</p>
                </div>
              ))}
            </div>
            <a href="/admin/announcements" className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-violet-500">
              Preparar temporada
            </a>
          </div>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Progreso general" icon={Target}>
          <div className="flex items-center gap-4">
            <Donut parts={[{ pct: 42, color: '#a78bfa' }]}>
              <span className="text-[20px] font-semibold text-white">42%</span>
              <span className="text-[10px] text-white/45">Preparación</span>
            </Donut>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {PHASES.map(([name, pct, color]) => (
                <li key={String(name)} className="grid grid-cols-[88px_1fr_28px] items-center gap-2 text-[11px] text-white/70">
                  <span>{name}</span>
                  <Thin pct={Number(pct)} color={String(color)} />
                  <b className="text-right tabular-nums text-white/80">{pct}%</b>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
        <Panel className="xl:col-span-5" title="Objetivos de la temporada" extra={<Ghost>Editar</Ghost>}>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['500', 'Ofertas publicadas'],
              ['50', 'Videos de publicidad'],
              ['+30%', 'Usuarios en la temporada'],
              ['$25,000', 'Ingresos estimados'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-white/[0.03] p-3">
                <p className="text-[20px] font-semibold text-white">{v}</p>
                <p className="text-[11px] text-white/45">{l}</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="xl:col-span-3" title="Fechas clave" icon={CalendarDays} extra={<Ghost>Agregar</Ghost>}>
          <ol className="space-y-2 text-[12px]">
            {[
              ['1 Oct', 'Inicio de preparación'],
              ['10 Oct', 'Contenido y ofertas listas'],
              ['15 Oct', 'Lanzamiento oficial'],
              ['31 Oct', 'Fin de temporada'],
              ['2 Nov', 'Análisis de resultados'],
            ].map(([d, l]) => (
              <li key={d} className="flex gap-2"><b className="w-12 shrink-0 text-violet-200">{d}</b><span className="text-white/75">{l}</span></li>
            ))}
          </ol>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Categorías prioritarias" extra={<Ghost>Editar</Ghost>}>
          <ul className="space-y-2">
            {CATS.map(([name, n, pct]) => (
              <li key={String(name)} className="grid grid-cols-[1fr_36px_28px] items-center gap-2 text-[12px] text-white/75">
                <span>{name}</span>
                <b className="tabular-nums text-white">{n}</b>
                <span className="text-[10px] text-white/40">{pct}%</span>
                <span className="col-span-3"><Thin pct={Number(pct)} /></span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="xl:col-span-4" title="Checklist de preparación" icon={Flag} extra={<Ghost>Ver checklist completo</Ghost>}>
          <ul className="space-y-1.5">
            {CHECKS.map(([label, prog, done]) => (
              <li key={label} className="flex items-center gap-2 text-[12px]">
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${done ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-white/20'}`}>
                  {done ? <Check className="h-3 w-3" aria-hidden /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-white/80">{label}</span>
                <span className="tabular-nums text-white/40">{prog}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="xl:col-span-4" title="Ideas de contenido" icon={Lightbulb} extra={<Ghost>Ver más</Ghost>}>
          <div className="mb-3 flex flex-wrap gap-1">
            {['Todos', 'Videos', 'Banners', 'Ofertas', 'Redes'].map((name) => (
              <button key={name} type="button" onClick={() => setTab(name)} className={`rounded-lg px-2 py-1 text-[11px] ${tab === name ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-white/55'}`}>
                {name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Top 10 ofertas Halloween', 'Video'],
              ['Disfraces baratos', 'Video'],
              ['Decoración terrorífica', 'Banner'],
              ['Gaming ofertas', 'Oferta'],
              ['Cupones de dulces', 'Redes'],
              ['Setup de Halloween', 'Banner'],
            ]
              .filter(([, kind]) => tab === 'Todos' || kind === tab.slice(0, -1) || (tab === 'Redes' && kind === 'Redes'))
              .slice(0, 3)
              .map(([title, kind]) => (
                <div key={title} className="rounded-xl bg-gradient-to-br from-orange-500/30 to-violet-700/40 p-2">
                  <p className="text-[11px] font-semibold leading-tight text-white">{title}</p>
                  <p className="mt-1 text-[10px] text-white/60">{kind}</p>
                </div>
              ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-3" title="Tendencias y keywords" extra={<Ghost>Ver todas</Ghost>}>
          <table className="w-full text-left text-[11px]">
            <thead className="text-white/40"><tr><th className="pb-1 font-medium">Keyword</th><th>Interés</th><th>30d</th></tr></thead>
            <tbody>
              {KEYWORDS.map(([k, n, d]) => (
                <tr key={k} className="border-t border-white/[0.04] text-white/75">
                  <td className="py-1.5">{k}</td>
                  <td className="tabular-nums">{n}</td>
                  <td className="text-emerald-300">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel className="xl:col-span-3" title="Competencia y referencias" extra={<Ghost>Ver análisis</Ghost>}>
          <ul className="space-y-2 text-[12px]">
            {['Amazon México', 'Mercado Libre', 'Liverpool', 'Walmart', 'Temu'].map((name) => (
              <li key={name} className="flex items-center justify-between border-t border-white/[0.04] py-1.5 text-white/80">
                <span>{name}</span>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">Campaña activa</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="xl:col-span-3" title="Proyección de resultados" extra={<Ghost>Editar</Ghost>}>
          <p className="text-[22px] font-semibold text-white">$25,000</p>
          <p className="text-[11px] text-white/45">ingresos estimados</p>
          <Columns values={[8, 10, 12, 14, 18, 16, 22, 20, 26, 24]} height={90} labels={['15 oct', '31 oct']} />
        </Panel>
        <Panel className="xl:col-span-3" title="Recursos de la temporada" extra={<Ghost href="/admin/announcements">Ver biblioteca</Ghost>}>
          <div className="grid grid-cols-2 gap-2">
            {[['24', 'Banners'], ['12', 'Videos'], ['6', 'Plantillas'], ['8', 'Ideas']].map(([n, l]) => (
              <div key={l} className="rounded-xl bg-white/[0.03] p-3">
                <p className="text-[20px] font-semibold text-white">{n}</p>
                <p className="text-[11px] text-white/45">{l}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </VistaShell>
  );
}
