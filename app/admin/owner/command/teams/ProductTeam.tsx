'use client';

import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { cn } from '@/app/components/panel/utils';
import { Metric, Unavailable, formatCount } from '../ui';
import TeamBody, { type TeamAlert } from './TeamBody';

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  blocked: 'bg-red-400',
  unknown: 'bg-white/30',
};

const STATUS_LABEL: Record<string, string> = {
  healthy: 'sano',
  degraded: 'degradado',
  blocked: 'caído',
  unknown: 'sin dato',
};

export default function ProductTeam({ base, cmd }: { base: OwnerDashboardPayload | null; cmd: OwnerCommandPayload | null }) {
  const alerts: TeamAlert[] = (base?.alerts ?? [])
    .filter((a) => a.id !== 'ledger_empty' && a.id !== 'affiliate_tags')
    .map((a): TeamAlert => ({ tone: a.severity === 'red' ? 'bad' : 'warn', text: `${a.title}: ${a.detail}` }));
  alerts.push({ tone: 'info', text: 'Errores en producción, incidentes y releases aún no tienen fuente integrada en Aventa.' });
  const oh = base?.offerHealth;
  const comps = base?.systemHealth.components ?? [];

  return (
    <TeamBody
      metrics={
        <>
          <Metric label="Ofertas live" provenance={base?.liveDeals != null ? 'REAL' : 'UNAVAILABLE'} value={base?.liveDeals != null ? formatCount(base.liveDeals) : <Unavailable what="Snapshot del panel no disponible" />} tone={(base?.liveDeals ?? 1) === 0 ? 'bad' : undefined} hint="Ofertas aprobadas y vigentes en el feed." />
          <Metric label="Expiradas sin archivar" provenance={cmd?.catalog.expired != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(cmd?.catalog.expired)} hint="Ofertas aprobadas cuya vigencia ya pasó." />
          <Metric label="Agotadas" provenance={oh?.tableAvailable ? 'REAL' : 'UNAVAILABLE'} value={oh?.tableAvailable ? formatCount(oh.outOfStock) : <Unavailable what="Escaneo de stock no disponible" />} tone={(oh?.outOfStock ?? 0) > 0 ? 'warn' : undefined} hint="Ofertas live sin stock en el último escaneo." />
          <Metric label="Precio cambiado" provenance={oh?.tableAvailable ? 'REAL' : 'UNAVAILABLE'} value={oh?.tableAvailable ? formatCount(oh.priceChanged) : <Unavailable what="Escaneo de precio no disponible" />} hint="Ofertas live cuyo precio cambió en el último escaneo." />
          <Metric label="Vistas de oferta" provenance={cmd ? 'REAL' : 'UNAVAILABLE'} value={formatCount(cmd?.traffic.views.value)} hint="Vistas de detalle de oferta en el período." />
          <Metric label="Errores / incidentes" provenance="UNAVAILABLE" value={<Unavailable what="Requiere integrar seguimiento de errores o registro de incidentes" />} />
        </>
      }
      aside={
        comps.length ? (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Sistemas críticos</p>
            <ul className="grid grid-cols-2 gap-1">
              {comps.map((c) => (
                <li key={c.id} className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2 py-1 text-[11px] text-white/65">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[c.status] ?? 'bg-white/30')} aria-hidden />
                  <span className="truncate capitalize">{c.id.replace(/[_-]+/g, ' ')}</span>
                  <span className="sr-only">{STATUS_LABEL[c.status] ?? c.status}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null
      }
      alerts={alerts}
      ctas={[
        { href: '/admin/health', label: 'Ver salud', primary: true },
        { href: '/admin/sistemas/mapa', label: 'Mapa de sistemas' },
        { href: '/admin/infraestructura', label: 'Infraestructura' },
      ]}
    />
  );
}
