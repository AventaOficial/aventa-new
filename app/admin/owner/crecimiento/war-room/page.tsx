import Link from 'next/link';
import { loadGrowthWarRoom } from '@/lib/growth/loadWarRoom';
import { AFFILIATE_NETWORK_BOUNDARIES } from '@/lib/growth/affiliateBoundary';
import { CONTENT_PLAN, contentWinner } from '@/lib/growth/contentPlan';
import { GROWTH_EXPERIMENTS } from '@/lib/growth/experiments';
import type { GrowthWindowView } from '@/lib/growth/warRoom';

function metric(value: number | null, missing: string): string {
  if (value == null) return missing;
  return new Intl.NumberFormat('es-MX').format(value);
}

function gapLabel(window: GrowthWindowView): string {
  if (window.salesLabel === 'DATA_DELAYED') return 'DATA DELAYED';
  if (window.salesLabel === 'PROVIDER_IMPORT_FAILED') return 'PROVIDER IMPORT FAILED';
  if (window.salesLabel === 'PARTIAL_DATA') return 'PARTIAL DATA';
  if (window.salesLabel === 'DATA_NOT_AVAILABLE') return 'DATA NOT AVAILABLE';
  return 'DATA INCOMPLETE';
}

function money(cents: number | null, missing: string): string {
  if (cents == null) return missing;
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
}

function coverageLabel(state: string): string {
  if (state === 'PARTIAL_DATA') return 'PARTIAL DATA';
  if (state === 'DATA_DELAYED') return 'DATA DELAYED';
  if (state === 'PROVIDER_IMPORT_FAILED') return 'PROVIDER IMPORT FAILED';
  if (state === 'CONNECTED') return 'CONNECTED';
  return 'DATA INCOMPLETE';
}

function sales(window: GrowthWindowView): string {
  if (window.salesLabel === 'DATA_DELAYED') return 'DATA DELAYED';
  if (window.salesLabel === 'PROVIDER_IMPORT_FAILED') return 'PROVIDER IMPORT FAILED';
  if (window.salesLabel === 'PARTIAL_DATA') {
    return window.confirmedSales == null ? 'PARTIAL DATA' : `${metric(window.confirmedSales, 'PARTIAL DATA')} · PARTIAL DATA`;
  }
  if (window.salesLabel === 'DATA_INCOMPLETE' || window.confirmedSales == null) {
    return window.salesLabel === 'DATA_NOT_AVAILABLE' ? 'DATA NOT AVAILABLE' : 'DATA INCOMPLETE';
  }
  return metric(window.confirmedSales, 'DATA NOT AVAILABLE');
}

function WindowCard({ window }: { window: GrowthWindowView }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#141414]">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{window.label}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-gray-500">Ventas confirmadas</dt>
          <dd className="font-semibold text-gray-900 dark:text-gray-100">{sales(window)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Clics salientes</dt>
          <dd className="font-semibold">{metric(window.outboundClicks, 'DATA NOT AVAILABLE')}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Vistas de oferta</dt>
          <dd className="font-semibold">{metric(window.offerViews, 'DATA NOT AVAILABLE')}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Visitantes</dt>
          <dd className="font-semibold">{metric(window.visitors, 'DATA NOT AVAILABLE')}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Conversión</dt>
          <dd className="font-semibold">{window.conversionRate == null ? gapLabel(window) : `${(window.conversionRate * 100).toFixed(1)}%`}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Comisión confirmada</dt>
          <dd className="font-semibold">{money(window.confirmedCommissionCents, gapLabel(window))}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Ingreso por clic</dt>
          <dd className="font-semibold">{window.revenuePerClickCents == null ? gapLabel(window) : money(window.revenuePerClickCents, gapLabel(window))}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Pendientes</dt>
          <dd className="font-semibold">{window.pendingConversions == null ? gapLabel(window) : metric(window.pendingConversions, gapLabel(window))}</dd>
        </div>
      </dl>
    </section>
  );
}

export default async function GrowthWarRoomPage() {
  const room = await loadGrowthWarRoom();
  return (
    <main className="mx-auto w-full max-w-5xl overflow-x-hidden px-4 py-6 sm:px-6">
      <Link href="/admin/owner/crecimiento" className="text-xs font-medium text-violet-600">
        Crecimiento
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">Growth War Room</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{room.question}</p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
        Ritmo: {room.pace === 'DATA_INSUFFICIENT' ? 'DATA INSUFFICIENT' : room.pace}
        {' · '}
        Confirmación de afiliado: {coverageLabel(room.affiliateConfirmation)}
        {room.providerDetail ? ` · ${room.providerDetail}` : ''}
        {' · '}
        Tracking: {room.tracking}
      </p>
      <p className="mt-2 text-xs text-gray-500">
        Meta {room.target.toLocaleString('es-MX')} ventas confirmadas desde el 1 de noviembre de 2026.
        {room.windowStarted ? '' : ' La ventana todavía no empieza.'}
        {room.sinceLaunch.confirmedSales == null
          ? ' No hay proyección: faltan ventas confirmadas.'
          : ` Ritmo diario medido: ${room.currentDaily?.toFixed(2) ?? 'DATA INCOMPLETE'}. Requerido: ${room.requiredDaily?.toFixed(2) ?? 'DATA INCOMPLETE'}.`}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <WindowCard window={room.today} />
        <WindowCard window={room.d7} />
        <WindowCard window={room.d30} />
        <WindowCard window={room.sinceLaunch} />
      </div>

      <section className="mt-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-sm font-semibold">Embudo de hoy</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {room.bottleneck
            ? `El tramo medido más bajo es ${room.bottleneck.from} → ${room.bottleneck.to} (${(room.bottleneck.rate * 100).toFixed(1)}%).`
            : 'DATA NOT AVAILABLE'}
        </p>
        <p className="mt-1 text-xs text-gray-500">Las ventas confirmadas no entran al embudo mientras la confirmación de afiliado esté incompleta.</p>
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="text-sm font-semibold">Canales (clics atribuidos, 24 h)</h2>
          {room.channels.length === 0 ? <p className="mt-2 text-sm">DATA NOT AVAILABLE</p> : (
            <ul className="mt-2 space-y-1 text-sm">
              {room.channels.slice(0, 8).map((row) => (
                <li key={row.channel} className="flex justify-between gap-3">
                  <span className="truncate">{row.channel}</span>
                  <span>
                    {row.clicks} clics · {row.confirmedSales == null ? 'ventas DATA INCOMPLETE' : `${row.confirmedSales} ventas confirmadas`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="text-sm font-semibold">Campañas (clics atribuidos, 24 h)</h2>
          {room.campaigns.length === 0 ? <p className="mt-2 text-sm">DATA NOT AVAILABLE</p> : (
            <ul className="mt-2 space-y-1 text-sm">
              {room.campaigns.slice(0, 8).map((row) => (
                <li key={row.campaignKey} className="flex justify-between gap-3">
                  <span className="truncate">{row.campaignKey}</span>
                  <span>
                    {row.clicks} clics
                    {row.source ? ` · ${row.source}` : ''}
                    {row.content ? ` · ${row.content}` : ''}
                    {' · '}
                    {row.confirmedSales == null ? 'ventas DATA INCOMPLETE' : `${row.confirmedSales} ventas confirmadas`}
                    {row.confirmedCommissionCents == null ? '' : ` · ${money(row.confirmedCommissionCents, 'DATA INCOMPLETE')}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-sm font-semibold">Ofertas y tiendas</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {room.affiliateConfirmation === 'CONNECTED' || room.affiliateConfirmation === 'PARTIAL_DATA'
            ? 'El orden usa ventas confirmadas. Una conversión no alcanza para declarar la mejor tienda.'
            : 'No se ordenan por comisión: la comisión confirmada es DATA INCOMPLETE. Muestra mínima de tienda no alcanzada para convertir.'}
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {room.offers.slice(0, 8).map((offer) => (
            <li key={offer.offerId} className="flex justify-between gap-3">
              <span className="truncate">{offer.offerId}</span>
              <span>
                {offer.clicks} clics · pendientes {offer.pendingConversions ?? 'DATA INCOMPLETE'} · confirmadas {offer.confirmedSales ?? 'DATA INCOMPLETE'} · revertidas {offer.reversedConversions ?? 'DATA INCOMPLETE'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-gray-500">
          Mejor tienda: {room.retailers.best ?? 'DATA NOT AVAILABLE'}. Peor tienda: {room.retailers.worst ?? 'DATA NOT AVAILABLE'}.
          Muestra insuficiente: {room.retailers.insufficient.length === 0 ? 'DATA NOT AVAILABLE' : room.retailers.insufficient.join(', ')}
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-sm font-semibold">Contenido, gasto y experimentos</h2>
        <p className="mt-2 text-sm">Contenido → ventas: {room.contentSales === 'DATA_NOT_AVAILABLE' ? 'DATA NOT AVAILABLE' : room.content.map((item) => `${item.contentId}: ${item.confirmedSales}`).join(', ')}</p>
        <p className="mt-1 text-sm">Última importación exitosa: {room.lastSuccessfulImportAt ?? 'DATA NOT AVAILABLE'}</p>
        <p className="mt-1 text-sm">Último dato del proveedor: {room.lastProviderDataAt ?? 'DATA NOT AVAILABLE'}</p>
        <p className="mt-1 text-sm">Gasto y ROAS: DATA NOT AVAILABLE. Sin comisión confirmada no hay rentabilidad.</p>
        <p className="mt-1 text-sm">Piezas en plan: {CONTENT_PLAN.length}. Experimentos: {GROWTH_EXPERIMENTS.length}.</p>
        <ul className="mt-2 text-xs text-gray-500">
          {AFFILIATE_NETWORK_BOUNDARIES.map((network) => (
            <li key={network.id}>{network.id}: {network.ingest === 'OFFICIAL_REPORT_IMPORT' ? 'OFFICIAL REPORT IMPORT' : network.ingest}</li>
          ))}
          {CONTENT_PLAN.map((item) => (
            <li key={item.contentId}>{item.contentId}: {contentWinner(item)}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
