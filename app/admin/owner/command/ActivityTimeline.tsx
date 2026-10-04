'use client';

import { History } from 'lucide-react';
import type { ActivityEvent, OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { cn } from '@/app/components/panel/utils';
import { CtaLink, EmptyNote, Panel, ProvenanceBadge, SourceGate, relativeTime } from './ui';
import type { SourceState, TeamId } from './types';

const TONE: Record<ActivityEvent['tone'], string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  error: 'bg-red-400',
  info: 'bg-violet-400',
};

const KIND_LABEL: Record<ActivityEvent['kind'], string> = {
  moderation: 'Moderación',
  offer: 'Ofertas',
  report: 'Comunidad',
  hunter: 'Hunter',
  ban: 'Moderación',
  integrity: 'Operaciones',
  queue: 'Operaciones',
};

export const KIND_TEAM: Record<ActivityEvent['kind'], TeamId> = {
  moderation: 'moderacion',
  offer: 'producto',
  report: 'comunidad',
  hunter: 'hunter',
  ban: 'moderacion',
  integrity: 'operaciones',
  queue: 'operaciones',
};

const STATUS_WORD: Record<string, string> = {
  approved: 'aprobada',
  published: 'publicada',
  rejected: 'rechazada',
  pending: 'pendiente',
  expired: 'expirada',
  deleted: 'eliminada',
  draft: 'borrador',
};

const RUN_WORD: Record<string, string> = { ok: 'correcta', zero: 'sin resultados', skipped: 'omitida', error: 'con error', failed: 'fallida' };

/** Título del evento en lenguaje de negocio. */
export function eventTitle(e: ActivityEvent): string {
  if (e.kind === 'hunter') {
    const status = e.title.split('·')[1]?.trim() ?? '';
    return `Ejecución de Hunter · ${RUN_WORD[status] ?? status}`;
  }
  if (e.kind === 'queue') return 'Escritura diferida fallida';
  return e.title;
}

/** Detalle del evento en lenguaje de negocio: sin identificadores ni tipos internos. */
export function eventDetail(e: ActivityEvent): string | null {
  if (!e.detail || e.kind === 'queue') return null;
  return e.detail
    .replace(/\b(approved|published|rejected|pending|expired|deleted|draft)\b/g, (w) => STATUS_WORD[w] ?? w)
    .replace(/^Nuevo estado: /, 'Estado: ')
    .replace(/_/g, ' ');
}

const VISIBLE_EVENTS = 12;

export default function ActivityTimeline({ command, now, onRetry }: { command: SourceState<OwnerCommandPayload>; now: number; onRetry: () => void }) {
  return (
    <Panel
      id="actividad"
      title="Actividad reciente"
      icon={History}
      subtitle="Últimos eventos de moderación, ofertas, comunidad, Hunter y operaciones."
      badge={<ProvenanceBadge kind={command.data ? 'REAL' : 'UNAVAILABLE'} />}
      action={<CtaLink href="/admin/logs">Ver bitácora</CtaLink>}
    >
      <SourceGate source={command} onRetry={onRetry} rows={4} label="la actividad">
        {(cmd) =>
          cmd.activity.length === 0 ? (
            <EmptyNote>Sin eventos registrados.</EmptyNote>
          ) : (
            <ol className="grid gap-x-6 gap-y-0.5 md:grid-cols-2">
              {cmd.activity.slice(0, VISIBLE_EVENTS).map((e) => {
                const detail = eventDetail(e);
                return (
                  <li key={e.id} className="flex min-w-0 gap-3 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.03]">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE[e.tone])} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <time dateTime={e.at} className="shrink-0 tabular-nums text-white/45" title={new Date(e.at).toLocaleString('es-MX')}>
                          {relativeTime(e.at, now)}
                        </time>
                        <span className="font-medium text-white/85">{eventTitle(e)}</span>
                      </p>
                      <p className="truncate text-[11px] text-white/45" title={detail ?? undefined}>
                        <span className="text-white/35">{KIND_LABEL[e.kind]}</span>
                        {detail ? ` · ${detail}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )
        }
      </SourceGate>
    </Panel>
  );
}
