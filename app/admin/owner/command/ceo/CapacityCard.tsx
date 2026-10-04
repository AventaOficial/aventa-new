'use client';

import type { ReactNode } from 'react';
import { Cpu, Gauge, HardDrive, Mail, Server, Users, type LucideIcon } from 'lucide-react';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { SourceState } from '../types';
import { Donut } from './charts';
import { Card, CardError, CardHeader, CardLoading, Chip, NA, ThinBar, ViewLink } from './kit';
import { formatCount, share } from './model';

type Row = { label: string; icon: LucideIcon; value: ReactNode; pct: number | null; why?: string; hint: string };

export default function CapacityCard({
  source,
  onRetry,
  className,
}: {
  source: SourceState<OwnerCommandPayload>;
  onRetry: () => void;
  className?: string;
}) {
  const cmd = source.data;
  const ops = cmd?.operations;
  const hunter = cmd?.hunter;

  const integrityChip =
    ops == null || ops.integrityOk == null ? (
      <Chip tone="gray" hint="No hay resultado registrado del chequeo de integridad.">
        Integridad sin dato
      </Chip>
    ) : ops.integrityOk ? (
      <Chip tone="green" hint={ops.integrityFinishedAt ? `Último chequeo: ${new Date(ops.integrityFinishedAt).toLocaleString('es-MX')}` : undefined}>
        Integridad OK
      </Chip>
    ) : (
      <Chip tone="red" hint={`${ops.integrityFailed ?? '?'} chequeo(s) fallidos`}>
        Integridad con fallos
      </Chip>
    );

  const hunterPct = hunter?.runs ? share(hunter.runsOk, hunter.runs) : null;
  const rows: Row[] = [
    { label: 'Usuarios simultáneos', icon: Users, value: null, pct: null, why: 'Sin presencia en tiempo real ni límite de concurrencia medido.', hint: 'Presencia en vivo' },
    { label: 'Solicitudes (rate limit)', icon: Gauge, value: null, pct: null, why: 'Los rate limits no exponen consumo agregado a este panel.', hint: 'Rate limit' },
    { label: 'Envío de correos', icon: Mail, value: null, pct: null, why: 'No hay métrica de envíos ni cuota del proveedor de correo.', hint: 'Correos' },
    {
      label: 'Procesamiento de ofertas',
      icon: Cpu,
      value:
        hunter?.runs == null ? null : (
          <>
            {formatCount(hunter.runsOk)} / {formatCount(hunter.runs)} <span className="text-white/45">runs OK</span>
          </>
        ),
      pct: hunterPct,
      why: 'Los runs de Hunter no se pudieron leer.',
      hint: 'Runs de Hunter terminados en el período con estado ok / total',
    },
    { label: 'Almacenamiento', icon: HardDrive, value: null, pct: null, why: 'Uso de storage no expuesto a este panel.', hint: 'Storage' },
  ];

  return (
    <Card labelledBy="ceo-capacity" className={className}>
      <CardHeader
        id="ceo-capacity"
        title={
          <>
            Capacidad<span className="hidden @md:inline"> de Aventa</span>
          </>
        }
        icon={Server}
        action={
          <>
            <ViewLink href="/admin/operaciones" label="Ver detalles de operaciones">
              Ver detalles
            </ViewLink>
            {integrityChip}
          </>
        }
      />
      {cmd == null ? (
        source.status === 'error' ? (
          <CardError message="No se pudo cargar la capacidad." onRetry={onRetry} />
        ) : (
          <CardLoading rows={5} />
        )
      ) : (
        <div className="mt-2 flex flex-1 flex-col items-center gap-3 @xs:flex-row @xs:items-center">
          <div className="flex flex-col items-center gap-1.5">
            <Donut pct={null} size={72} stroke={8}>
              <span className="text-[18px] font-semibold leading-none text-white">
                <NA why="No existe una métrica de capacidad total con base real; el porcentaje no se calcula." className="text-white/60" />
              </span>
              <span className="mt-0.5 text-[10px] text-white/55">Uso actual</span>
            </Donut>
            <p className="text-center text-[10px] leading-snug text-white/45" title="Escrituras diferidas (votos, eventos) en cola y fallidas">
              Cola escritura: <b className="font-semibold text-white/75">{formatCount(ops?.queuePending)}</b> pend. ·{' '}
              <b className={ops?.queueFailed ? 'font-semibold text-red-300' : 'font-semibold text-white/75'}>{formatCount(ops?.queueFailed)}</b> fallidos
            </p>
          </div>
          <ul className="w-full min-w-0 flex-1 space-y-1">
            {rows.map((r) => (
              <li
                key={r.label}
                className="grid grid-cols-[22px_minmax(0,1fr)_auto_26px] items-center gap-x-2 text-[11px] @lg:grid-cols-[22px_minmax(0,1fr)_auto_minmax(28px,52px)_26px]"
                title={r.hint}
              >
                <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md bg-violet-500/15 text-violet-300" aria-hidden>
                  <r.icon className="h-3 w-3" />
                </span>
                <span className="truncate leading-tight text-white/75">{r.label}</span>
                <span className="whitespace-nowrap text-right tabular-nums text-white/80">{r.value ?? <NA why={r.why ?? r.hint} long />}</span>
                <ThinBar pct={r.pct} className="hidden h-1 @lg:block" />
                <span className="w-8 text-right tabular-nums text-white/55">{r.pct == null ? <NA why={r.why ?? 'Sin base para porcentaje.'} /> : `${r.pct}%`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
