'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import GlassCard from '@/app/components/panel/GlassCard';
import LoadingState from '@/app/components/panel/LoadingState';
import SectionHeader from '@/app/components/panel/SectionHeader';
import type { GerenciaPayload } from '@/lib/staff/buildStaffHome';
import { cn } from '@/app/components/panel/utils';

const DEPT_LABELS: Record<string, string> = {
  moderacion: 'Moderación',
  marketing: 'Marketing',
  contabilidad: 'Finance',
  operaciones: 'Operations',
};

function pctTone(pct: number): string {
  if (pct >= 85) return 'text-emerald-400';
  if (pct >= 65) return 'text-amber-400';
  return 'text-red-400';
}

function pctEmoji(pct: number): string {
  if (pct >= 85) return '🟢';
  if (pct >= 65) return '🟡';
  return '🔴';
}

export default function TeamHealthSection() {
  const [data, setData] = useState<GerenciaPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    const res = await fetch('/api/staff/gerencia', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      setData((await res.json()) as GerenciaPayload);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <GlassCard variant="dark" padding="lg" className="h-full">
      <SectionHeader
        title="Team Health"
        subtitle="Supervisión por departamento · sin micro-gestión"
        variant="dark"
        action={
          <Link href="/equipo/gerencia" className="text-xs text-violet-400 hover:text-violet-300">
            Ver equipo →
          </Link>
        }
      />

      {loading ? (
        <LoadingState message="Cargando equipo…" className="py-8" />
      ) : !data ? (
        <p className="mt-4 text-xs text-white/40">No se pudo cargar el estado del equipo.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {data.departmentProgress.map((d) => (
            <div key={d.department} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5">
              <div>
                <p className="text-sm text-white/70">{DEPT_LABELS[d.department] ?? d.label}</p>
                {d.pendingTasks > 0 ? (
                  <p className="text-[10px] text-white/35">{d.pendingTasks} tareas pendientes</p>
                ) : null}
              </div>
              <span className={cn('text-sm font-semibold tabular-nums', pctTone(d.taskPct))}>
                {pctEmoji(d.taskPct)} {d.taskPct}%
              </span>
            </div>
          ))}

          <div className="pt-2 border-t border-white/[0.06] grid grid-cols-2 gap-2 text-xs text-white/40">
            <span>Cola mod: {data.sla.pendingTotal}</span>
            <span>Aprob. hoy: {data.sla.approvedToday}</span>
            <span>Staff: {data.staff.length}</span>
            <span>Alertas: {data.alerts.length}</span>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
