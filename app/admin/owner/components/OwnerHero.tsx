'use client';

import StatusBadge from '@/app/components/panel/StatusBadge';
import { greetingForHour } from '@/app/components/panel/utils';
import type { OwnerDashboardPayload, TrafficLight } from '@/lib/owner/buildOwnerDashboard';

function statusTone(status: TrafficLight): 'ok' | 'attention' | 'critical' {
  if (status === 'green') return 'ok';
  if (status === 'yellow') return 'attention';
  return 'critical';
}

export default function OwnerHero({
  data,
  displayName,
}: {
  data: OwnerDashboardPayload;
  displayName?: string | null;
}) {
  const hour = new Date().getHours();
  const greeting = greetingForHour(hour);
  const firstName = displayName?.split(' ')[0] ?? 'Fundador';
  const criticalCount = data.alerts.filter((a) => a.severity === 'red').length;
  const attentionCount = data.alerts.filter((a) => a.severity === 'yellow').length;
  const totalAttention = criticalCount + attentionCount;

  const globalStatus =
    data.summary.status === 'green'
      ? 'AVENTA OPERANDO NORMALMENTE'
      : totalAttention > 0
        ? `${totalAttention} COSA${totalAttention > 1 ? 'S' : ''} REQUIEREN TU ATENCIÓN`
        : data.summary.headline.toUpperCase();

  return (
    <section className="mb-8">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
        {greeting}, {firstName} 👋
      </h1>
      <p className="mt-2 text-sm text-white/45">Esto es lo que está pasando en AVENTA.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <StatusBadge tone={statusTone(data.summary.status)} pulse={data.summary.status === 'red'}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {globalStatus}
        </StatusBadge>
      </div>

      {data.summary.status === 'green' && data.alerts.length === 0 ? (
        <p className="mt-3 text-sm text-white/40">No tienes incidentes críticos.</p>
      ) : data.summary.subline ? (
        <p className="mt-3 text-sm text-white/50 max-w-2xl">{data.summary.subline}</p>
      ) : null}
    </section>
  );
}
