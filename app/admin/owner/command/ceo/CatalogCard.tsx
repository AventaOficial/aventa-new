'use client';

import { Layers } from 'lucide-react';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { cn } from '@/app/components/panel/utils';
import { ProvenanceBadge } from '../ui';
import type { SourceState } from '../types';
import { Card, CardError, CardHeader, CardLoading, NA, ThinBar, ViewLink, type BarTone } from './kit';
import { formatCount, share } from './model';

/** Estado actual del catálogo (no depende del período). Rescatado de la antigua "Salud del catálogo". */
export default function CatalogCard({
  source,
  onRetry,
  className,
}: {
  source: SourceState<OwnerCommandPayload>;
  onRetry: () => void;
  className?: string;
}) {
  const cmd = source.data;
  const c = cmd?.catalog;
  const rows: { label: string; value: number | null; dot: string; tone: BarTone; hint: string }[] = c
    ? [
        { label: 'Publicadas y vigentes', value: c.live, dot: 'bg-emerald-400', tone: 'green', hint: 'Ofertas aprobadas que no han expirado' },
        { label: 'En cola de moderación', value: c.pending, dot: 'bg-amber-400', tone: 'amber', hint: 'Ofertas esperando revisión' },
        { label: 'Expiradas', value: c.expired, dot: 'bg-violet-400', tone: 'violet', hint: 'Ofertas aprobadas cuya vigencia ya pasó' },
        { label: 'Rechazadas', value: c.rejected, dot: 'bg-red-500', tone: 'red', hint: 'Ofertas rechazadas (no eliminadas)' },
      ]
    : [];
  const known = rows.every((r) => r.value != null);
  const total = known ? rows.reduce((a, r) => a + (r.value ?? 0), 0) : null;

  return (
    <Card labelledBy="ceo-catalog" className={className}>
      <CardHeader
        id="ceo-catalog"
        title="Estado del catálogo"
        suffix="· ahora"
        icon={Layers}
        action={
          <>
            <ProvenanceBadge kind={cmd && known ? 'REAL' : 'UNAVAILABLE'} hint="Conteo actual de ofertas por estado; no depende del período." />
            <ViewLink href="/admin/moderation" label="Abrir moderación">
              Moderar
            </ViewLink>
          </>
        }
      />
      {cmd == null ? (
        source.status === 'error' ? (
          <CardError message="No se pudo cargar el catálogo. Detalle en Diagnóstico técnico." onRetry={onRetry} />
        ) : (
          <CardLoading rows={4} />
        )
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => {
            const pct = share(r.value, total);
            return (
              <li key={r.label} title={r.hint}>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', r.dot)} aria-hidden />
                  <span className="min-w-0 flex-1 text-white/70">{r.label}</span>
                  <b className="shrink-0 font-semibold tabular-nums text-white">{r.value == null ? <NA why={`No se pudo leer: ${r.hint.toLowerCase()}`} /> : formatCount(r.value)}</b>
                  <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/45">{pct == null ? '—' : `${pct}%`}</span>
                </div>
                <ThinBar pct={pct} tone={r.tone} className="mt-1.5 h-1" />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
