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

export default function ProductTeam({ base, cmd }: { base: OwnerDashboardPayload | null; cmd: OwnerCommandPayload | null }) {
  const alerts: TeamAlert[] = (base?.alerts ?? [])
    .filter((a) => a.id !== 'ledger_empty' && a.id !== 'affiliate_tags')
    .map((a): TeamAlert => ({ tone: a.severity === 'red' ? 'bad' : 'warn', text: `${a.title}: ${a.detail}` }));
  alerts.push({ tone: 'info', text: 'Errores de runtime, incidentes y releases: no hay fuente integrada (sin error tracking ni registro de deploys en la base).' });
  const oh = base?.offerHealth;
  const comps = base?.systemHealth.components ?? [];

  return (
    <TeamBody
      metrics={
        <>
          <Metric label="Ofertas live" provenance={base?.liveDeals != null ? 'REAL' : 'UNKNOWN'} value={base?.liveDeals != null ? formatCount(base.liveDeals) : <Unavailable what="Sin snapshot" />} tone={(base?.liveDeals ?? 1) === 0 ? 'bad' : undefined} hint="approved/published no expiradas" />
          <Metric label="Expiradas sin archivar" provenance={cmd?.catalog.expired != null ? 'REAL' : 'UNKNOWN'} value={formatCount(cmd?.catalog.expired)} hint="approved/published con expires_at pasado" />
          <Metric label="Agotadas" provenance={oh?.tableAvailable ? 'REAL' : 'UNKNOWN'} value={oh?.tableAvailable ? formatCount(oh.outOfStock) : <Unavailable what="offer_health_state no disponible" />} tone={(oh?.outOfStock ?? 0) > 0 ? 'warn' : undefined} hint={oh?.lastScanNote} />
          <Metric label="Precio cambiado" provenance={oh?.tableAvailable ? 'REAL' : 'UNKNOWN'} value={oh?.tableAvailable ? formatCount(oh.priceChanged) : <Unavailable what="offer_health_state no disponible" />} hint={oh?.lastScanNote} />
          <Metric label="Vistas de oferta" provenance={cmd ? 'REAL' : 'UNKNOWN'} value={formatCount(cmd?.traffic.views.value)} hint="offer_events view en el período" />
          <Metric label="Errores / incidentes" provenance="UNKNOWN" value={<Unavailable what="Requiere error tracking (p. ej. Sentry) o tabla de incidentes" />} hint="No existe fuente de errores de runtime en el backend actual." />
        </>
      }
      aside={
        comps.length ? (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Sistemas críticos</p>
            <ul className="grid grid-cols-2 gap-1">
              {comps.map((c) => (
                <li key={c.id} title={c.detail} className="flex items-center gap-1.5 rounded-lg bg-white/[0.02] px-2 py-1 text-[11px] text-white/60">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[c.status] ?? 'bg-white/30')} aria-hidden />
                  <span className="truncate">{c.id}</span>
                  <span className="sr-only">{c.status}</span>
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
