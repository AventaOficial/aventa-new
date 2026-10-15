'use client';

import { BarChart3, Bell, CircleDollarSign, FileWarning, ShoppingCart, Tag } from 'lucide-react';
import { presentEconomicMoney } from '@/lib/economy/readModel/presentEconomicMoney';
import {
  ACTIVITY_SOURCE,
  CASH_RECEIVED_SOURCE,
  ESTIMATED_SOURCE,
  PRODUCTION_BOOK_SOURCE,
  STORE_COMMISSION_SOURCE,
  economyWindowLabel,
} from '@/lib/owner/executiveFinance';
import VistaShell from '../shell';
import { Columns, DateChip, Ghost, KpiCard, Panel, PeriodBar } from '../ui';
import { deltaOf, economyFor, money, num, seriesValues, useVista } from '../live';

export default function IngresosVistaPage() {
  const { range, changeRange, base, cmd } = useVista();
  const economy = base?.economy ?? null;
  const month = base?.economicMonth ?? null;
  const windowLabel = economyWindowLabel(range);
  const period = economy && windowLabel ? economyFor(range, economy.day, economy.week, economy.month) : null;
  const confirmed = windowLabel ? (period?.realCents ?? null) : null;
  const estimated = windowLabel ? (period?.estimatedCents ?? null) : null;
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
  const activityPeriod = cmd?.range.label ?? 'el período';

  return (
    <VistaShell
      title="Ingresos"
      crumb="Ingresos"
      subtitle="Lo que Aventa genera. Los clics, la estimación, la comisión reconocida y el cobro bancario se leen por separado."
      toolbar={
        <>
          <DateChip />
          <PeriodBar value={range} onChange={changeRange} />
          <Ghost href="/admin/commissions">Registrar en el libro</Ghost>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={ShoppingCart}
          tint="bg-fuchsia-500/15 text-fuchsia-200"
          label="Clics a tienda"
          value={num(outbound)}
          delta={clicksDelta?.text}
          up={clicksDelta?.up}
          sub={activityPeriod}
          title={ACTIVITY_SOURCE}
        />
        <KpiCard
          icon={BarChart3}
          tint="bg-indigo-500/15 text-indigo-200"
          label="Visitas a ofertas"
          value={num(views)}
          delta={viewsDelta?.text}
          up={viewsDelta?.up}
          sub={activityPeriod}
          title={ACTIVITY_SOURCE}
        />
        <KpiCard
          icon={Tag}
          tint="bg-emerald-500/15 text-emerald-200"
          label="Comisión estimada"
          value={windowLabel ? (estimated == null ? 'Sin datos' : money(estimated)) : 'Sin datos'}
          sub={windowLabel ?? 'No hay ventana de 30 días para estimar'}
          title={ESTIMATED_SOURCE}
        />
        <KpiCard
          icon={CircleDollarSign}
          tint="bg-violet-500/20 text-violet-200"
          label="Libro productivo"
          value={windowLabel ? (confirmed == null ? 'Sin datos' : money(confirmed)) : 'Sin datos'}
          sub={windowLabel ?? 'No hay ventana de 30 días en el libro'}
          title={PRODUCTION_BOOK_SOURCE}
        />
        <KpiCard
          icon={CircleDollarSign}
          tint="bg-sky-500/15 text-sky-200"
          label="Comisión de tiendas"
          value={month ? presentEconomicMoney(month.grossRecognized) : 'Sin datos'}
          sub={month ? month.periodLabel : 'Mes calendario no disponible'}
          title={STORE_COMMISSION_SOURCE}
        />
        <KpiCard
          icon={FileWarning}
          tint="bg-amber-500/15 text-amber-200"
          label="Evidencia sin sumar"
          value={month ? num(month.evidenceRows) : 'Sin datos'}
          sub={month ? `${month.periodLabel} · manual o CSV` : 'Mes calendario no disponible'}
          title="Registros de evidencia del mes. No son comisión reconocida y no se suman a la cifra anterior."
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Comisión estimada" icon={Tag}>
          <p className="text-[22px] font-semibold tabular-nums text-white">
            {windowLabel ? (estimated == null ? 'Sin datos' : money(estimated)) : 'Sin datos'}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/60">
            {ESTIMATED_SOURCE} {windowLabel ? `Período: ${windowLabel}.` : 'Esta estimación no tiene ventana de 30 días.'}
          </p>
          <p className="mt-2 text-[11px] text-white/45">
            {economy?.epcStatus === 'READY' && economy.epcCents != null
              ? `EPC ${money(economy.epcCents)} · ${economy.epcWindowLabel}.`
              : 'No hay datos suficientes para un EPC productivo.'}
          </p>
        </Panel>
        <Panel className="xl:col-span-4" title="Libro productivo del período" icon={CircleDollarSign}>
          <p className="text-[22px] font-semibold tabular-nums text-white">
            {windowLabel ? (confirmed == null ? 'Sin datos' : money(confirmed)) : 'Sin datos'}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/60">
            {PRODUCTION_BOOK_SOURCE} {windowLabel ? `Período: ${windowLabel}.` : 'El libro no tiene ventana de 30 días.'}
          </p>
          <p className="mt-2 text-[11px] text-white/45">{economy?.confidenceReason ?? 'Cargando el libro.'}</p>
          {economy ? (
            <p className="mt-2 text-[11px] text-white/45">
              En el libro completo, no en esta ventana: {num(economy.productionLedgerRows)} filas productivas, {num(economy.syntheticLedgerRowsExcluded)} de prueba fuera y {num(economy.legacyUnverifiedLedgerRows)} sin verificar. Ninguna de esas cuentas es dinero recibido.
            </p>
          ) : null}
        </Panel>
        <Panel className="xl:col-span-4" title="Comisión reconocida del mes" icon={CircleDollarSign}>
          <p className="text-[22px] font-semibold tabular-nums text-white">
            {month ? presentEconomicMoney(month.grossRecognized) : 'Sin datos'}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/60">
            {STORE_COMMISSION_SOURCE} {month ? `Período: ${month.periodLabel}.` : 'No hay datos suficientes del mes canónico.'}
          </p>
          <ul className="mt-3 space-y-1.5 text-[12px] text-white/70">
            <li className="flex justify-between gap-3">
              <span>Reversos del mes</span>
              <b className="text-white">{month ? presentEconomicMoney(month.reversals) : 'Sin datos'}</b>
            </li>
            <li className="flex justify-between gap-3">
              <span>Neto reconocido</span>
              <b className="text-white">{month ? presentEconomicMoney(month.netRecognized) : 'Sin datos'}</b>
            </li>
          </ul>
          <p className="mt-2 text-[11px] text-white/40">El neto es el reconocido menos los reversos del mismo mes. No incluye la estimación ni los clics.</p>
        </Panel>
      </div>

      <Panel title="Cobro y conciliación" icon={FileWarning}>
        <p className="text-[22px] font-semibold text-white">Sin datos</p>
        <p className="mt-2 text-[12px] leading-relaxed text-white/60">{CASH_RECEIVED_SOURCE}</p>
        <ul className="mt-3 space-y-1.5 text-[12px] text-white/70">
          <li>
            Evidencia manual o CSV en {month?.periodLabel ?? 'el mes'}: {month ? num(month.evidenceRows) : 'sin datos'}. Esas filas no se convierten en comisión reconocida.
          </li>
          {(month?.anomalies ?? []).length === 0 ? (
            <li>El mes canónico no reporta filas apartadas por periodo distinto, duplicado o origen sin alcance.</li>
          ) : (
            month?.anomalies.slice(0, 6).map((item) => <li key={`${item.code}-${item.explanation}`}>{item.explanation}</li>)
          )}
        </ul>
      </Panel>

      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Clics del período" icon={BarChart3}>
          <p className="mb-2 text-[11px] text-white/45">{ACTIVITY_SOURCE} Período: {activityPeriod}.</p>
          {clickSeries.values.length > 0 ? <Columns values={clickSeries.values} color="#7c3aed" labels={clickSeries.labels} /> : <p className="text-[12px] text-white/45">Sin serie de clics en este período.</p>}
        </Panel>
        <Panel className="xl:col-span-4" title="Top tiendas por clics">
          <p className="mb-2 text-[11px] text-white/45">Clics de la semana. No es ingreso de la tienda.</p>
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
      </div>

      <Panel className="xl:col-span-4" title="Categorías por clics">
        {cats.length === 0 ? <p className="text-[12px] text-white/45">Sin categorías con clics esta semana.</p> : (
          <ul className="space-y-2">
            {cats.slice(0, 6).map((row) => {
              const pct = catTotal > 0 ? Math.round((row.outbound / catTotal) * 100) : 0;
              return (
                <li key={row.category}>
                  <div className="flex justify-between text-[11px] text-white/70"><span>{row.category}</span><span>{num(row.outbound)}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
                    <div className="h-full rounded-full bg-violet-400" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Estado del dinero" icon={Bell} extra={<Ghost href="/admin/owner/vista/pagos">Ver pagos a cazadores</Ghost>}>
        <ul className="space-y-2 text-[12px] text-white/75">
          <li>{frozen ? 'El flujo de pagos está congelado.' : frozen === false ? 'El flujo de pagos no está marcado como congelado.' : 'No hay datos suficientes sobre el congelamiento.'} Esta vista no mueve dinero.</li>
          <li>Registrar una comisión en el libro es una operación distinta de leer estas cifras.</li>
          {(base?.alerts ?? []).slice(0, 3).map((alert) => <li key={alert.id}>{alert.title}. {alert.detail}</li>)}
        </ul>
      </Panel>
    </VistaShell>
  );
}
