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
    if ((m.slaBreachEstimate ?? 0) > 0) alerts.push({ tone: 'warn', text: `${m.slaBreachEstimate} en riesgo de SLA según moderation ops.` });
    if ((m.staleReclaimedLastHour ?? 0) > 0) alerts.push({ tone: 'info', text: `${m.staleReclaimedLastHour} locks caducados recuperados en la última hora.` });
  }
  if (cmd?.moderation.pendingReports) alerts.push({ tone: 'warn', text: `${cmd.moderation.pendingReports} reportes de comunidad sin revisar.` });

  return (
    <TeamBody
      metrics={
        <>
          <Metric label="Pendientes" provenance={m ? 'REAL' : 'UNKNOWN'} value={m ? formatCount(m.pending) : <Unavailable what="Sin snapshot" />} tone={(m?.pending ?? 0) >= 10 ? 'warn' : undefined} hint="offers.status = pending (ahora)" />
          <Metric
            label={cmd ? `Aprobadas · ${cmd.range.label}` : 'Aprobadas'}
            provenance={cmd ? 'REAL' : 'UNKNOWN'}
            value={formatCount(cmd?.moderation.approved.value)}
            footer={cmd ? <Delta current={cmd.moderation.approved.value} previous={cmd.moderation.approved.previous} label={cmd.range.prevLabel} /> : null}
            hint="moderation_logs action=approved"
          />
          <Metric
            label={cmd ? `Rechazadas · ${cmd.range.label}` : 'Rechazadas'}
            provenance={cmd ? 'REAL' : 'UNKNOWN'}
            value={formatCount(cmd?.moderation.rejected.value)}
            footer={cmd ? <Delta current={cmd.moderation.rejected.value} previous={cmd.moderation.rejected.previous} invert label={cmd.range.prevLabel} /> : null}
            hint="moderation_logs action=rejected"
          />
          <Metric label="Reportes pendientes" provenance={cmd?.moderation.pendingReports != null ? 'REAL' : 'UNKNOWN'} value={cmd?.moderation.pendingReports != null ? formatCount(cmd.moderation.pendingReports) : <Unavailable what="offer_reports no disponible" />} hint="offer_reports.status = pending" />
          <Metric label="Sancionados activos" provenance={cmd?.moderation.activeBans != null ? 'REAL' : 'UNKNOWN'} value={cmd?.moderation.activeBans != null ? formatCount(cmd.moderation.activeBans) : <Unavailable what="user_bans no disponible" />} hint="user_bans sin expirar" />
          <Metric
            label="Moderadores con decisiones"
            provenance={cmd?.moderation.activeModerators != null ? 'DERIVED' : 'UNKNOWN'}
            value={cmd?.moderation.activeModerators != null ? formatCount(cmd.moderation.activeModerators) : <Unavailable what="Sin datos" />}
            hint="Usuarios distintos en moderation_logs (approve/reject) en el período. No es presencia online: no existe tracking de sesión de moderadores."
          />
          <Metric label="Mediana de decisión (7 d)" provenance={m?.medianDecisionMinutes != null ? 'REAL' : 'UNKNOWN'} value={m?.medianDecisionMinutes != null ? formatMedianDecisionTime(m.medianDecisionMinutes) : <Unavailable what="Sin decisiones con outcome en 7 días" />} hint="Mediana pending → decisión, outcomes 7 días" />
          <Metric
            label="Throughput · ETA cola"
            provenance={m?.throughputLastHour != null ? 'DERIVED' : 'UNKNOWN'}
            value={m?.throughputLastHour != null ? `${m.throughputLastHour}/h` : <Unavailable what="Sin decisiones en la última hora" />}
            footer={<span className="text-[10px] text-white/35">ETA {m?.hoursToDrain != null ? formatHoursToDrain(m.hoursToDrain) : 'no calculable'}</span>}
            hint="Decisiones última hora; ETA = pendientes / throughput"
          />
        </>
      }
      alerts={alerts}
      aside={
        m && m.byModerator.length ? (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Decisiones última hora</p>
            <ul className="space-y-1 text-xs text-white/60">
              {m.byModerator.slice(0, 4).map((r) => (
                <li key={r.moderatorId} className="flex justify-between gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
                  <span className="truncate font-mono text-[10px] text-white/45">{r.moderatorId.slice(0, 8)}</span>
                  <span className="tabular-nums">
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
