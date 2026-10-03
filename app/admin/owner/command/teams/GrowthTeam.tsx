'use client';

import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { Delta, Metric, Unavailable, formatCount } from '../ui';
import ActivityChart from '../ActivityChart';
import TeamBody, { type TeamAlert } from './TeamBody';

export default function GrowthTeam({ base, cmd }: { base: OwnerDashboardPayload | null; cmd: OwnerCommandPayload | null }) {
  const channels = base?.attribution.byChannel ?? [];
  const campaigns = base?.attribution.byCampaign ?? [];
  const alerts: TeamAlert[] = [];
  if (channels.length === 0) {
    alerts.push({
      tone: 'info',
      text: 'Analytics insuficiente para adquisición: no hay clics atribuidos con canal (reward_outbound_clicks.channel) en 24 h. Falta tracking de origen de visitas (UTM/referrer) en altas.',
    });
  }
  const nu = cmd?.users.newUsers;
  if (nu && nu.value != null && nu.previous != null && nu.previous > 0 && nu.value < nu.previous * 0.7) {
    alerts.push({ tone: 'warn', text: 'Altas nuevas cayeron más de 30% contra el período anterior.' });
  }

  return (
    <TeamBody
      metrics={
        <>
          <Metric label="Usuarios nuevos" provenance={cmd ? 'REAL' : 'UNKNOWN'} value={formatCount(nu?.value)} footer={nu ? <Delta current={nu.value} previous={nu.previous} label={cmd?.range.prevLabel} /> : null} hint="profiles.created_at" />
          <Metric label="Usuarios activos" provenance={cmd?.users.activeUsers != null ? 'REAL' : 'UNKNOWN'} value={cmd?.users.activeUsers != null ? formatCount(cmd.users.activeUsers) : <Unavailable what="user_activity no disponible" />} hint="user_activity.last_seen_at en el período" />
          <Metric label="Registrados totales" provenance={cmd?.users.totalProfiles != null ? 'REAL' : 'UNKNOWN'} value={formatCount(cmd?.users.totalProfiles)} hint="count(profiles)" />
          <Metric label="Retención 48 h" provenance={base?.growth.retention48hPct != null ? 'DERIVED' : 'UNKNOWN'} value={base?.growth.retention48hPct != null ? `${base.growth.retention48hPct}%` : <Unavailable what="Sin cohorte" />} hint="Usuarios que volvieron ≥5 min después y dentro de 48 h de su primer acceso (user_activity)" />
          <Metric label="Clics a tienda" provenance={cmd ? 'REAL' : 'UNKNOWN'} value={formatCount(cmd?.traffic.outbound.value)} footer={cmd ? <Delta current={cmd.traffic.outbound.value} previous={cmd.traffic.outbound.previous} label={cmd.range.prevLabel} /> : null} hint="offer_events outbound" />
          <Metric label="Ofertas nuevas" provenance={cmd ? 'REAL' : 'UNKNOWN'} value={formatCount(cmd?.community.offersCreated.value)} footer={cmd ? <Delta current={cmd.community.offersCreated.value} previous={cmd.community.offersCreated.previous} label={cmd.range.prevLabel} /> : null} hint="offers.created_at" />
          <Metric
            label="Engagement"
            provenance={cmd ? 'DERIVED' : 'UNKNOWN'}
            value={cmd ? formatCount((cmd.community.votes.value ?? 0) + (cmd.community.comments.value ?? 0) + (cmd.community.favorites.value ?? 0)) : '—'}
            hint="votos + comentarios + favoritos del período"
          />
          <Metric
            label="Crecimiento semanal"
            provenance={base?.growth.weeklyPct != null ? 'DERIVED' : 'UNKNOWN'}
            value={base?.growth.weeklyPct != null ? `${base.growth.weeklyPct > 0 ? '+' : ''}${base.growth.weeklyPct}%` : <Unavailable what="Sin datos" />}
            hint="Altas últimos 7 días vs 7 anteriores (base mínima 1)"
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
      aside={cmd ? <ActivityChart series={cmd.series} compact /> : null}
      alerts={alerts}
      ctas={[
        { href: '/admin/owner/crecimiento', label: 'Ver growth', primary: true },
        { href: '/admin/metrics', label: 'Live metrics' },
        { href: '/equipo/marketing', label: 'Marketing' },
      ]}
    />
  );
}
