'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ModeratorActivity, OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { cn } from '@/app/components/panel/utils';
import type { SourceState } from '../types';
import { Card, CardError, CardHeader, Chip, EmptyFrame, FOCUS_RING, NA, Skel, ViewLink } from './kit';
import { formatCount, initials, PERIOD_SUFFIX } from './model';

const NO_PRESENCE = 'Aventa no registra presencia, turnos ni pausas de moderadores.';
const NO_HOURS = 'Horas conectadas no disponibles: no existe registro de sesiones de moderación.';

function Avatar({ m }: { m: ModeratorActivity }) {
  return (
    <span className="relative inline-flex h-8 w-8 shrink-0">
      <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-violet-500/20 text-[11px] font-bold text-violet-200">
        {m.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(m.displayName)
        )}
      </span>
      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#12121c] bg-white/30" title={NO_PRESENCE} aria-hidden />
    </span>
  );
}

export default function ModerationCard({
  source,
  onRetry,
  className,
}: {
  source: SourceState<OwnerCommandPayload>;
  onRetry: () => void;
  className?: string;
}) {
  const cmd = source.data;
  const mods = cmd?.moderation.moderators ?? null;
  const active = cmd?.moderation.activeModerators ?? null;
  const team = cmd?.moderation.teamSize ?? null;
  const approved = cmd?.moderation.approved.value;
  const rejected = cmd?.moderation.rejected.value;
  const decided = approved != null && rejected != null ? approved + rejected : null;
  const suffix = cmd ? PERIOD_SUFFIX[cmd.range.key] : 'hoy';

  return (
    <Card labelledBy="ceo-moderation" className={className}>
      <CardHeader
        id="ceo-moderation"
        title="Equipo de moderación"
        action={<ViewLink href="/admin/team" label="Ver equipo de moderación">Ver equipo</ViewLink>}
      />
      {cmd == null && source.status === 'error' ? (
        <CardError message="No se pudo cargar el equipo de moderación. Detalle en Diagnóstico técnico." onRetry={onRetry} />
      ) : (
        <>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <p
              className="flex min-w-0 items-center gap-2 whitespace-nowrap text-[15px] font-semibold tabular-nums text-white"
              title="Moderadores con decisiones en el período / usuarios con rol owner, admin o moderator"
            >
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', active ? 'bg-emerald-400' : 'bg-white/30')} aria-hidden />
              {cmd == null ? (
                <Skel className="h-4 w-16" />
              ) : (
                <span>
                  {formatCount(active)} / {team == null ? <NA why="Los roles del equipo no se pudieron leer." /> : formatCount(team)}{' '}
                  <span className="text-[11px] font-medium text-white/75">con actividad</span>
                </span>
              )}
            </p>
            <p className="flex shrink-0 items-center gap-1.5 text-right">
              <b className="text-[15px] font-semibold tabular-nums text-white">{cmd == null ? '' : formatCount(decided)}</b>
              <span className="w-[62px] text-left text-[9.5px] leading-tight text-white/50">ofertas moderadas {suffix}</span>
            </p>
          </div>

          {cmd == null ? (
            <ul className="mt-3 space-y-2.5" aria-busy="true" aria-label="Cargando">
              {Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <Skel className="h-9 w-9 rounded-full" />
                  <Skel className="h-8 flex-1" />
                </li>
              ))}
            </ul>
          ) : mods == null ? (
            <EmptyFrame className="mt-3 flex-1">Lista de moderadores no disponible para este período.</EmptyFrame>
          ) : mods.length === 0 ? (
            <EmptyFrame className="mt-3 flex-1">Sin decisiones de moderación en el período.</EmptyFrame>
          ) : (
            <ul className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto [scrollbar-width:thin]">
              {mods.slice(0, 7).map((m) => {
                const name = m.displayName ?? 'Moderador sin nombre';
                return (
                  <li key={m.userId} className="flex items-center gap-2 rounded-xl py-1">
                    <Avatar m={m} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-semibold text-white" title={name}>
                        {name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] text-white/50" title={NO_PRESENCE}>
                        <span className="h-1.5 w-1.5 rounded-full bg-white/30" aria-hidden />
                        Sin presencia
                      </p>
                    </div>
                    <span
                      className="shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-white/70"
                      title={`${m.approved} aprobadas · ${m.rejected} rechazadas`}
                    >
                      <b className="font-semibold text-white">{m.decisions}</b> {suffix}
                    </span>
                    <Link
                      href="/admin/logs"
                      aria-label={`Ver bitácora de moderación (${name})`}
                      className={cn('-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/40 hover:bg-white/[0.06] hover:text-white/80', FOCUS_RING)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {mods && mods.length > 7 ? (
            <p className="mt-2 text-[10px] text-white/40">+{mods.length - 7} moderadores más en el período.</p>
          ) : null}
          <div className="mt-2 lg:hidden">
            <Chip tone="gray" hint={`${NO_PRESENCE} ${NO_HOURS}`}>
              Presencia y horas no disponibles
            </Chip>
          </div>
        </>
      )}
    </Card>
  );
}
