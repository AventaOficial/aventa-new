'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, Users } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import type { GerenciaPayload } from '@/lib/staff/buildStaffHome';
import { ROLE_LABELS } from '@/lib/admin/roles';

const TONE_CLASS = {
  ok: 'border-emerald-200/80 bg-emerald-50/70 dark:bg-emerald-950/20',
  attention: 'border-amber-200/80 bg-amber-50/80',
  blocked: 'border-red-200/80 bg-red-50/80',
} as const;

export default function GerenciaView() {
  const { session } = useAuth();
  const [data, setData] = useState<GerenciaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/staff/gerencia', { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Sin acceso');
        return;
      }
      setData(body as GerenciaPayload);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (session?.access_token) load();
    else setLoading(false);
  }, [session?.access_token, load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando gerencia…
      </div>
    );
  }

  if (error) {
    return <p className="text-red-600 text-sm">{error}</p>;
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">Gerencia</p>
        <h1 className="text-2xl font-semibold mt-1">Supervisión del equipo</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          Revisa SLA, alertas y progreso por área. Asignación de roles:{' '}
          <Link href="/admin/team" className="text-emerald-600 hover:underline">
            Admin → Equipo y roles
          </Link>
          .
        </p>
      </header>

      {data.alerts.length > 0 ? (
        <section className="space-y-2">
          {data.alerts.map((a) => (
            <div
              key={a}
              className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              {a}
            </div>
          ))}
        </section>
      ) : (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Sin alertas críticas ahora mismo.</p>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border p-4 bg-white dark:bg-[#141414]">
          <p className="text-xs text-gray-500">Pendientes mod</p>
          <p className="text-3xl font-semibold">{data.sla.pendingTotal}</p>
          <p className="text-xs text-gray-500 mt-1">Alerta si &gt; {data.sla.pendingWarnThreshold}</p>
        </div>
        <div className="rounded-2xl border p-4 bg-white dark:bg-[#141414]">
          <p className="text-xs text-gray-500">Aprobadas hoy</p>
          <p className="text-3xl font-semibold">{data.sla.approvedToday}</p>
          <p className="text-xs text-gray-500 mt-1">Meta {data.sla.liveTarget}</p>
        </div>
        <div className="rounded-2xl border p-4 bg-white dark:bg-[#141414]">
          <p className="text-xs text-gray-500">Ofertas vivas</p>
          <p className="text-3xl font-semibold">{data.pulse.liveActive}</p>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-3">Progreso por área</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.departmentProgress.map((d) => (
            <div key={d.department} className="rounded-2xl border p-4 bg-white dark:bg-[#141414]">
              <div className="flex justify-between gap-2">
                <p className="font-medium">{d.label}</p>
                <p className="text-sm tabular-nums">{d.taskPct}%</p>
              </div>
              <div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${d.taskPct}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-2">{d.pendingTasks} tarea(s) pendiente(s)</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.queue.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`rounded-2xl border p-4 ${TONE_CLASS[item.tone]}`}
          >
            <p className="text-sm font-medium">{item.label}</p>
            <p className="text-2xl font-semibold mt-1">{item.count}</p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Personal con rol staff
        </h2>
        {data.staff.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay otros miembros. Asígnalos en Admin → Equipo y roles.</p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-white dark:bg-[#141414]">
            {data.staff.map((s) => (
              <li key={s.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{s.displayName ?? s.userId.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500">{ROLE_LABELS[s.role]} · área {s.department}</p>
                </div>
                <Link href={`/equipo/${s.department === 'home' ? '' : s.department}`} className="text-emerald-600 text-xs hover:underline">
                  Ver área
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
