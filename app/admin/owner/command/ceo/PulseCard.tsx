'use client';

import type { ReactNode } from 'react';
import { Activity } from 'lucide-react';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload, RangeMetric } from '@/lib/owner/buildOwnerCommand';
import type { OwnerRangeKey } from '@/lib/owner/ownerRange';
import { ProvenanceBadge } from '../ui';
import type { Provenance, SourceState } from '../types';
import { Card, CardError, CardHeader, Chip, DeltaPct, NA, Skel } from './kit';
import { formatCount, formatMoneyCents, VS_LABEL } from './model';

type Kpi = {
  id: string;
  label: string;
  provenance: Provenance;
  value: ReactNode;
  foot: ReactNode;
  definition: string;
};

function sumMetrics(ms: RangeMetric[]): RangeMetric {
  const all = (k: 'value' | 'previous') => (ms.every((m) => m[k] != null) ? ms.reduce((a, m) => a + (m[k] ?? 0), 0) : null);
  return { value: all('value'), previous: all('previous') };
}

function economyFor(base: OwnerDashboardPayload | null, range: OwnerRangeKey) {
  if (!base) return null;
  if (range === 'today') return base.economy.day;
  if (range === '7d') return base.economy.week;
  if (range === 'month') return base.economy.month;
  return null;
}

/** Executive Pulse: indicadores del período con procedencia; % solo si hay período comparable (sin interpretar causa). */
export default function PulseCard({
  command,
  base,
  range,
  onRetry,
}: {
  command: SourceState<OwnerCommandPayload>;
  base: OwnerDashboardPayload | null;
  range: OwnerRangeKey;
  onRetry: () => void;
}) {
  const cmd = command.data;
  const vs = cmd ? VS_LABEL[cmd.range.key] : '';

  const delta = (m: RangeMetric, invert = false) => (
    <span className="flex flex-wrap items-center gap-1">
      <DeltaPct current={m.value} previous={m.previous} invert={invert} />
      {m.value != null && m.previous != null && m.previous > 0 ? <span className="text-[10px] text-white/40">{vs}</span> : null}
    </span>
  );
  const noCompare = (text = 'sin período comparable') => <span className="text-[10px] text-white/35">{text}</span>;
  const real = (m: RangeMetric): Provenance => (m.value == null ? 'UNAVAILABLE' : 'REAL');

  let kpis: Kpi[] = [];
  if (cmd) {
    const views = cmd.traffic.views.value;
    const out = cmd.traffic.outbound.value;
    const ctr = views != null && out != null && views > 0 ? Math.round((out / views) * 1000) / 10 : null;
    const ap = cmd.moderation.approved.value;
    const rj = cmd.moderation.rejected.value;
    const approvalRate = ap != null && rj != null && ap + rj > 0 ? Math.round((ap / (ap + rj)) * 100) : null;
    const engagement = sumMetrics([cmd.community.votes, cmd.community.comments, cmd.community.favorites]);
    const econ = economyFor(base, range);
    const frozen = base?.systemHealth.moneyPathFrozen ?? cmd.finance.moneyPathFrozen;
    kpis = [
      {
        id: 'active',
        label: 'Usuarios activos',
        provenance: cmd.users.activeUsers == null ? 'UNAVAILABLE' : 'REAL',
        value: cmd.users.activeUsers == null ? <NA why="La actividad de usuarios no se pudo leer." long /> : formatCount(cmd.users.activeUsers),
        foot: noCompare('solo se guarda el último acceso'),
        definition: 'Usuarios con último acceso dentro del período. No es presencia en vivo.',
      },
      { id: 'new', label: 'Usuarios nuevos', provenance: real(cmd.users.newUsers), value: formatCount(cmd.users.newUsers.value), foot: delta(cmd.users.newUsers), definition: 'Cuentas creadas en el período.' },
      { id: 'offers', label: 'Ofertas creadas', provenance: real(cmd.community.offersCreated), value: formatCount(cmd.community.offersCreated.value), foot: delta(cmd.community.offersCreated), definition: 'Ofertas creadas en el período (todas las fuentes).' },
      { id: 'approved', label: 'Aprobadas', provenance: real(cmd.moderation.approved), value: formatCount(ap), foot: delta(cmd.moderation.approved), definition: 'Aprobaciones de moderación en el período.' },
      {
        id: 'approval_rate',
        label: 'Tasa de aprobación',
        provenance: approvalRate == null ? 'UNAVAILABLE' : 'CALCULATED',
        value: approvalRate == null ? <NA why="Sin decisiones en el período: no hay base." long /> : `${approvalRate}%`,
        foot: noCompare(ap != null && rj != null ? `${formatCount(ap)} de ${formatCount(ap + rj)} decisiones` : 'sin decisiones'),
        definition: 'Aprobadas ÷ (aprobadas + rechazadas) del período.',
      },
      { id: 'outbound', label: 'Clics a tienda', provenance: real(cmd.traffic.outbound), value: formatCount(out), foot: delta(cmd.traffic.outbound), definition: 'Clics salientes hacia tiendas (volumen, no clics atribuidos).' },
      {
        id: 'ctr',
        label: 'Vistas → clic',
        provenance: ctr == null ? 'UNAVAILABLE' : 'CALCULATED',
        value: ctr == null ? <NA why="Sin vistas en el período: no hay base." long /> : `${ctr}%`,
        foot: noCompare(`${formatCount(views)} vistas`),
        definition: 'Clics a tienda ÷ vistas de oferta del período.',
      },
      {
        id: 'engagement',
        label: 'Interacciones',
        provenance: engagement.value == null ? 'UNAVAILABLE' : 'CALCULATED',
        value: formatCount(engagement.value),
        foot: delta(engagement),
        definition: 'Votos + comentarios + favoritos del período.',
      },
      { id: 'reports', label: 'Reportes', provenance: real(cmd.community.reports), value: formatCount(cmd.community.reports.value), foot: delta(cmd.community.reports, true), definition: 'Reportes de usuarios en el período (menos es mejor).' },
      {
        id: 'revenue',
        label: 'Ingresos confirmados',
        provenance: econ?.realCents != null ? 'REAL' : 'UNAVAILABLE',
        value: !econ ? (
          <NA why="Los ingresos no tienen ventana de 30 días." long />
        ) : econ.realCents == null ? (
          <NA why="El libro de comisiones no está disponible." long />
        ) : (
          formatMoneyCents(econ.realCents)
        ),
        foot: frozen ? (
          <Chip tone="sky" hint="El flujo de dinero está congelado: cifras informativas, no pagaderas.">
            Congelado
          </Chip>
        ) : (
          noCompare('no pagadero')
        ),
        definition: 'Comisiones confirmadas de producción (sin registros de prueba).',
      },
    ];
  }

  return (
    <Card id="pulse" labelledBy="ceo-pulse" className="scroll-mt-20">
      <CardHeader
        id="ceo-pulse"
        level={2}
        title="Executive Pulse"
        suffix={cmd ? `· ${cmd.range.label}` : undefined}
        icon={Activity}
        action={<span className="text-[10.5px] text-white/45">% solo con período comparable · {cmd?.range.prevLabel ?? '—'}</span>}
      />
      {cmd == null ? (
        command.status === 'error' ? (
          <CardError message="No se pudo cargar el pulso del período. Detalle en Diagnóstico técnico." onRetry={onRetry} />
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5" aria-busy="true" aria-label="Cargando">
            {Array.from({ length: 10 }, (_, i) => (
              <li key={i}>
                <Skel className="h-[86px] w-full rounded-xl" />
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {kpis.map((k) => (
            <li key={k.id} className="flex min-w-0 flex-col rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
              <div className="flex items-start justify-between gap-1.5">
                <p className="text-[11px] font-medium leading-snug text-white/60" title={k.definition}>
                  {k.label}
                </p>
                <ProvenanceBadge kind={k.provenance} />
              </div>
              <p className="mt-1.5 text-[22px] font-semibold leading-tight tracking-tight tabular-nums text-white">{k.value}</p>
              <div className="mt-auto pt-1">{k.foot}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
