'use client';

import { Users, Wallet } from 'lucide-react';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { cn } from '@/app/components/panel/utils';
import type { SourceState } from '../types';
import { Card, CardError, CardHeader, CardLoading, Chip, NA, ViewLink } from './kit';
import { formatCount } from './model';

const NO_AMOUNTS = 'Este panel solo muestra conteos de pagos por estado; no expone montos.';

export default function PayoutsCard({
  source,
  onRetry,
  className,
}: {
  source: SourceState<OwnerCommandPayload>;
  onRetry: () => void;
  className?: string;
}) {
  const cmd = source.data;
  const byStatus = cmd?.finance.payoutIntentsByStatus ?? null;
  const get = (...keys: string[]) => (byStatus ? keys.reduce((acc, k) => acc + (byStatus[k] ?? 0), 0) : null);
  const reserved = get('RESERVED');
  const review = get('SUBMITTED', 'UNKNOWN');
  const ready = get('SUCCEEDED');
  const open = reserved != null && review != null ? reserved + review : null;
  const frozen = cmd?.finance.moneyPathFrozen ?? null;
  const batch = cmd?.finance.latestPayoutBatch ?? null;

  const rows = [
    { label: 'Pendientes', value: reserved, dot: 'bg-red-500', hint: 'Pagos reservados, aún no enviados.' },
    { label: 'En revisión', value: review, dot: 'bg-amber-400', hint: 'Pagos enviados o por confirmar con el proveedor.' },
    { label: 'Listos', value: ready, dot: 'bg-emerald-400', hint: 'Pagos completados según el proveedor (no es evidencia bancaria).' },
  ];

  return (
    <Card labelledBy="ceo-payouts" className={className}>
      <CardHeader id="ceo-payouts" title="Pagos pendientes" icon={Wallet} action={<ViewLink href="/equipo/contabilidad" label="Ver pagos en contabilidad">Ver pagos</ViewLink>} />
      {cmd == null ? (
        source.status === 'error' ? (
          <CardError message="No se pudieron cargar los pagos. Detalle en Diagnóstico técnico." onRetry={onRetry} />
        ) : (
          <CardLoading rows={4} />
        )
      ) : (
        <>
          <p className="mt-2 flex items-baseline gap-1.5 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-white" title="Pagos abiertos: pendientes + en revisión">
            {open == null ? <NA why="Los pagos no se pudieron leer." /> : formatCount(open)}
            <span className="text-[12px] font-medium tracking-normal text-white/50">abiertos</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/60" title="No se agregan beneficiarios distintos en este panel.">
              <Users className="h-3.5 w-3.5" aria-hidden />
              <NA why="No se agregan beneficiarios distintos en este panel." /> usuarios
            </span>
            {frozen ? (
              <Chip tone="sky" hint="Flujo de dinero congelado: no hay pagos en curso desde este panel.">
                Congelado
              </Chip>
            ) : open ? (
              <Chip tone="red">Pendiente</Chip>
            ) : null}
          </div>
          <p className="mt-1.5 text-[11px] text-white/45">
            Último lote:{' '}
            {batch == null ? (
              <NA why="Los lotes de pago no se pudieron leer." />
            ) : batch.periodKey ? (
              <span className="text-white/70">
                {batch.periodKey} · {batch.status ?? 'sin estado'}
              </span>
            ) : (
              'sin lotes'
            )}
          </p>
          <ul className="mt-2.5 space-y-1.5 border-t border-white/[0.06] pt-2.5">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center gap-2 text-[11px]" title={r.hint}>
                <span className={cn('h-2 w-2 shrink-0 rounded-full', r.dot)} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-white/75">{r.label}</span>
                <b className="w-8 text-right font-semibold tabular-nums text-white">{r.value == null ? <NA why={r.hint} /> : formatCount(r.value)}</b>
                <span className="w-16 text-right tabular-nums">
                  <NA why={NO_AMOUNTS} />
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-2 lg:hidden">
            <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[10px] leading-snug text-white/45">
              {frozen
                ? 'Pagos congelados por protección del flujo de dinero. Solo conteos; los montos se consultan en Contabilidad.'
                : 'Conteos de pagos por estado; los montos se consultan en Contabilidad.'}
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
