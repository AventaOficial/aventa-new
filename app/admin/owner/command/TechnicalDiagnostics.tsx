'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, Wrench } from 'lucide-react';
import { cn } from '@/app/components/panel/utils';
import type { CommandData, SourceState } from './types';
import { FOCUS_RING } from './ceo/kit';

const METRIC_SOURCES: { metric: string; source: string; kind: 'REAL' | 'CALCULATED' | 'UNAVAILABLE' }[] = [
  { metric: 'Usuarios activos', source: 'user_activity.last_seen_at en el rango (sin presencia en vivo)', kind: 'REAL' },
  { metric: 'Usuarios nuevos', source: 'profiles.created_at en el rango y en el rango previo', kind: 'REAL' },
  { metric: 'Ofertas creadas', source: 'offers.created_at', kind: 'REAL' },
  { metric: 'Aprobadas / Rechazadas', source: 'moderation_logs.action = approved | rejected', kind: 'REAL' },
  { metric: 'Tasa de aprobación', source: 'approved ÷ (approved + rejected)', kind: 'CALCULATED' },
  { metric: 'Clics a tienda / Vistas', source: 'offer_events.event_type = outbound | view', kind: 'REAL' },
  { metric: 'Vistas → clic', source: 'outbound ÷ view', kind: 'CALCULATED' },
  { metric: 'Interacciones', source: 'offer_votes + comments + offer_favorites', kind: 'CALCULATED' },
  { metric: 'Reportes', source: 'offer_reports.created_at; pendientes: status = pending', kind: 'REAL' },
  { metric: 'Catálogo', source: 'offers.status / expires_at / deleted_at (estado actual)', kind: 'REAL' },
  { metric: 'Plaza', source: 'plaza_requests.status, plaza_discussions.created_at', kind: 'REAL' },
  { metric: 'Moderadores', source: 'moderation_logs.user_id + profiles.display_name; equipo: user_roles', kind: 'REAL' },
  { metric: 'Hunter', source: 'hunter_supply_runs (rango y último run)', kind: 'REAL' },
  { metric: 'Operación', source: 'app_config.system_integrity_last, daily_system_metrics, write_jobs_queue', kind: 'REAL' },
  { metric: 'Ingresos confirmados', source: 'snapshot base economy.day/week/month (sin ventana 30d)', kind: 'REAL' },
  { metric: 'Pagos / Recompensas', source: 'payout_intents, creator_rewards, payout_batches (solo lectura)', kind: 'REAL' },
  { metric: 'Presencia en vivo', source: 'no existe tabla de presencia', kind: 'UNAVAILABLE' },
  { metric: 'Salud / Prioridades / Metas', source: 'reglas deterministas en command/derive.ts', kind: 'CALCULATED' },
];

function fmtTime(ms: number | null): string {
  return ms == null ? '—' : new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function SourceRow({ name, s }: { name: string; s: SourceState<unknown> }) {
  return (
    <tr className="border-t border-white/[0.05]">
      <td className="py-1.5 pr-3 font-mono text-white/80">{name}</td>
      <td className={cn('py-1.5 pr-3', s.status === 'error' ? 'text-red-300' : s.status === 'loading' ? 'text-amber-300' : 'text-emerald-300')}>{s.status}</td>
      <td className="py-1.5 pr-3 tabular-nums text-white/60">{fmtTime(s.fetchedAt)}</td>
      <td className="break-all py-1.5 font-mono text-white/55">{s.error ?? '—'}</td>
    </tr>
  );
}

/** Diagnóstico técnico plegable: único lugar con fuentes, errores crudos y detalle de sistemas. */
export default function TechnicalDiagnostics({ data, children }: { data: CommandData; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const cmd = data.command.data;

  return (
    <section id="diagnostico" aria-labelledby="ceo-diagnostics" className="scroll-mt-20 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#12121c]/60">
      <h2 id="ceo-diagnostics" className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="ceo-technical-detail"
          onClick={() => setOpen((v) => !v)}
          className={cn('flex min-h-[48px] w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.03]', FOCUS_RING)}
        >
          <span className="flex items-center gap-2 text-[13px] font-medium text-white/75">
            <Wrench className="h-4 w-4 text-white/45" aria-hidden />
            Diagnóstico técnico
          </span>
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-white/35">
            <span className="hidden sm:inline">fuentes · errores · sistemas</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
          </span>
        </button>
      </h2>
      {open ? (
        <div id="ceo-technical-detail" className="space-y-5 border-t border-white/[0.06] p-4 text-[11.5px]">
          <div>
            <h3 className="mb-2 text-[12px] font-semibold text-white/80">Estado de las fuentes</h3>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead className="text-[10px] uppercase tracking-wide text-white/40">
                  <tr>
                    <th className="pb-1.5 pr-3 font-medium">Fuente</th>
                    <th className="pb-1.5 pr-3 font-medium">Estado</th>
                    <th className="pb-1.5 pr-3 font-medium">Actualizado</th>
                    <th className="pb-1.5 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  <SourceRow name="owner-dashboard (snapshot)" s={data.base} />
                  <SourceRow name="owner-dashboard?view=command" s={data.command} />
                  <SourceRow name="staff/gerencia" s={data.gerencia} />
                  <SourceRow name="admin/announcements" s={data.announcements} />
                </tbody>
              </table>
            </div>
          </div>

          {cmd ? (
            <div>
              <h3 className="mb-2 text-[12px] font-semibold text-white/80">
                Lecturas del período <span className="font-normal text-white/45">· {cmd.range.key} · {cmd.range.start} → {cmd.range.end}</span>
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {Object.entries(cmd.sources).map(([k, v]) => (
                  <li
                    key={k}
                    className={cn(
                      'rounded-md border px-2 py-0.5 font-mono text-[10.5px]',
                      v === 'ok' ? 'border-emerald-400/20 text-emerald-300' : 'border-red-400/25 text-red-300',
                    )}
                  >
                    {k}: {v}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-white/50">
                Serie: bucket {cmd.series.bucket}, {cmd.series.points.length} puntos, disponible {String(cmd.series.available)}, truncada {String(cmd.series.truncated)}, accesos{' '}
                {String(cmd.series.activeUsersAvailable)}. Generado {cmd.generatedAt}.
              </p>
            </div>
          ) : null}

          <div>
            <h3 className="mb-2 text-[12px] font-semibold text-white/80">Diccionario métrica → fuente</h3>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <tbody>
                  {METRIC_SOURCES.map((m) => (
                    <tr key={m.metric} className="border-t border-white/[0.05]">
                      <td className="py-1.5 pr-3 text-white/80">{m.metric}</td>
                      <td className="py-1.5 pr-3 font-mono text-[10px] text-white/50">{m.kind}</td>
                      <td className="py-1.5 font-mono text-white/55">{m.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {children ?? <p className="text-white/50">Detalle de sistemas no disponible sin el snapshot base.</p>}
        </div>
      ) : null}
    </section>
  );
}
