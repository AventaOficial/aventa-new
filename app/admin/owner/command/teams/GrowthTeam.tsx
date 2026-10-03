'use client';

import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { Delta, Metric, Unavailable, formatCount } from '../ui';
import TeamBody, { type TeamAlert } from './TeamBody';

export default function GrowthTeam({ base, cmd }: { base: OwnerDashboardPayload | null; cmd: OwnerCommandPayload | null }) {
  const channels = base?.attribution.byChannel ?? [];
  const campaigns = base?.attribution.byCampaign ?? [];
  const alerts: TeamAlert[] = [];
  if (channels.length === 0) {
    alerts.push({
      tone: 'info',
      text: 'Sin datos de canal de adquisición: no hay clics atribuidos con canal en 24 h y las altas no registran origen (UTM o referrer).',
    });
  }
  const nu = cmd?.users.newUsers;
  if (nu && nu.value != null && nu.previous != null && nu.previous > 0 && nu.value < nu.previous * 0.7) {
    alerts.push({ tone: 'warn', text: 'Altas nuevas más de 30% por debajo del período anterior.' });
  }
  const engagement = cmd ? [cmd.community.votes.value, cmd.community.comments.value, cmd.community.favorites.value] : null;
  const engagementOk = engagement != null && engagement.every((v) => v != null);

  return (
    <TeamBody
      metrics={
        <>
          <Metric label="Usuarios nuevos" provenance={nu?.value != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(nu?.value)} footer={nu ? <Delta current={nu.value} previous={nu.previous} label={cmd?.range.prevLabel} /> : null} hint="Cuentas creadas en el período." />
          <Metric label="Usuarios activos" provenance={cmd?.users.activeUsers != null ? 'REAL' : 'UNAVAILABLE'} value={cmd?.users.activeUsers != null ? formatCount(cmd.users.activeUsers) : <Unavailable what="Actividad de usuarios no disponible" />} hint="Usuarios con último acceso dentro del período (no es presencia en vivo)." />
          <Metric label="Registrados totales" provenance={cmd?.users.totalProfiles != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(cmd?.users.totalProfiles)} hint="Cuentas registradas en total." />
          <Metric label="Retención 48 h" provenance={base?.growth.retention48hPct != null ? 'CALCULATED' : 'UNAVAILABLE'} value={base?.growth.retention48hPct != null ? `${base.growth.retention48hPct}%` : <Unavailable what="Sin cohorte suficiente" />} hint="Usuarios que volvieron entre 5 min y 48 h después de su primer acceso." />
          <Metric label="Clics a tienda" provenance={cmd?.traffic.outbound.value != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(cmd?.traffic.outbound.value)} footer={cmd ? <Delta current={cmd.traffic.outbound.value} previous={cmd.traffic.outbound.previous} label={cmd.range.prevLabel} /> : null} hint="Clics salientes hacia tiendas en el período." />
          <Metric label="Ofertas nuevas" provenance={cmd?.community.offersCreated.value != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(cmd?.community.offersCreated.value)} footer={cmd ? <Delta current={cmd.community.offersCreated.value} previous={cmd.community.offersCreated.previous} label={cmd.range.prevLabel} /> : null} hint="Ofertas creadas en el período." />
          <Metric
            label="Interacciones"
            provenance={engagementOk ? 'CALCULATED' : 'UNAVAILABLE'}
            value={engagementOk && engagement ? formatCount(engagement.reduce<number>((a, v) => a + (v ?? 0), 0)) : <Unavailable what="Falta alguna lectura de votos, comentarios o favoritos" />}
            hint="Votos + comentarios + favoritos del período."
          />
          <Metric
            label="Altas: 7 d vs 7 d previos"
            provenance={base?.growth.weeklyPct != null ? 'CALCULATED' : 'UNAVAILABLE'}
            value={base?.growth.weeklyPct != null ? `${base.growth.weeklyPct > 0 ? '+' : ''}${base.growth.weeklyPct}%` : <Unavailable what="Sin datos" />}
            hint="Altas de los últimos 7 días contra los 7 anteriores."
          />
        </>
      }
      note={
        channels.length || campaigns.length ? (
          <>
            Canales 24 h: {channels.slice(0, 4).map((c) => `${c.channel} ${c.clicks}`).join(' · ') || '—'}
            {campaigns.length ? ` · Campañas: ${campaigns.slice(0, 3).map((c) => `${c.campaignKey} ${c.clicks}`).join(' · ')}` : ''}
          </>
        ) : null
      }
      alerts={alerts}
      ctas={[
        { href: '/admin/owner/crecimiento', label: 'Ver growth', primary: true },
        { href: '/admin/metrics', label: 'Métricas en vivo' },
        { href: '/equipo/marketing', label: 'Marketing' },
      ]}
    />
  );
}
