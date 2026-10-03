'use client';

import { MessagesSquare } from 'lucide-react';
import type { OwnerCommandPayload, RangeMetric } from '@/lib/owner/buildOwnerCommand';
import { ProvenanceBadge } from '../ui';
import type { SourceState } from '../types';
import { Card, CardError, CardHeader, CardLoading, DeltaPct, NA, ViewLink } from './kit';
import { formatCount, VS_LABEL } from './model';

/** Plaza: cola de solicitudes (ahora) y actividad del período. */
export default function PlazaCard({
  source,
  onRetry,
  className,
}: {
  source: SourceState<OwnerCommandPayload>;
  onRetry: () => void;
  className?: string;
}) {
  const cmd = source.data;

  const periodRow = (label: string, m: RangeMetric, hint: string) => (
    <li key={label} className="flex items-center justify-between gap-2 py-2 text-[12px]" title={hint}>
      <span className="min-w-0 text-white/70">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        <b className="font-semibold tabular-nums text-white">{m.value == null ? <NA why={`No se pudo leer: ${hint.toLowerCase()}`} /> : formatCount(m.value)}</b>
        <DeltaPct current={m.value} previous={m.previous} vsLabel={cmd ? VS_LABEL[cmd.range.key] : undefined} />
      </span>
    </li>
  );

  return (
    <Card labelledBy="ceo-plaza" className={className}>
      <CardHeader
        id="ceo-plaza"
        title="Plaza"
        icon={MessagesSquare}
        action={
          <>
            <ProvenanceBadge kind={cmd && cmd.plaza.pendingRequests != null ? 'REAL' : 'UNAVAILABLE'} />
            <ViewLink href="/plaza" label="Abrir Plaza">
              Ver
            </ViewLink>
          </>
        }
      />
      {cmd == null ? (
        source.status === 'error' ? (
          <CardError message="No se pudo cargar Plaza. Detalle en Diagnóstico técnico." onRetry={onRetry} />
        ) : (
          <CardLoading rows={3} />
        )
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3" title="Solicitudes de ofertas esperando respuesta (ahora)">
              <p className="text-[11px] text-white/55">Solicitudes abiertas</p>
              <p className="mt-1 text-[22px] font-semibold leading-tight tabular-nums text-white">
                {cmd.plaza.pendingRequests == null ? <NA why="Las solicitudes no se pudieron leer." /> : formatCount(cmd.plaza.pendingRequests)}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3" title="Solicitudes aprobadas (histórico total)">
              <p className="text-[11px] text-white/55">Aprobadas · histórico</p>
              <p className="mt-1 text-[22px] font-semibold leading-tight tabular-nums text-white">
                {cmd.plaza.approvedRequests == null ? <NA why="Las solicitudes resueltas no se pudieron leer." /> : formatCount(cmd.plaza.approvedRequests)}
              </p>
            </div>
          </div>
          <ul className="mt-2 divide-y divide-white/[0.05]">
            {periodRow('Solicitudes nuevas', cmd.community.plazaRequests, 'Solicitudes creadas en el período')}
            {periodRow('Conversaciones nuevas', cmd.community.plazaDiscussions, 'Conversaciones creadas en el período')}
            {periodRow('Cazadores activos', cmd.community.activeHunters, 'Personas (sin bots) que publicaron ofertas en el período')}
          </ul>
        </>
      )}
    </Card>
  );
}
