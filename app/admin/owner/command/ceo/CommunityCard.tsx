'use client';

import { Flag, Heart, MessageCircle, Tag, ThumbsUp, User, Users, type LucideIcon } from 'lucide-react';
import type { OwnerCommandPayload, RangeMetric } from '@/lib/owner/buildOwnerCommand';
import { cn } from '@/app/components/panel/utils';
import type { SourceState } from '../types';
import { Card, CardError, CardHeader, DeltaPct, NA, Skel, ViewLink } from './kit';
import { formatCount, PERIOD_TITLE } from './model';

type Tile = {
  id: string;
  label: string;
  metric: RangeMetric;
  icon: LucideIcon;
  tone: string;
  invert?: boolean;
  hint: string;
};

function tiles(c: OwnerCommandPayload['community']): Tile[] {
  return [
    { id: 'offers', label: 'Ofertas publicadas', metric: c.offersCreated, icon: Tag, tone: 'bg-[#5b3fd0] text-violet-100', hint: 'Ofertas creadas en el período' },
    { id: 'votes', label: 'Votos', metric: c.votes, icon: ThumbsUp, tone: 'bg-[#2f5bd8] text-blue-100', hint: 'Votos en ofertas del período' },
    { id: 'comments', label: 'Comentarios', metric: c.comments, icon: MessageCircle, tone: 'bg-[#1786c9] text-sky-100', hint: 'Comentarios del período' },
    { id: 'favorites', label: 'Favoritos', metric: c.favorites, icon: Heart, tone: 'bg-[#c92c4b] text-rose-100', hint: 'Ofertas guardadas como favoritas en el período' },
    { id: 'reports', label: 'Reportes', metric: c.reports, icon: Flag, tone: 'bg-[#6b46d6] text-violet-100', invert: true, hint: 'Reportes de usuarios en el período (menos es mejor)' },
    { id: 'hunters', label: 'Cazadores activos', metric: c.activeHunters, icon: User, tone: 'bg-[#13966a] text-emerald-100', hint: 'Autores humanos distintos con ofertas en el período (sin bots)' },
  ];
}

export default function CommunityCard({
  source,
  onRetry,
  className,
}: {
  source: SourceState<OwnerCommandPayload>;
  onRetry: () => void;
  className?: string;
}) {
  const cmd = source.data;
  return (
    <Card labelledBy="ceo-community" className={className}>
      <CardHeader
        id="ceo-community"
        title="Actividad de la comunidad"
        suffix={cmd ? `(${PERIOD_TITLE[cmd.range.key]})` : undefined}
        icon={Users}
        iconStyle="plain"
        action={<ViewLink href="/admin/owner/crecimiento" label="Ver más sobre la actividad de la comunidad">Ver más</ViewLink>}
      />
      {cmd == null && source.status === 'error' ? (
        <CardError message="No se pudo cargar la actividad de la comunidad. Detalle en Diagnóstico técnico." onRetry={onRetry} />
      ) : (
        <ul className="mt-3.5 grid flex-1 grid-cols-3 gap-2 sm:grid-cols-6">
          {(cmd ? tiles(cmd.community) : Array.from({ length: 6 }, () => null)).map((t, i) => (
            <li key={t?.id ?? i} className="flex min-w-0 flex-col rounded-xl border border-white/[0.05] bg-white/[0.03] px-2 py-2.5">
              {t == null ? (
                <>
                  <Skel className="h-10 w-10 rounded-xl" />
                  <Skel className="mt-3 h-5 w-10" />
                  <Skel className="mt-1.5 h-3 w-full" />
                </>
              ) : (
                <>
                  <span
                    className={cn('inline-flex h-10 w-10 items-center justify-center rounded-xl shadow-[0_8px_18px_-10px_rgba(0,0,0,0.8)]', t.tone)}
                    aria-hidden
                  >
                    <t.icon className="h-5 w-5" fill="currentColor" strokeWidth={1.5} />
                  </span>
                  <p className="mt-2.5 text-[22px] font-bold leading-none tabular-nums text-white" title={t.hint}>
                    {t.metric.value == null ? <NA why={`No se pudo leer: ${t.hint.toLowerCase()}`} /> : formatCount(t.metric.value)}
                  </p>
                  <p className="mt-1 text-[10px] leading-tight text-white/55">{t.label}</p>
                  <p className="mt-auto pt-1">
                    <DeltaPct current={t.metric.value} previous={t.metric.previous} invert={t.invert} />
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
