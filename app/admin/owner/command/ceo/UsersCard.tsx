'use client';

import { Users } from 'lucide-react';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { SourceState } from '../types';
import { BarSeries } from './charts';
import { Card, CardError, CardHeader, CardLoading, Chip, EmptyFrame, NA } from './kit';
import { formatCount, PERIOD_SUFFIX, PERIOD_TITLE } from './model';

const NO_PRESENCE =
  'Aventa no registra presencia en tiempo real. Se cuentan usuarios cuyo último acceso cae dentro del período.';

function chartData(cmd: OwnerCommandPayload): { values: (number | null)[]; labels: string[] } {
  const pts = cmd.series.points;
  const values: (number | null)[] = pts.map((p) => p.activeUsers);
  const labels = pts.map((p) => p.label);
  if (cmd.series.bucket === 'hour' && cmd.range.key === 'today') {
    for (let h = pts.length; h < 24; h += 1) {
      values.push(null);
      labels.push(String(h).padStart(2, '0'));
    }
  }
  return { values, labels };
}

export default function UsersCard({
  source,
  onRetry,
  className,
}: {
  source: SourceState<OwnerCommandPayload>;
  onRetry: () => void;
  className?: string;
}) {
  const cmd = source.data;
  const title = cmd ? `Usuarios activos (${PERIOD_TITLE[cmd.range.key]})` : 'Usuarios activos';
  return (
    <Card labelledBy="ceo-users" className={className}>
      <CardHeader
        id="ceo-users"
        title={title}
        icon={Users}
        action={
          <Chip tone="gray" hint={NO_PRESENCE}>
            No en vivo
          </Chip>
        }
      />
      {cmd == null ? (
        source.status === 'error' ? (
          <CardError message="No se pudieron cargar los usuarios. Detalle en Diagnóstico técnico." onRetry={onRetry} />
        ) : (
          <CardLoading rows={4} />
        )
      ) : (
        <>
          <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-white" title={NO_PRESENCE}>
            {cmd.users.activeUsers == null ? <NA why="La actividad de usuarios no se pudo leer." /> : formatCount(cmd.users.activeUsers)}
          </p>
          <ul className="mt-2 space-y-0.5 text-[11px] text-white/70">
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-violet-500" aria-hidden />
              <b className="font-semibold tabular-nums text-white">{formatCount(cmd.users.activeUsers)}</b> con último acceso
            </li>
            <li className="flex items-center gap-2" title="Autores humanos distintos con ofertas creadas en el período">
              <span className="h-2 w-2 rounded-full bg-violet-400" aria-hidden />
              <b className="font-semibold tabular-nums text-white">{formatCount(cmd.community.activeHunters.value)}</b> publicando
            </li>
            <li className="flex items-center gap-2" title="Cuentas creadas en el período">
              <span className="h-2 w-2 rounded-full bg-violet-300" aria-hidden />
              <b className="font-semibold tabular-nums text-white">{formatCount(cmd.users.newUsers.value)}</b> nuevos {PERIOD_SUFFIX[cmd.range.key]}
            </li>
          </ul>
          <div className="flex min-h-0 flex-1 flex-col justify-end pt-2">
            {cmd.series.activeUsersAvailable ? (
              <BarSeries
                {...chartData(cmd)}
                height={36}
                fill
                labelEvery={cmd.range.key === 'today' ? 4 : undefined}
                ariaLabel={`Usuarios por ${cmd.series.bucket === 'hour' ? 'hora' : 'día'} de último acceso`}
              />
            ) : (
              <EmptyFrame className="h-[70px]">Serie de accesos no disponible para este período.</EmptyFrame>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
