'use client';

import { Gauge } from 'lucide-react';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { Bar, CtaLink, Panel, ProvenanceBadge, formatCount } from './ui';
import type { Provenance } from './types';

type Row = { label: string; value: string; detail: string; provenance: Provenance; bar?: { value: number; max: number; tone: 'green' | 'amber' | 'red' | 'violet' } };

/** Umbral operativo de la cola de escritura usado por buildSystemHealth (>100 = degraded). */
const WRITE_QUEUE_DEGRADED = 100;

export default function CapacityPanel({ base, cmd }: { base: OwnerDashboardPayload | null; cmd: OwnerCommandPayload | null }) {
  const rows: Row[] = [];
  const active = cmd?.users.activeUsers ?? null;
  const total = cmd?.users.totalProfiles ?? null;
  rows.push({
    label: 'Usuarios',
    value: active != null && total != null ? `${formatCount(active)} / ${formatCount(total)}` : 'No disponible',
    detail: 'Activos en el período / registrados. No es concurrencia.',
    provenance: active != null && total != null ? 'DERIVED' : 'UNKNOWN',
    bar: active != null && total ? { value: active, max: total, tone: 'violet' } : undefined,
  });
  const q = cmd?.operations.queuePending ?? base?.operations.writeQueuePending ?? null;
  rows.push({
    label: 'Workers · cola de escritura',
    value: q != null ? `${formatCount(q)} / ${WRITE_QUEUE_DEGRADED}` : 'No disponible',
    detail: 'Pendientes vs umbral degraded de system health.',
    provenance: q != null ? 'REAL' : 'UNKNOWN',
    bar: q != null ? { value: q, max: WRITE_QUEUE_DEGRADED, tone: q > WRITE_QUEUE_DEGRADED * 0.7 ? 'red' : q > WRITE_QUEUE_DEGRADED * 0.4 ? 'amber' : 'green' } : undefined,
  });
  const dur = cmd?.hunter.avgDurationMs ?? null;
  rows.push({
    label: 'Processing · Hunter',
    value: dur != null ? `${Math.round(dur / 1000)} s/run` : 'No disponible',
    detail: `Duración media de runs en el período (${formatCount(cmd?.hunter.runs)} runs).`,
    provenance: dur != null ? 'DERIVED' : 'UNKNOWN',
  });
  const m = base?.moderation;
  rows.push({
    label: 'Processing · Moderación',
    value: m?.throughputLastHour != null ? `${m.throughputLastHour}/h` : 'No disponible',
    detail: m?.throughputLastHour != null ? `Backlog ${m.pending}. ETA según throughput de la última hora.` : 'Sin decisiones en la última hora.',
    provenance: m?.throughputLastHour != null ? 'DERIVED' : 'UNKNOWN',
  });
  rows.push({ label: 'Requests / rate limits', value: 'No disponible', detail: 'Rate limit vía Upstash o memoria (lib/server/rateLimit) sin contador expuesto. Requiere métricas de Upstash/Vercel.', provenance: 'UNKNOWN' });
  rows.push({ label: 'Storage', value: 'No disponible', detail: 'Sin lectura de uso de Supabase Storage/DB. Requiere Management API o consulta de tamaños.', provenance: 'UNKNOWN' });

  return (
    <Panel id="capacidad" title="Capacidad" icon={Gauge} subtitle="¿Cuánto margen tiene Aventa? Solo métricas reales; el resto queda marcado." action={<CtaLink href="/admin/infraestructura">Infraestructura</CtaLink>}>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="rounded-xl bg-white/[0.02] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-xs font-medium text-white/75">{r.label}</p>
              <div className="flex shrink-0 items-center gap-2">
                <span className={r.provenance === 'UNKNOWN' ? 'text-xs text-white/40' : 'text-xs font-semibold tabular-nums text-white'}>{r.value}</span>
                <ProvenanceBadge kind={r.provenance} />
              </div>
            </div>
            {r.bar ? (
              <div className="mt-1.5">
                <Bar value={r.bar.value} max={r.bar.max} tone={r.bar.tone} />
              </div>
            ) : null}
            <p className="mt-1 text-[10px] leading-snug text-white/35">{r.detail}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
