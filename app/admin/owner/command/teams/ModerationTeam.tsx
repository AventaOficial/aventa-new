'use client';

import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { formatMedianDecisionTime } from '@/lib/moderation/outcomes';
import { formatHoursToDrain } from '@/lib/moderation/slaContract';
import { Delta, Metric, Unavailable, formatCount } from '../ui';
import TeamBody, { type TeamAlert } from './TeamBody';

export default function ModerationTeam({ base, cmd }: { base: OwnerDashboardPayload | null; cmd: OwnerCommandPayload | null }) {
  const m = base?.moderation;
  const alerts: TeamAlert[] = [];
  if (m) {
    if (m.pendingGt24h > 0) alerts.push({ tone: m.pendingGt24h >= 10 ? 'bad' : 'warn', text: m.oldestPendingHours != null ? `${m.pendingGt24h} ofertas pendientes >24 h (más vieja: ${m.oldestPendingHours} h).` : `${m.pendingGt24h} ofertas pendientes >24 h.` });
    if ((m.slaBreachEstimate ?? 0) > 0) alerts.push({ tone: 'warn', text: `${m.slaBreachEstimate} ofertas en riesgo de romper el SLA.` });
    if ((m.staleReclaimedLastHour ?? 0) > 0) alerts.push({ tone: 'info', text: `${m.staleReclaimedLastHour} revisiones abandonadas se liberaron en la última hora.` });
  }
  if (cmd?.moderation.pendingReports) alerts.push({ tone: 'warn', text: `${cmd.moderation.pendingReports} reportes de comunidad sin revisar.` });
  const mods = cmd?.moderation.moderators ?? null;

  return (
    <TeamBody
      metrics={
        <>
          <Metric label="Pendientes ahora" provenance={m ? 'REAL' : 'UNAVAILABLE'} value={m ? formatCount(m.pending) : <Unavailable what="Snapshot del panel no disponible" />} tone={(m?.pending ?? 0) >= 10 ? 'warn' : undefined} hint="Ofertas esperando decisión en este momento." />
          <Metric
            label={cmd ? `Aprobadas · ${cmd.range.label}` : 'Aprobadas'}
            provenance={cmd ? 'REAL' : 'UNAVAILABLE'}
            value={formatCount(cmd?.moderation.approved.value)}
            footer={cmd ? <Delta current={cmd.moderation.approved.value} previous={cmd.moderation.approved.previous} label={cmd.range.prevLabel} /> : null}
            hint="Decisiones de aprobación registradas en el período."
          />
          <Metric
            label={cmd ? `Rechazadas · ${cmd.range.label}` : 'Rechazadas'}
            provenance={cmd ? 'REAL' : 'UNAVAILABLE'}
            value={formatCount(cmd?.moderation.rejected.value)}
            footer={cmd ? <Delta current={cmd.moderation.rejected.value} previous={cmd.moderation.rejected.previous} invert label={cmd.range.prevLabel} /> : null}
            hint="Decisiones de rechazo registradas en el período."
          />
          <Metric label="Reportes pendientes" provenance={cmd?.moderation.pendingReports != null ? 'REAL' : 'UNAVAILABLE'} value={cmd?.moderation.pendingReports != null ? formatCount(cmd.moderation.pendingReports) : <Unavailable what="Reportes no disponibles" />} hint="Reportes de usuarios sin revisar." />
          <Metric label="Sancionados activos" provenance={cmd?.moderation.activeBans != null ? 'REAL' : 'UNAVAILABLE'} value={cmd?.moderation.activeBans != null ? formatCount(cmd.moderation.activeBans) : <Unavailable what="Sanciones no disponibles" />} hint="Usuarios con sanción vigente." />
          <Metric
            label="Moderadores con decisiones"
            provenance={cmd?.moderation.activeModerators != null ? 'CALCULATED' : 'UNAVAILABLE'}
            value={cmd?.moderation.activeModerators != null ? formatCount(cmd.moderation.activeModerators) : <Unavailable what="Sin datos" />}
            hint="Personas distintas que aprobaron o rechazaron en el período. No es presencia en línea: Aventa no registra sesiones de moderación."
          />
          <Metric label="Mediana de decisión (7 d)" provenance={m?.medianDecisionMinutes != null ? 'CALCULATED' : 'UNAVAILABLE'} value={m?.medianDecisionMinutes != null ? formatMedianDecisionTime(m.medianDecisionMinutes) : <Unavailable what="Sin decisiones en 7 días" />} hint="Tiempo mediano entre que una oferta queda pendiente y recibe decisión." />
          <Metric
            label="Ritmo · ETA de la cola"
            provenance={m?.throughputLastHour != null ? 'CALCULATED' : 'UNAVAILABLE'}
            value={m?.throughputLastHour != null ? `${m.throughputLastHour}/h` : <Unavailable what="Sin decisiones en la última hora" />}
            footer={<span className="text-[10px] text-white/40">ETA {m?.hoursToDrain != null ? formatHoursToDrain(m.hoursToDrain) : 'no calculable'}</span>}
            hint="Decisiones de la última hora; ETA = pendientes ÷ ritmo."
          />
        </>
      }
      alerts={alerts}
      aside={
        mods && mods.length ? (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Decisiones del período</p>
            <ul className="space-y-1 text-xs text-white/65">
              {mods.slice(0, 4).map((r) => (
                <li key={r.userId} className="flex justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                  <span className="truncate">{r.displayName ?? 'Moderador sin nombre'}</span>
                  <span className="shrink-0 tabular-nums" title={`${r.approved} aprobadas · ${r.rejected} rechazadas`}>
                    {r.decisions} · {r.approved}✓ {r.rejected}✗
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null
      }
      ctas={[
        { href: '/admin/moderation', label: 'Ver moderación', primary: true },
        { href: '/admin/moderation/reports', label: 'Reportes' },
        { href: '/admin/moderation/bans', label: 'Sanciones' },
      ]}
    />
  );
}
