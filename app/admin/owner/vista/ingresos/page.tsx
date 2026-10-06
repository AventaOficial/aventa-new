'use client';

import { BarChart3, Bell, CircleDollarSign, PieChart, ShoppingCart, Tag } from 'lucide-react';
import VistaShell from '../shell';
import { Columns, DateChip, Delta, Donut, Ghost, KpiCard, LineChart, Panel, PeriodBar, Thin } from '../ui';
import { deltaOf, economyFor, money, num, seriesValues, useVista } from '../live';
import { revenueDonutSplit } from '@/lib/owner/revenueSplit';

export default function IngresosVistaPage() {
  const { range, changeRange, base, cmd } = useVista();
  const economy = base?.economy ?? null;
  const period = economy ? economyFor(range, economy.day, economy.week, economy.month) : null;
  const confirmed = period?.realCents ?? null;
  const estimated = period?.estimatedCents ?? null;
  const outbound = period?.outbound ?? cmd?.traffic.outbound.value ?? null;
  const views = cmd?.traffic.views.value ?? null;
  const clicksDelta = deltaOf(cmd?.traffic.outbound);
  const viewsDelta = deltaOf(cmd?.traffic.views);
  const stores = base?.affiliation.outboundByStore ?? [];
  const offers = base?.week.topOffers ?? [];
  const cats = base?.week.topCategories ?? [];
  const catTotal = cats.reduce((acc, c) => acc + c.outbound, 0);
  const clickSeries = seriesValues((cmd?.series.points ?? []).map((p) => ({ label: p.label, value: p.outbound })));
  const frozen = base?.systemHealth.moneyPathFrozen ?? cmd?.finance.moneyPathFrozen;
  const split = revenueDonutSplit(confirmed, estimated);

  return (
    <VistaShell
      title="Ingresos estimados"
      crumb="Ingresos estimados"
      subtitle="Las cifras salen del libro de comisiones y de los clics reales. El registro y los pagos siguen en Contabilidad."
      toolbar={
        <>
          <DateChip />
          <PeriodBar value={range} onChange={changeRange} />
          <Ghost href="/admin/commissions">Abrir contabilidad</Ghost>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={CircleDollarSign} tint="bg-violet-500/20 text-violet-200" label="Confirmado" value={range === '30d' ? '—' : money(confirmed)} sub={range === '30d' ? 'Sin ventana de 30 días' : frozen ? 'Flujo congelado' : economy?.confidence} />
        <KpiCard icon={Tag} tint="bg-emerald-500/15 text-emerald-200" label="Estimado" value={range === '30d' ? '—' : money(estimated)} sub={economy?.epcStatus === 'NO_DATA' ? 'Sin EPC productivo' : economy?.epcWindowLabel} />
        <KpiCard icon={ShoppingCart} tint="bg-fuchsia-500/15 text-fuchsia-200" label="Clics a tienda" value={num(outbound)} delta={clicksDelta?.text} up={clicksDelta?.up} />
        <KpiCard icon={BarChart3} tint="bg-indigo-500/15 text-indigo-200" label="Visitas a ofertas" value={num(views)} delta={viewsDelta?.text} up={viewsDelta?.up} />
        <KpiCard icon={PieChart} tint="bg-violet-500/15 text-violet-200" label="EPC" value={economy?.epcCents == null ? '—' : money(economy.epcCents)} sub={economy?.epcStatus === 'READY' ? 'Productivo' : 'Sin dato'} />
        <KpiCard icon={CircleDollarSign} tint="bg-sky-500/15 text-sky-200" label="Filas productivas" value={num(economy?.productionLedgerRows)} sub={economy ? `${economy.syntheticLedgerRowsExcluded} de prueba fuera` : undefined} />
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Ingresos confirmados" icon={CircleDollarSign} extra={<Ghost href="/admin/commissions">Libro</Ghost>}>
          <p className="text-[22px] font-semibold tabular-nums text-white">{money(confirmed)}</p>
          <p className="mb-2 mt-1 text-[11px] text-white/45">{economy?.confidenceReason ?? 'Cargando el libro de comisiones.'}</p>
          {clickSeries.values.length > 1 ? <LineChart series={[{ values: clickSeries.values, color: '#a78bfa' }]} labels={clickSeries.labels} /> : <p className="text-[12px] text-white/45">Sin serie de clics en este período.</p>}
        </Panel>
        <Panel className="xl:col-span-4" title="Confirmado y estimado" icon={PieChart}>
          <div className="flex flex-wrap items-center gap-4">
            {split.ok ? (
              <Donut parts={[{ pct: split.confirmedPct, color: '#8b5cf6' }, { pct: split.estimatedPct, color: '#c4b5fd' }]}>
                <span className="text-[13px] font-semibold tabular-nums text-white">{money(confirmed)}</span>
                <span className="text-[10px] text-white/45">Confirmado</span>
              </Donut>
            ) : (
              <p className="max-w-[9rem] text-[12px] text-white/55">No hay datos suficientes</p>
            )}
            <ul className="min-w-0 flex-1 space-y-2 text-[12px]">
              <li className="flex justify-between gap-3 text-white/70"><span>Confirmado</span><b className="text-white">{money(confirmed)}</b></li>
              <li className="flex justify-between gap-3 text-white/70"><span>Estimado</span><b className="text-white">{money(estimated)}</b></li>
              <li className="flex justify-between gap-3 text-white/70"><span>Clics</span><b className="text-white">{num(outbound)}</b></li>
            </ul>
          </div>
        </Panel>
        <Panel className="xl:col-span-4" title="Clics del período" icon={BarChart3}>
          {clickSeries.values.length > 0 ? <Columns values={clickSeries.values} color="#7c3aed" labels={clickSeries.labels} /> : <p className="text-[12px] text-white/45">Sin serie.</p>}
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Top tiendas por clics" extra={<Ghost href="/admin/commissions">Ver contabilidad</Ghost>}>
          {stores.length === 0 ? <p className="text-[12px] text-white/45">Sin clics por tienda en la semana.</p> : (
            <table className="w-full text-left text-[11px]">
              <thead className="text-white/40"><tr>{['#', 'Tienda', 'Clics'].map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {stores.slice(0, 8).map((row, i) => (
                  <tr key={row.store} className="border-t border-white/[0.04] text-white/80">
                    <td className="py-1.5">{i + 1}</td>
                    <td>{row.store}</td>
                    <td className="tabular-nums">{num(row.outbound)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel className="xl:col-span-4" title="Top ofertas por clics" extra={<Ghost href="/admin/owner/vista/ofertas">Ver ofertas</Ghost>}>
          {offers.length === 0 ? <p className="text-[12px] text-white/45">Sin ofertas con clics esta semana.</p> : (
            <table className="w-full text-left text-[11px]">
              <thead className="text-white/40"><tr>{['Oferta', 'Tienda', 'Clics'].map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {offers.slice(0, 8).map((row) => (
                  <tr key={row.id} className="border-t border-white/[0.04] text-white/80">
                    <td className="max-w-[180px] truncate py-1.5">{row.title}</td>
                    <td>{row.store ?? '—'}</td>
                    <td className="tabular-nums">{num(row.outbound)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel className="xl:col-span-4" title="Categorías por clics">
          {cats.length === 0 ? <p className="text-[12px] text-white/45">Sin categorías con clics esta semana.</p> : (
            <ul className="space-y-2">
              {cats.slice(0, 6).map((row) => {
                const pct = catTotal > 0 ? Math.round((row.outbound / catTotal) * 100) : 0;
                return (
                  <li key={row.category}>
                    <div className="flex justify-between text-[11px] text-white/70"><span>{row.category}</span><span>{num(row.outbound)}</span></div>
                    <Thin pct={pct} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Estado del dinero" icon={Bell} extra={<Ghost href="/admin/rewards">Recompensas</Ghost>}>
        <ul className="space-y-2 text-[12px] text-white/75">
          <li className="flex items-center gap-2"><Delta text={frozen ? 'Congelado' : 'Activo'} up={!frozen} suffix="" /> El flujo de pagos no se mueve desde esta vista.</li>
          {(base?.alerts ?? []).slice(0, 4).map((alert) => <li key={alert.id}>{alert.title}. {alert.detail}</li>)}
          {base?.recommendedAction ? <li>{base.recommendedAction.title}. {base.recommendedAction.detail}</li> : null}
        </ul>
      </Panel>
    </VistaShell>
  );
}
