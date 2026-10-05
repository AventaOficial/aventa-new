'use client';

import { CheckCircle2, Clock, Hourglass, Tag, XCircle } from 'lucide-react';
import VistaShell from '../shell';
import { DateChip, Donut, Ghost, KpiCard, LineChart, Panel, PeriodBar } from '../ui';
import { deltaOf, num, seriesValues, useVista } from '../live';

export default function OfertasVistaPage() {
  const { range, changeRange, base, cmd } = useVista();
  const approved = deltaOf(cmd?.moderation.approved);
  const pending = base?.moderation.pending ?? cmd?.catalog.pending ?? null;
  const live = cmd?.catalog.live ?? base?.liveDeals ?? null;
  const rejected = cmd?.catalog.rejected;
  const total = [live, pending, rejected].every((n) => n != null) ? (live ?? 0) + (pending ?? 0) + (rejected ?? 0) : null;
  const share = (part: number | null | undefined) => (part != null && total ? Math.round((part / total) * 100) : 0);
  const series = seriesValues((cmd?.series.points ?? []).map((p) => ({ label: p.label, value: p.offers })));
  const top = base?.week.topOffers ?? [];
  return (
    <VistaShell
      title="Ofertas publicadas"
      crumb="Ofertas publicadas"
      subtitle="Conteos reales del catálogo y de la moderación. Aprobar o rechazar sigue en la cola."
      toolbar={<><DateChip /><PeriodBar value={range} onChange={changeRange} /><Ghost href="/admin/moderation">Abrir moderación</Ghost></>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={Tag} tint="bg-violet-500/20 text-violet-200" label="En vivo" value={num(live)} />
        <KpiCard icon={CheckCircle2} tint="bg-emerald-500/15 text-emerald-200" label="Aprobadas" value={num(cmd?.moderation.approved.value)} delta={approved?.text} up={approved?.up} />
        <KpiCard icon={Hourglass} tint="bg-amber-500/15 text-amber-200" label="Pendientes" value={num(pending)} sub={base?.moderation.oldestPendingHours != null ? `La más vieja: ${Math.round(base.moderation.oldestPendingHours)} h` : undefined} />
        <KpiCard icon={XCircle} tint="bg-rose-500/15 text-rose-200" label="Rechazadas" value={num(cmd?.moderation.rejected.value)} delta={deltaOf(cmd?.moderation.rejected)?.text} up={deltaOf(cmd?.moderation.rejected)?.up} />
        <KpiCard icon={Clock} tint="bg-sky-500/15 text-sky-200" label="Vencidas" value={num(cmd?.catalog.expired)} />
        <KpiCard icon={Tag} tint="bg-indigo-500/15 text-indigo-200" label="Creadas" value={num(cmd?.community.offersCreated.value)} />
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Estado del catálogo">
          <div className="flex items-center gap-4">
            <Donut parts={[{ pct: share(live), color: '#34d399' }, { pct: share(pending), color: '#fbbf24' }, { pct: share(rejected), color: '#fb7185' }]}>
              <span className="text-[16px] font-semibold text-white">{num(total)}</span>
            </Donut>
            <ul className="space-y-1 text-[12px] text-white/70">
              <li>En vivo · {num(live)}</li>
              <li>Pendientes · {num(pending)}</li>
              <li>Rechazadas · {num(rejected)}</li>
            </ul>
          </div>
        </Panel>
        <Panel className="xl:col-span-4" title="Ofertas creadas">
          {series.values.length > 1 ? <LineChart series={[{ values: series.values, color: '#a78bfa' }]} labels={series.labels} /> : <p className="text-[12px] text-white/45">Sin serie en este período.</p>}
        </Panel>
        <Panel className="xl:col-span-4" title="Más clicadas esta semana" extra={<Ghost href="/admin/moderation/approved">Ver publicadas</Ghost>}>
          {top.length === 0 ? <p className="text-[12px] text-white/45">Sin ofertas con clics.</p> : (
            <ul className="space-y-2">
              {top.slice(0, 6).map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate text-white/80">{row.title}</span>
                  <span className="shrink-0 tabular-nums text-white/50">{num(row.outbound)} clics</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </VistaShell>
  );
}
