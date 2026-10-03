'use client';

import { History } from 'lucide-react';
import type { ActivityEvent, OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { cn } from '@/app/components/panel/utils';
import { CtaLink, EmptyNote, Panel, ProvenanceBadge, SourceGate, relativeTime } from './ui';
import type { SourceState } from './types';

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
  integrity: 'Cron',
  queue: 'Worker',
};

export default function ActivityTimeline({ command, now, onRetry }: { command: SourceState<OwnerCommandPayload>; now: number; onRetry: () => void }) {
  return (
    <Panel
      id="actividad"
      title="Actividad reciente"
      icon={History}
      subtitle="Últimos eventos de moderación, ofertas, reportes, Hunter, crons y worker."
      badge={<ProvenanceBadge kind={command.data ? 'REAL' : 'UNKNOWN'} hint="moderation_logs, offers, offer_reports, hunter_supply_runs, user_bans, app_config, write_jobs_queue" />}
      action={<CtaLink href="/admin/logs">Ver log</CtaLink>}
    >
      <SourceGate source={command} onRetry={onRetry} rows={4} label="actividad">
        {(cmd) =>
          cmd.activity.length === 0 ? (
            <EmptyNote>Sin eventos registrados.</EmptyNote>
          ) : (
            <ol className="relative max-h-[420px] space-y-0.5 overflow-y-auto pr-1">
              {cmd.activity.map((e) => (
                <li key={e.id} className="flex gap-3 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.02]">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE[e.tone])} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                      <time dateTime={e.at} className="shrink-0 tabular-nums text-white/40" title={new Date(e.at).toLocaleString('es-MX')}>
                        {relativeTime(e.at, now)}
                      </time>
                      <span className="font-medium text-white/80">{e.title}</span>
                    </p>
                    <p className="truncate text-[11px] text-white/40">
                      <span className="text-white/30">{KIND_LABEL[e.kind]}</span>
                      {e.detail ? ` · ${e.detail}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )
        }
      </SourceGate>
    </Panel>
  );
}
