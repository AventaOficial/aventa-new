'use client';

import { Flag, Heart, MessageCircle, Tag, ThumbsUp, User } from 'lucide-react';
import VistaShell from '../shell';
import { DateChip, Donut, Ghost, KpiCard, LineChart, Panel, PeriodBar } from '../ui';
import { deltaOf, num, seriesValues, useVista } from '../live';

export default function ComunidadVistaPage() {
  const { range, changeRange, cmd } = useVista();
  const votes = cmd?.community.votes.value ?? null;
  const comments = cmd?.community.comments.value ?? null;
  const favorites = cmd?.community.favorites.value ?? null;
  const mix = (votes ?? 0) + (comments ?? 0) + (favorites ?? 0);
  const pct = (part: number | null) => (part != null && mix > 0 ? Math.round((part / mix) * 100) : 0);
  const series = seriesValues((cmd?.series.points ?? []).map((p) => ({ label: p.label, value: p.offers })));
  return (
    <VistaShell
      title="Actividad de la comunidad"
      crumb="Actividad de la comunidad"
      subtitle="Publicaciones, votos, comentarios y favoritos del período."
      toolbar={<><DateChip /><PeriodBar value={range} onChange={changeRange} /><Ghost href="/admin/moderation/reports">Abrir reportes</Ghost></>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={Tag} tint="bg-violet-500/20 text-violet-200" label="Ofertas creadas" value={num(cmd?.community.offersCreated.value)} delta={deltaOf(cmd?.community.offersCreated)?.text} up={deltaOf(cmd?.community.offersCreated)?.up} />
        <KpiCard icon={ThumbsUp} tint="bg-sky-500/15 text-sky-200" label="Votos" value={num(votes)} delta={deltaOf(cmd?.community.votes)?.text} up={deltaOf(cmd?.community.votes)?.up} />
        <KpiCard icon={MessageCircle} tint="bg-cyan-500/15 text-cyan-200" label="Comentarios" value={num(comments)} delta={deltaOf(cmd?.community.comments)?.text} up={deltaOf(cmd?.community.comments)?.up} />
        <KpiCard icon={Heart} tint="bg-rose-500/15 text-rose-200" label="Favoritos" value={num(favorites)} delta={deltaOf(cmd?.community.favorites)?.text} up={deltaOf(cmd?.community.favorites)?.up} />
        <KpiCard icon={Flag} tint="bg-amber-500/15 text-amber-200" label="Reportes" value={num(cmd?.community.reports.value)} delta={deltaOf(cmd?.community.reports)?.text} up={deltaOf(cmd?.community.reports)?.up} />
        <KpiCard icon={User} tint="bg-emerald-500/15 text-emerald-200" label="Cazadores activos" value={num(cmd?.community.activeHunters.value)} />
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Ofertas creadas en el período">
          {series.values.length > 1 ? <LineChart series={[{ values: series.values, color: '#a78bfa' }]} labels={series.labels} /> : <p className="text-[12px] text-white/45">Sin serie.</p>}
        </Panel>
        <Panel className="xl:col-span-5" title="Mix de interacciones">
          <div className="flex items-center gap-3">
            <Donut parts={[{ pct: pct(votes), color: '#a78bfa' }, { pct: pct(comments), color: '#22d3ee' }, { pct: pct(favorites), color: '#fb7185' }]}>
              <span className="text-[16px] font-semibold text-white">{num(mix || null)}</span>
            </Donut>
            <ul className="space-y-1 text-[12px] text-white/70">
              <li>Votos · {num(votes)}</li>
              <li>Comentarios · {num(comments)}</li>
              <li>Favoritos · {num(favorites)}</li>
            </ul>
          </div>
        </Panel>
      </div>
    </VistaShell>
  );
}
