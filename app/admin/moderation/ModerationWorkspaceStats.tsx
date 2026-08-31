'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { cn } from '@/app/components/panel/utils';

type Pulse = {
  pendingTotal: number;
  pendingBot: number;
  pendingHuman: number;
  pendingReports: number;
  priceChanged: number;
  outOfStock: number;
};

type OpsStats = {
  backlog: number;
  oldestPendingAgeSeconds: number | null;
  throughputLastHour: number;
  approvalRateLastHour: number | null;
  medianDecisionSecondsLastHour: number | null;
  levelDistribution: { sprint: number; review: number; enforcement: number };
  claimLatency: { lastMs: number | null; p95Ms: number | null; sampleCount: number };
};

function formatAge(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export default function ModerationWorkspaceStats() {
  const { session } = useAuth();
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [ops, setOps] = useState<OpsStats | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;
    const headers = { Authorization: `Bearer ${session.access_token}` };

    fetch('/api/staff/home?department=moderacion', { headers })
      .then((r) => r.json())
      .then((body) => {
        const p = body?.pulse as Pulse | undefined;
        if (p) setPulse(p);
      })
      .catch(() => {});

    fetch('/api/admin/moderation-ops-stats', { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.stats) setOps(body.stats as OpsStats);
      })
      .catch(() => {});
  }, [session?.access_token]);

  if (!pulse && !ops) return null;

  const items = [
    ops
      ? { label: 'Backlog', value: String(ops.backlog), tone: ops.backlog > 15 ? 'attention' : 'ok' }
      : { label: 'Pendientes', value: String(pulse?.pendingTotal ?? '—'), tone: 'ok' },
    ops
      ? {
          label: 'Más antigua',
          value: formatAge(ops.oldestPendingAgeSeconds),
          tone: (ops.oldestPendingAgeSeconds ?? 0) > 3600 ? 'attention' : 'ok',
        }
      : null,
    ops
      ? { label: '/hora', value: String(ops.throughputLastHour), tone: 'info' }
      : null,
    ops?.medianDecisionSecondsLastHour != null
      ? {
          label: 'Mediana',
          value: `${ops.medianDecisionSecondsLastHour}s`,
          tone: 'info',
        }
      : null,
    ops?.approvalRateLastHour != null
      ? { label: 'Aprobación', value: `${ops.approvalRateLastHour}%`, tone: 'info' }
      : null,
    ops?.claimLatency.p95Ms != null
      ? { label: 'Claim P95', value: `${ops.claimLatency.p95Ms}ms`, tone: 'info' }
      : null,
    pulse
      ? { label: 'Reportes', value: String(pulse.pendingReports), tone: pulse.pendingReports > 0 ? 'attention' : 'ok' }
      : null,
  ].filter(Boolean) as { label: string; value: string; tone: string }[];

  const toneClass = {
    ok: 'text-emerald-600 dark:text-emerald-400',
    attention: 'text-amber-600 dark:text-amber-400',
    critical: 'text-red-600 dark:text-red-400',
    info: 'text-gray-700 dark:text-gray-300',
  };

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.03] px-3 py-1.5"
        >
          <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {item.label}
          </span>
          <span
            className={cn(
              'ml-2 text-sm font-semibold tabular-nums',
              toneClass[item.tone as keyof typeof toneClass]
            )}
          >
            {item.value}
          </span>
        </div>
      ))}
      {ops ? (
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.03] px-3 py-1.5 text-[10px] text-gray-500 dark:text-gray-400">
          A/B/C: {ops.levelDistribution.sprint}/{ops.levelDistribution.review}/
          {ops.levelDistribution.enforcement}
        </div>
      ) : null}
    </div>
  );
}
