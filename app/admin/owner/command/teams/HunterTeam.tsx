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
    alerts.push({ tone: 'warn', text: age == null ? 'No hay runs terminados registrados.' : `Último run hace ${Math.round(age)} h.` });
  }
  if ((h?.errors ?? 0) > 0) alerts.push({ tone: 'bad', text: `${h?.errors} errores en runs del período.` });
  if (s && s.bottleneck !== 'none') alerts.push({ tone: 'warn', text: s.action });
  if (cmd?.sources.hunter === 'error') alerts.push({ tone: 'bad', text: 'Los runs de Hunter no se pudieron leer.' });

  return (
    <TeamBody
      metrics={
        <>
          <Metric
            label={cmd ? `Runs · ${cmd.range.label}` : 'Runs'}
            provenance={h?.runs != null ? 'REAL' : 'UNAVAILABLE'}
            value={h?.runs != null ? formatCount(h.runs) : <Unavailable what="Sin datos" />}
            footer={h?.runs != null ? <span className="text-[10px] text-white/40">{h.runsOk} ok · {h.runsZero} sin hallazgos · {h.runsSkipped} omitidos</span> : null}
            hint="Runs de Hunter terminados en el período."
          />
          <Metric label="Descubiertas" provenance={h?.discovered != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(h?.discovered)} hint="Candidatas encontradas por Hunter." />
          <Metric label="Calificadas" provenance={h?.qualified != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(h?.qualified)} hint="Candidatas que pasaron los filtros de calidad." />
          <Metric label="Verificadas" provenance={h?.verified != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(h?.verified)} hint="Ofertas verificadas listas para moderación." />
          <Metric label="Descartadas" provenance={h?.rejected != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(h?.rejected)} footer={h?.duplicates != null ? <span className="text-[10px] text-white/40">{h.duplicates} duplicadas</span> : null} hint="Candidatas descartadas por calidad o duplicado." />
          <Metric label="Errores" provenance={h?.errors != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(h?.errors)} tone={(h?.errors ?? 0) > 0 ? 'bad' : undefined} hint="Errores reportados por los runs del período." />
          <Metric
            label="Último run"
            provenance={h?.lastRunAt ? 'REAL' : 'UNAVAILABLE'}
            value={h?.lastRunAt ? relativeTime(h.lastRunAt, now) : <Unavailable what="Sin runs" />}
            footer={h?.lastRunAt ? <span className="text-[10px] text-white/40">{h.lastRunStatus ?? '—'} · {h.lastRunSource ?? '—'}</span> : null}
          />
          <Metric
            label="Listas para aprobar (hoy)"
            provenance={s?.approvalReady != null ? 'REAL' : 'UNAVAILABLE'}
            value={formatCount(s?.approvalReady)}
            footer={s ? <span className="text-[10px] text-white/40">publicación automática {s.writeEnabled ? 'activa' : 'apagada'}</span> : null}
            hint="Ofertas de Hunter de hoy listas para aprobación."
          />
        </>
      }
      note={
        s ? (
          <>
            Hoy: {formatCount(s.discovered)} descubiertas · {formatCount(s.verified)} verificadas · calidad {s.qualityRatePct != null ? `${s.qualityRatePct}%` : '—'} · nicho principal {s.topNiche ?? '—'} · fuente principal {s.topSource ?? '—'}
            {h?.avgDurationMs != null ? ` · duración media ${Math.round(h.avgDurationMs / 1000)} s` : ''}
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
