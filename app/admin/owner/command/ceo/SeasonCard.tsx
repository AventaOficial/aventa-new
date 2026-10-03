'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, Check, Tag } from 'lucide-react';
import { addCalendarDays } from '@/lib/achievements/calendar';
import { cn } from '@/app/components/panel/utils';
import { daysSinceYmd } from '../derive';
import { formatYmdShort, upcomingSeasons, type SeasonWindow } from '../seasons';
import { Card, CardHeader, EmptyFrame, FOCUS_RING, ViewButton } from './kit';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function rangeLong(start: string, end: string): string {
  const [ys, ms, ds] = start.split('-').map(Number);
  const [ye, me, de] = end.split('-').map(Number);
  if (ys === ye && ms === me) return `${ds} – ${de} de ${MONTHS[ms - 1]} ${ys}`;
  return `${ds} de ${MONTHS[ms - 1]} – ${de} de ${MONTHS[me - 1]} ${ye}`;
}

type Phase = { id: string; label: string; start: string; end: string };

/** Fases de preparación sugeridas (CALCULATED, no se guardan) contadas hacia atrás desde el arranque real. */
function phases(s: SeasonWindow): Phase[] {
  return [
    { id: 'plan', label: 'Planear', start: addCalendarDays(s.start, -35), end: addCalendarDays(s.start, -22) },
    { id: 'hunt', label: 'Cazar ofertas', start: addCalendarDays(s.start, -21), end: addCalendarDays(s.start, -8) },
    { id: 'validate', label: 'Validar y moderar', start: addCalendarDays(s.start, -7), end: addCalendarDays(s.start, -1) },
    { id: 'launch', label: 'Lanzar campaña', start: s.start, end: s.start },
  ];
}

function phaseRange(p: Phase): string {
  return p.start === p.end ? formatYmdShort(p.start) : `${formatYmdShort(p.start)} – ${formatYmdShort(p.end)}`;
}

/** Ilustración propia (SVG): bolsa de compras con etiqueta %, regalos y destellos. */
function SeasonArt() {
  return (
    <svg viewBox="0 0 260 170" className="absolute inset-y-0 right-0 h-full w-[62%] max-w-[300px]" aria-hidden preserveAspectRatio="xMaxYMid slice">
      <defs>
        <radialGradient id="season-glow" cx="62%" cy="58%" r="55%">
          <stop offset="0%" stopColor="#fb923c" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#c2410c" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#1e1036" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="season-bag" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fdba74" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id="season-gift" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#5b21b6" />
        </linearGradient>
      </defs>
      <rect width="260" height="170" fill="url(#season-glow)" />
      <circle cx="214" cy="30" r="16" fill="#fde68a" opacity="0.18" />
      <circle cx="214" cy="30" r="10" fill="#fde68a" opacity="0.35" />
      {/* skyline */}
      <path d="M40 170 V128 h14 v-16 h10 v16 h12 V104 h16 v66 Z M196 170 V118 h12 v-10 h8 v10 h12 v52 Z" fill="#140a26" opacity="0.9" />
      {/* bolsa */}
      <path d="M118 74 h64 l8 88 h-80 Z" fill="url(#season-bag)" />
      <path d="M134 74 v-10 a16 16 0 0 1 32 0 v10" fill="none" stroke="#7c2d12" strokeWidth="5" strokeLinecap="round" />
      <path d="M118 74 h64 l1 10 h-66 Z" fill="#7c2d12" opacity="0.35" />
      {/* etiqueta % */}
      <g transform="rotate(-14 160 122)">
        <rect x="138" y="104" width="44" height="34" rx="7" fill="#1e1036" />
        <circle cx="146" cy="121" r="3" fill="#fdba74" />
        <text x="164" y="129" textAnchor="middle" fontSize="20" fontWeight="800" fill="#fdba74" fontFamily="system-ui, sans-serif">
          %
        </text>
      </g>
      {/* regalos */}
      <rect x="76" y="128" width="40" height="34" rx="4" fill="url(#season-gift)" />
      <rect x="93" y="128" width="6" height="34" fill="#ede9fe" opacity="0.8" />
      <rect x="72" y="122" width="48" height="10" rx="3" fill="#7c3aed" />
      <rect x="194" y="138" width="30" height="24" rx="4" fill="url(#season-gift)" opacity="0.9" />
      <rect x="206" y="138" width="5" height="24" fill="#ede9fe" opacity="0.7" />
      {/* destellos */}
      <path d="M96 52 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" fill="#fde68a" opacity="0.9" />
      <path d="M226 78 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" fill="#fde68a" opacity="0.8" />
      <path d="M70 92 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z" fill="#c4b5fd" opacity="0.9" />
      <rect x="0" y="160" width="260" height="10" fill="#0f0820" opacity="0.6" />
    </svg>
  );
}

export default function SeasonCard({ todayYmd, className }: { todayYmd: string; className?: string }) {
  const [showAll, setShowAll] = useState(false);
  const seasons = upcomingSeasons(todayYmd);
  const next = seasons[0] ?? null;

  return (
    <Card labelledBy="ceo-season" className={className}>
      <CardHeader
        id="ceo-season"
        title="Siguiente temporada de ofertas"
        icon={CalendarDays}
        iconStyle="plain"
        action={
          <ViewButton onClick={() => setShowAll((v) => !v)} expanded={showAll} controls="ceo-season-calendar">
            Ver calendario
          </ViewButton>
        }
      />
      {showAll ? (
        <ul id="ceo-season-calendar" className="mt-3 space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 text-[11px]">
          {seasons.length === 0 ? (
            <li className="text-white/45">Sin temporadas en los próximos 8 meses.</li>
          ) : (
            seasons.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span className="font-medium text-white/85">{s.name}</span>
                <span className="tabular-nums text-white/55">
                  {formatYmdShort(s.start)} – {formatYmdShort(s.end)} · {s.active ? 'en curso' : `en ${s.daysUntil} d`}
                </span>
              </li>
            ))
          )}
          <li className="pt-1 text-[10px] text-white/35">Fuente: calendario de temporadas de México (lib/achievements/calendar).</li>
        </ul>
      ) : null}
      {next == null ? (
        <EmptyFrame className="mt-3 flex-1">Sin temporadas en los próximos 8 meses según el calendario.</EmptyFrame>
      ) : (
        <>
          <div className="relative mt-2 min-h-[124px] overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-[#2a1356] via-[#1b0f36] to-[#2b1022]">
            <SeasonArt />
            <div className="relative z-10 flex h-full flex-col items-start p-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white/90">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden />
                {next.active ? 'Temporada en curso' : 'Próxima temporada'}
              </span>
              <p className="mt-2 text-[22px] font-bold leading-none tracking-tight text-white">{next.name}</p>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-white/85">
                <Tag className="h-3.5 w-3.5 text-orange-300" aria-hidden />
                {rangeLong(next.start, next.end)}
                <span className="text-white/50">· {next.active ? 'en curso' : `en ${next.daysUntil} días`}</span>
              </p>
              <Link
                href="/admin/announcements"
                className={cn(
                  'mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_8px_22px_-10px_rgba(139,92,246,0.9)] hover:bg-violet-500',
                  FOCUS_RING,
                )}
              >
                Preparar temporada
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
          <ol className="mt-auto grid grid-cols-[repeat(4,minmax(0,1fr))] gap-1 pt-2" aria-label="Fases sugeridas de preparación (no se guardan)">
            {phases(next).map((p, i, all) => {
              const pastEnd = daysSinceYmd(p.end, todayYmd);
              const sinceStart = daysSinceYmd(p.start, todayYmd);
              const done = pastEnd != null && pastEnd > 0;
              const current = !done && sinceStart != null && sinceStart >= 0;
              return (
                <li key={p.id} className="relative flex min-w-0 flex-col items-start" title="Fase sugerida, calculada hacia atrás desde el inicio real de la temporada.">
                  <div className="flex w-full items-center">
                    <span
                      className={cn(
                        'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border',
                        done ? 'border-violet-500 bg-violet-600 text-white' : current ? 'border-violet-400 bg-violet-500/20' : 'border-white/25 bg-transparent',
                      )}
                      aria-label={done ? 'Completada' : current ? 'En curso' : 'Pendiente'}
                      role="img"
                    >
                      {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden /> : current ? <span className="h-1.5 w-1.5 rounded-full bg-violet-300" /> : null}
                    </span>
                    {i < all.length - 1 ? <span className="mx-1 h-px flex-1 border-t border-dashed border-white/20" aria-hidden /> : null}
                  </div>
                  <p className="mt-1.5 w-full break-words pr-1.5 text-[10px] font-medium leading-tight text-white/85">{p.label}</p>
                  <p className="mt-0.5 w-full break-words pr-1.5 text-[9px] leading-tight tabular-nums text-white/45">{phaseRange(p)}</p>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Card>
  );
}
