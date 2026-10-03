'use client';

import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { GerenciaPayload } from '@/lib/staff/buildStaffHome';
import { Bar, Metric, Unavailable, formatCount, relativeTime } from '../ui';
import TeamBody, { type TeamAlert } from './TeamBody';
import { INTEGRITY_STALE_HOURS, daysSinceYmd, hoursSince } from '../derive';

export default function OperationsTeam({
  base,
  cmd,
  gerencia,
  todayYmd,
  now,
}: {
  base: OwnerDashboardPayload | null;
  cmd: OwnerCommandPayload | null;
  gerencia: GerenciaPayload | null;
  todayYmd: string;
  now: number;
}) {
  const ops = cmd?.operations;
  const alerts: TeamAlert[] = [];
  if (ops?.integrityOk === false) alerts.push({ tone: 'bad', text: `Integridad con ${ops.integrityFailed ?? '?'} chequeo(s) fallidos.` });
  const integAge = hoursSince(ops?.integrityFinishedAt, now);
  if (integAge != null && integAge > INTEGRITY_STALE_HOURS) alerts.push({ tone: 'warn', text: `El chequeo de integridad no corre desde hace ${Math.round(integAge)} h.` });
  if (ops && !ops.integrityFinishedAt) alerts.push({ tone: 'warn', text: 'No hay resultado registrado del chequeo de integridad.' });
  const lag = daysSinceYmd(ops?.dailyMetricsLastDate, todayYmd);
  if (lag != null && lag > 1) alerts.push({ tone: 'warn', text: `Métricas diarias sin actualizar desde ${ops?.dailyMetricsLastDate}.` });
  if ((ops?.queueFailed ?? 0) > 0) alerts.push({ tone: 'warn', text: `${ops?.queueFailed} escrituras diferidas fallidas.` });
  for (const a of gerencia?.alerts ?? []) alerts.push({ tone: 'info', text: a });

  return (
    <TeamBody
      metrics={
        <>
          <Metric
            label="Chequeo de integridad"
            provenance={ops?.integrityFinishedAt ? 'REAL' : 'UNAVAILABLE'}
            value={ops?.integrityFinishedAt ? relativeTime(ops.integrityFinishedAt, now) : <Unavailable what="Sin resultado registrado" />}
            tone={ops?.integrityOk === false ? 'bad' : undefined}
            footer={<span className="text-[10px] text-white/40">{ops?.integrityOk == null ? 'estado —' : ops.integrityOk ? 'OK' : 'falló'}</span>}
            hint="Último análisis automático de consistencia de datos."
          />
          <Metric
            label="Métricas diarias"
            provenance={ops?.dailyMetricsLastDate ? 'REAL' : 'UNAVAILABLE'}
            value={ops?.dailyMetricsLastDate ?? <Unavailable what="Sin métricas diarias registradas" />}
            footer={lag != null ? <span className="text-[10px] text-white/40">{lag === 0 ? 'hoy' : `hace ${lag} d`}</span> : null}
            hint="Último día con métricas consolidadas."
          />
          <Metric label="Escrituras en cola" provenance={ops?.queuePending != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(ops?.queuePending)} footer={ops?.queueOldestPendingAt ? <span className="text-[10px] text-white/40">más vieja {relativeTime(ops.queueOldestPendingAt, now)}</span> : null} hint="Escrituras diferidas (votos, eventos) esperando aplicarse." />
          <Metric label="Escrituras fallidas" provenance={ops?.queueFailed != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(ops?.queueFailed)} tone={(ops?.queueFailed ?? 0) > 0 ? 'warn' : undefined} hint="Escrituras diferidas que no se aplicaron." />
          <Metric label="Hunter: último run" provenance={cmd?.hunter.lastRunAt ? 'REAL' : 'UNAVAILABLE'} value={cmd?.hunter.lastRunAt ? relativeTime(cmd.hunter.lastRunAt, now) : <Unavailable what="Sin runs" />} hint="Último run de Hunter terminado." />
          <Metric label="Agotadas / precio" provenance={base?.offerHealth.tableAvailable ? 'REAL' : 'UNAVAILABLE'} value={base?.offerHealth.tableAvailable ? `${base.offerHealth.outOfStock} / ${base.offerHealth.priceChanged}` : <Unavailable what="Escaneo de ofertas no disponible" />} hint="Ofertas live agotadas / con precio cambiado." />
        </>
      }
      aside={
        gerencia?.departmentProgress.length ? (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Tareas por área (tablero del equipo)</p>
            <ul className="space-y-1.5">
              {gerencia.departmentProgress.map((d) => (
                <li key={d.department} className="text-[11px] text-white/65">
                  <span className="flex justify-between gap-2">
                    <span>{d.label}</span>
                    <span className="tabular-nums text-white/45">
                      {d.totalTasks - d.pendingTasks}/{d.totalTasks}
                    </span>
                  </span>
                  <Bar value={d.totalTasks - d.pendingTasks} max={d.totalTasks} tone={d.taskPct >= 85 ? 'green' : d.taskPct >= 50 ? 'amber' : 'red'} />
                </li>
              ))}
            </ul>
          </div>
        ) : null
      }
      alerts={alerts}
      ctas={[
        { href: '/admin/operaciones', label: 'Ver operaciones', primary: true },
        { href: '/equipo/gerencia', label: 'Gerencia' },
        { href: '/admin/logs', label: 'Bitácora' },
      ]}
    />
  );
}
