'use client';

import { CalendarRange, Megaphone } from 'lucide-react';
import { CtaLink, EmptyNote, ErrorNote, Panel, ProvenanceBadge, SkeletonRows } from './ui';
import { formatYmdShort, upcomingSeasons } from './seasons';
import type { AnnouncementRow, SourceState } from './types';

export default function SeasonPanel({
  todayYmd,
  announcements,
  onRetry,
}: {
  todayYmd: string;
  announcements: SourceState<AnnouncementRow[]>;
  onRetry: () => void;
}) {
  const seasons = upcomingSeasons(todayYmd);
  const active = announcements.data?.filter((a) => a.active) ?? [];

  return (
    <Panel
      id="temporadas"
      title="Temporadas y campañas"
      icon={CalendarRange}
      subtitle="Calendario de compra de México (lib/achievements/calendar) y avisos activos del sitio."
      badge={<ProvenanceBadge kind="DERIVED" hint="Fechas calculadas con isSeasonWindow / isBlackFridayWindow." />}
    >
      {seasons.length === 0 ? (
        <EmptyNote>Sin temporadas en los próximos 8 meses según el calendario.</EmptyNote>
      ) : (
        <ul className="space-y-2">
          {seasons.map((s, i) => (
            <li
              key={s.id}
              className={
                i === 0
                  ? 'rounded-xl border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.12] to-transparent p-3'
                  : 'rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2'
              }
            >
              <div className="flex items-center justify-between gap-2">
                <p className={i === 0 ? 'text-base font-semibold text-white' : 'text-xs font-medium text-white/75'}>{s.name}</p>
                <span className="shrink-0 text-[11px] tabular-nums text-violet-200/80">
                  {s.active ? 'En curso' : `en ${s.daysUntil} d`}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-white/45">
                {formatYmdShort(s.start)} – {formatYmdShort(s.end)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-white/[0.06] pt-3">
        <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
          <Megaphone className="h-3.5 w-3.5" aria-hidden /> Avisos activos <ProvenanceBadge kind={announcements.data ? 'REAL' : 'UNKNOWN'} hint="announcements.active" />
        </p>
        {announcements.data == null && announcements.status === 'error' ? (
          <ErrorNote message={`Avisos no disponibles: ${announcements.error ?? 'error'}`} onRetry={onRetry} />
        ) : announcements.data == null ? (
          <SkeletonRows rows={1} />
        ) : active.length === 0 ? (
          <p className="text-xs text-white/40">Ningún aviso activo. No existe un sistema de campañas programadas: solo avisos manuales.</p>
        ) : (
          <ul className="space-y-1 text-xs text-white/70">
            {active.slice(0, 3).map((a) => (
              <li key={a.id} className="truncate">
                • {a.title}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2">
          <CtaLink href="/admin/announcements">Gestionar avisos</CtaLink>
        </div>
      </div>
    </Panel>
  );
}
