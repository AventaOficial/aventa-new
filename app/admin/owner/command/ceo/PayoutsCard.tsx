'use client';

import { Users, Wallet } from 'lucide-react';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { cn } from '@/app/components/panel/utils';
import type { SourceState } from '../types';
import { CEO_CARD_DRILLDOWN } from '../drilldowns';
import { Card, CardError, CardHeader, CardLoading, Chip, NA, ViewLink } from './kit';
import { openPayoutIntents, payoutIntentCounts } from '@/lib/owner/executiveFinance';
import { formatCount } from './model';

const NO_AMOUNTS = 'Este panel solo cuenta intents. No expone montos y un PAID de recompensa no entra aquí.';

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
  const intents = payoutIntentCounts(byStatus);
  const reserved = intents.reserved;
  const sent = intents.submitted;
  const incidents = intents.failed != null && intents.unknown != null ? intents.failed + intents.unknown : null;
  const provider = intents.providerResolved;
  const open = openPayoutIntents(byStatus);
  const frozen = cmd?.finance.moneyPathFrozen ?? null;
  const batch = cmd?.finance.latestPayoutBatch ?? null;

  const rows = [
    { label: 'Reservados', value: reserved, dot: 'bg-red-500', hint: 'Intents reservados, aún no enviados. No son recompensas PAID.' },
    { label: 'Enviados', value: sent, dot: 'bg-amber-400', hint: 'El proveedor fue contactado. Todavía no es un pago confirmado.' },
    { label: 'Incidencia', value: incidents, dot: 'bg-rose-400', hint: 'FAILED o UNKNOWN. UNKNOWN no es éxito.' },
    { label: 'Proveedor', value: provider, dot: 'bg-emerald-400', hint: 'SUCCEEDED: referencia del proveedor, no evidencia bancaria.' },
  ];

  return (
    <Card labelledBy="ceo-payouts" className={className} href={CEO_CARD_DRILLDOWN.payouts}>
      <CardHeader         id="ceo-payouts" title="Pagos" icon={Wallet} action={
          <ViewLink href={CEO_CARD_DRILLDOWN.payouts} label="Ver pagos a cazadores">
            Ver<span className="hidden @[13rem]:inline"> pagos</span>
          </ViewLink>
        }
      />
      {cmd == null ? (
        source.status === 'error' ? (
          <CardError message="No se pudieron cargar los pagos." onRetry={onRetry} />
        ) : (
          <CardLoading rows={4} />
        )
      ) : (
        <>
          <p className="mt-2 flex items-baseline gap-1.5 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-white" title="Intents abiertos: reservados, enviados o con resultado desconocido. No incluye PAID ni SUCCEEDED.">
            {open == null ? <NA why="Los pagos no se pudieron leer." /> : formatCount(open)}
            <span className="text-[12px] font-medium tracking-normal text-white/50">abiertos</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/60" title="No se agregan beneficiarios distintos en este panel.">
              <Users className="h-3.5 w-3.5" aria-hidden />
              <NA why="No se agregan beneficiarios distintos en este panel." /> usuarios
            </span>
            {frozen || cmd.finance.economicGate?.payout !== 'ALLOWED' ? (
              <Chip tone="sky" hint="PAYOUT: FROZEN. La política fiscal sigue sin confirmar y la compuerta de activación está incompleta.">
                PAYOUT: FROZEN
              </Chip>
            ) : open ? (
              <Chip tone="red">Pendiente</Chip>
            ) : null}
          </div>
          <p className="mt-1.5 truncate text-[11px] text-white/45">
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
                <span className="hidden w-16 text-right tabular-nums @[13rem]:inline">
                  <NA why={NO_AMOUNTS} />
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-2 lg:hidden">
            <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[10px] leading-snug text-white/45">
              {frozen
                ? 'Flujo congelado. Estos conteos no son montos ni pagos confirmados.'
                : 'Conteos de intents. Una recompensa PAID no aparece aquí como pago abierto.'}
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
