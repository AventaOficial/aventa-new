'use client';

import { ArrowDown, ArrowUp, Tag } from 'lucide-react';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { OwnerRangeKey } from '@/lib/owner/ownerRange';
import { cn } from '@/app/components/panel/utils';
import type { SourceState } from '../types';
import { CEO_CARD_DRILLDOWN } from '../drilldowns';
import { Card, CardError, CardHeader, CardLoading, NA, RangeChip, ThinBar, type BarTone } from './kit';
import { formatCount, share, VS_LABEL } from './model';

function AbsDelta({ current, previous, vs }: { current: number | null; previous: number | null; vs: string }) {
  if (current == null || previous == null) {
    return <NA why="Sin dato del período anterior: la variación no es calculable." className="text-[12px]" />;
  }
  const diff = current - previous;
  const Icon = diff >= 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums', diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-white/55')}
      title={`Anterior: ${previous.toLocaleString('es-MX')}`}
    >
      {diff !== 0 ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
      {Math.abs(diff).toLocaleString('es-MX')}
      <span className="font-normal text-white/55">{vs}</span>
    </span>
  );
}

export default function OffersCard({
  source,
  range,
  onRangeChange,
  onRetry,
  className,
}: {
  source: SourceState<OwnerCommandPayload>;
  range: OwnerRangeKey;
  onRangeChange: (r: OwnerRangeKey) => void;
  onRetry: () => void;
  className?: string;
}) {
  const cmd = source.data;
  const approved = cmd?.moderation.approved.value ?? null;
  const pending = cmd?.catalog.pending ?? null;
  const rejected = cmd?.moderation.rejected.value ?? null;
  const total = approved != null && pending != null && rejected != null ? approved + pending + rejected : null;
  const rows: { label: string; value: number | null; dot: string; tone: BarTone; hint: string }[] = [
    { label: 'Aprobadas', value: approved, dot: 'bg-emerald-400', tone: 'violet', hint: 'Aprobaciones registradas en el período' },
    { label: 'Pendientes', value: pending, dot: 'bg-amber-400', tone: 'amber', hint: 'Cola actual de moderación (ahora, no solo del período)' },
    { label: 'Rechazadas', value: rejected, dot: 'bg-red-500', tone: 'red', hint: 'Rechazos registrados en el período' },
  ];

  return (
    <Card labelledBy="ceo-offers" className={className} href={CEO_CARD_DRILLDOWN.offers}>
      <CardHeader
        id="ceo-offers"
        title={
          <>
            Ofertas<span className="hidden @[13rem]:inline"> publicadas</span>
          </>
        }
        icon={Tag}
        action={<RangeChip range={range} onChange={onRangeChange} label="Período de ofertas publicadas" />}
      />
      {cmd == null ? (
        source.status === 'error' ? (
          <CardError message="No se pudieron cargar las ofertas." onRetry={onRetry} />
        ) : (
          <CardLoading rows={4} />
        )
      ) : (
        <>
          <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-white" title="Ofertas creadas en el período (todas las fuentes)">
            {cmd.community.offersCreated.value == null ? <NA why="Las ofertas no se pudieron leer." /> : formatCount(cmd.community.offersCreated.value)}
          </p>
          <p className="mb-2 mt-1">
            <AbsDelta current={cmd.community.offersCreated.value} previous={cmd.community.offersCreated.previous} vs={VS_LABEL[cmd.range.key]} />
          </p>
          <ul className="mt-auto space-y-1.5 rounded-xl border border-white/[0.05] bg-white/[0.025] px-2.5 py-2">
            {rows.map((r) => {
              const pct = share(r.value, total);
              return (
                <li key={r.label} title={r.hint}>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', r.dot)} aria-hidden />
                    <b className="w-7 shrink-0 font-semibold tabular-nums text-white">{r.value == null ? <NA why={r.hint} /> : formatCount(r.value)}</b>
                    <span className="min-w-0 flex-1 truncate text-white/70">{r.label}</span>
                    <span className="shrink-0 tabular-nums text-white/55">{pct == null ? <NA why="Sin total calculable." /> : `${pct}%`}</span>
                  </div>
                  <ThinBar pct={pct} tone={r.tone} className="mt-1 h-1" />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
