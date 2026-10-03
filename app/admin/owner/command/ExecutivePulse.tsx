'use client';

import { Activity } from 'lucide-react';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload, RangeMetric } from '@/lib/owner/buildOwnerCommand';
import type { OwnerRangeKey } from '@/lib/owner/ownerRange';
import { formatMoneyCents } from '@/app/components/panel/utils';
import { Delta, Metric, Panel, SourceGate, Unavailable, formatCount } from './ui';
import type { SourceState } from './types';

function economyFor(base: OwnerDashboardPayload | null, range: OwnerRangeKey) {
  if (!base) return null;
  if (range === 'today') return base.economy.day;
  if (range === '7d') return base.economy.week;
  if (range === 'month') return base.economy.month;
  return null;
}

export default function ExecutivePulse({
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
  return (
    <Panel
      id="pulse"
      title="Executive Pulse"
      icon={Activity}
      subtitle="¿Cómo está Aventa? Comparación contra el período anterior equivalente cuando es calculable."
    >
      <SourceGate source={command} onRetry={onRetry} rows={2} label="pulso del período">
        {(cmd) => {
          const prevLabel = cmd.range.prevLabel;
          const rm = (m: RangeMetric, invert = false) => <Delta current={m.value} previous={m.previous} invert={invert} label={prevLabel} />;
          const views = cmd.traffic.views.value;
          const out = cmd.traffic.outbound.value;
          const ctr = views != null && out != null && views > 0 ? Math.round((out / views) * 1000) / 10 : null;
          const econ = economyFor(base, range);
          const frozen = base?.systemHealth.moneyPathFrozen ?? null;
          return (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              <Metric
                label="Usuarios activos"
                provenance="REAL"
                hint="user_activity.last_seen_at dentro del período. No es presencia en tiempo real; sin comparación porque solo se guarda el último acceso."
                value={cmd.users.activeUsers == null ? <Unavailable what="user_activity no disponible" /> : formatCount(cmd.users.activeUsers)}
                footer={<span className="text-[10px] text-white/30">último acceso en período</span>}
              />
              <Metric label="Usuarios nuevos" provenance="REAL" hint="profiles.created_at" value={formatCount(cmd.users.newUsers.value)} footer={rm(cmd.users.newUsers)} />
              <Metric label="Ofertas creadas" provenance="REAL" hint="offers.created_at (todas las fuentes)" value={formatCount(cmd.community.offersCreated.value)} footer={rm(cmd.community.offersCreated)} />
              <Metric label="Aprobadas" provenance="REAL" hint="moderation_logs action=approved" value={formatCount(cmd.moderation.approved.value)} footer={rm(cmd.moderation.approved)} />
              <Metric label="Votos" provenance="REAL" hint="offer_votes.created_at" value={formatCount(cmd.community.votes.value)} footer={rm(cmd.community.votes)} />
              <Metric label="Comentarios" provenance="REAL" hint="comments.created_at" value={formatCount(cmd.community.comments.value)} footer={rm(cmd.community.comments)} />
              <Metric label="Favoritos" provenance="REAL" hint="offer_favorites.created_at" value={formatCount(cmd.community.favorites.value)} footer={rm(cmd.community.favorites)} />
              <Metric label="Clics a tienda" provenance="REAL" hint="offer_events event_type=outbound (volumen, no clics atribuidos)" value={formatCount(out)} footer={rm(cmd.traffic.outbound)} />
              <Metric
                label="CTR vistas → clic"
                provenance="DERIVED"
                hint="outbound / view de offer_events en el período"
                value={ctr == null ? <Unavailable what="Sin vistas en el período" /> : `${ctr}%`}
                footer={<span className="text-[10px] text-white/30">{formatCount(views)} vistas</span>}
              />
              <Metric
                label="Ingresos confirmados"
                provenance={econ ? 'REAL' : 'UNKNOWN'}
                hint={
                  econ
                    ? 'Ledger de afiliados productivo (QA excluido). Con money path congelado es informativo.'
                    : 'La economía solo tiene ventanas Hoy, 7 días y Este mes (estimatedEconomy). 30 días requeriría ampliar buildEstimatedEconomy.'
                }
                value={econ ? formatMoneyCents(econ.realCents) : <Unavailable what="No soportado para 30 días" />}
                footer={
                  <span className="text-[10px] text-sky-300/70">{frozen ? 'Money path frozen' : frozen === false ? 'Money path abierto' : '—'}</span>
                }
              />
              <Metric
                label="Pendientes"
                provenance="REAL"
                hint="offers.status = pending (snapshot actual, no depende del período)"
                value={formatCount(cmd.catalog.pending)}
                tone={(cmd.catalog.pending ?? 0) >= 10 ? 'warn' : undefined}
                footer={<span className="text-[10px] text-white/30">ahora</span>}
              />
              <Metric label="Reportes" provenance="REAL" hint="offer_reports.created_at" value={formatCount(cmd.community.reports.value)} footer={rm(cmd.community.reports, true)} />
              <Metric
                label="Cazadores activos"
                provenance="DERIVED"
                hint="Autores distintos (offers.created_by) con ofertas creadas en el período, excluyendo usuarios bot de ingesta."
                value={cmd.community.activeHunters.value == null ? <Unavailable what="Demasiadas filas o error" /> : formatCount(cmd.community.activeHunters.value)}
                footer={rm(cmd.community.activeHunters)}
              />
            </div>
          );
        }}
      </SourceGate>
    </Panel>
  );
}
