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

function sales(window: GrowthWindowView): string {
  if (window.salesLabel === 'DATA_INCOMPLETE') return 'DATA INCOMPLETE';
  if (window.confirmedSales == null) return 'DATA NOT AVAILABLE';
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
          <dd className="font-semibold">{window.conversionRate == null ? 'DATA INCOMPLETE' : `${(window.conversionRate * 100).toFixed(1)}%`}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Comisión confirmada</dt>
          <dd className="font-semibold">{window.confirmedCommissionCents == null ? 'DATA INCOMPLETE' : metric(window.confirmedCommissionCents, 'DATA INCOMPLETE')}</dd>
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
        Confirmación de afiliado: {room.affiliateConfirmation === 'DATA_INCOMPLETE' ? 'DATA INCOMPLETE' : 'CONNECTED'}
        {' · '}
        Tracking: {room.tracking}
      </p>
      <p className="mt-2 text-xs text-gray-500">
        Meta {room.target.toLocaleString('es-MX')} ventas confirmadas desde el 1 de noviembre de 2026.
        {room.windowStarted ? '' : ' La ventana todavía no empieza.'} No hay proyección: faltan ventas confirmadas.
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
                  <span>{row.clicks} clics · ventas DATA INCOMPLETE</span>
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
                  <span>{row.clicks} clics · ventas DATA INCOMPLETE</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-sm font-semibold">Ofertas y tiendas</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          No se ordenan por comisión: la comisión confirmada es DATA INCOMPLETE. Muestra mínima de tienda no alcanzada para convertir.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Tiendas con muestra insuficiente: {room.retailers.insufficient.length === 0 ? 'DATA NOT AVAILABLE' : room.retailers.insufficient.join(', ')}
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="text-sm font-semibold">Contenido, gasto y experimentos</h2>
        <p className="mt-2 text-sm">Contenido → ventas: {room.contentSales === 'DATA_NOT_AVAILABLE' ? 'DATA NOT AVAILABLE' : room.contentSales}</p>
        <p className="mt-1 text-sm">Gasto y ROAS: DATA NOT AVAILABLE. Sin comisión confirmada no hay rentabilidad.</p>
        <p className="mt-1 text-sm">Piezas en plan: {CONTENT_PLAN.length}. Experimentos: {GROWTH_EXPERIMENTS.length}.</p>
        <ul className="mt-2 text-xs text-gray-500">
          {AFFILIATE_NETWORK_BOUNDARIES.map((network) => (
            <li key={network.id}>{network.id}: {network.ingest === 'MANUAL_IMPORT' ? 'MANUAL IMPORT' : network.ingest}</li>
          ))}
          {CONTENT_PLAN.map((item) => (
            <li key={item.contentId}>{item.contentId}: {contentWinner(item)}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
