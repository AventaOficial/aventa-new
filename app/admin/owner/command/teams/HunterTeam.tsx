'use client';

import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { Metric, Unavailable, formatCount, relativeTime } from '../ui';
import TeamBody, { type TeamAlert } from './TeamBody';
import { HUNTER_STALE_HOURS, hoursSince } from '../derive';

export default function HunterTeam({ base, cmd, now }: { base: OwnerDashboardPayload | null; cmd: OwnerCommandPayload | null; now: number }) {
  const h = cmd?.hunter;
  const s = base?.supply;
  const alerts: TeamAlert[] = [];
  const age = hoursSince(h?.lastRunAt, now);
  if (cmd?.sources.hunter === 'ok' && (age == null || age > HUNTER_STALE_HOURS)) {
    alerts.push({ tone: 'warn', text: age == null ? 'Sin runs terminados registrados en hunter_supply_runs.' : `Último run hace ${Math.round(age)} h.` });
  }
  if ((h?.errors ?? 0) > 0) alerts.push({ tone: 'bad', text: `${h?.errors} errores en runs del período.` });
  if (s && s.bottleneck !== 'none') alerts.push({ tone: 'warn', text: `Cuello de botella: ${s.bottleneck} — ${s.action}` });
  if (cmd?.sources.hunter === 'error') alerts.push({ tone: 'bad', text: 'No se pudo leer hunter_supply_runs.' });

  return (
    <TeamBody
      metrics={
        <>
          <Metric label={cmd ? `Runs · ${cmd.range.label}` : 'Runs'} provenance={h?.runs != null ? 'REAL' : 'UNKNOWN'} value={h?.runs != null ? formatCount(h.runs) : <Unavailable what="Sin datos" />} footer={h?.runs != null ? <span className="text-[10px] text-white/35">ok {h.runsOk} · zero {h.runsZero} · skip {h.runsSkipped}</span> : null} hint="hunter_supply_runs.finished_at en el período" />
          <Metric label="Descubiertas" provenance={h?.discovered != null ? 'REAL' : 'UNKNOWN'} value={formatCount(h?.discovered)} hint="Σ candidates_discovered" />
          <Metric label="Calificadas" provenance={h?.qualified != null ? 'REAL' : 'UNKNOWN'} value={formatCount(h?.qualified)} hint="Σ candidates_qualified" />
          <Metric label="Verificadas" provenance={h?.verified != null ? 'REAL' : 'UNKNOWN'} value={formatCount(h?.verified)} hint="Σ verified_deals" />
          <Metric label="Descartadas" provenance={h?.rejected != null ? 'REAL' : 'UNKNOWN'} value={formatCount(h?.rejected)} footer={h?.duplicates != null ? <span className="text-[10px] text-white/35">{h.duplicates} duplicadas</span> : null} hint="Σ rejected / duplicates" />
          <Metric label="Errores" provenance={h?.errors != null ? 'REAL' : 'UNKNOWN'} value={formatCount(h?.errors)} tone={(h?.errors ?? 0) > 0 ? 'bad' : undefined} hint="Σ errors" />
          <Metric
            label="Último run"
            provenance={h?.lastRunAt ? 'REAL' : 'UNKNOWN'}
            value={h?.lastRunAt ? relativeTime(h.lastRunAt, now) : <Unavailable what="Sin runs" />}
            footer={h?.lastRunAt ? <span className="text-[10px] text-white/35">{h.lastRunStatus ?? '—'} · {h.lastRunSource ?? '—'}</span> : null}
          />
          <Metric
            label="Approval ready (hoy)"
            provenance={s?.approvalReady != null ? 'REAL' : 'UNKNOWN'}
            value={formatCount(s?.approvalReady)}
            footer={s ? <span className="text-[10px] text-white/35">mode {s.mode} · WRITE={s.writeEnabled ? '1' : '0'}</span> : null}
            hint="Supply Today (buildSupplyToday)"
          />
        </>
      }
      note={
        s ? (
          <>
            Supply Today: descubiertas {formatCount(s.discovered)} · verificadas {formatCount(s.verified)} · calidad {s.qualityRatePct != null ? `${s.qualityRatePct}%` : '—'} · top nicho {s.topNiche ?? '—'} · top fuente {s.topSource ?? '—'}
            {h?.avgDurationMs != null ? ` · duración media de run ${Math.round(h.avgDurationMs / 1000)} s` : ''}
          </>
        ) : null
      }
      alerts={alerts}
      ctas={[
        { href: '/admin/hunter', label: 'Ver Hunter', primary: true },
        { href: '/admin/moderation/bot', label: 'Cola del bot' },
        { href: '/admin/operaciones/trabajo', label: 'Bot y trabajo' },
      ]}
    />
  );
}
