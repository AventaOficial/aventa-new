'use client';

import Link from 'next/link';
import { RefreshCw, Users } from 'lucide-react';
import LoadingState from '@/app/components/panel/LoadingState';
import EmptyState from '@/app/components/panel/EmptyState';
import StatusBadge from '@/app/components/panel/StatusBadge';
import { pctToneClass } from '@/lib/gerencia/hubConfig';
import { useGerenciaPayload } from './useGerenciaPayload';

function deptHref(department: string): string {
  if (department === 'home') return '/equipo';
  return `/equipo/${department}`;
}

export default function GerenciaTeamPanel() {
  const { data, loading, error, reload } = useGerenciaPayload();

  if (loading) return <LoadingState message="Cargando equipo…" variant="light" />;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
          <Users className="h-4 w-4" />
          {data.staff.length} miembro(s) con rol staff
        </p>
        <div className="flex gap-2">
          {data.canAssignRoles ? (
            <Link
              href="/admin/team"
              className="inline-flex items-center rounded-xl bg-violet-600 text-white px-3 py-2 text-xs font-medium"
            >
              Gestionar roles
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-medium"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </button>
        </div>
      </div>

      {data.staff.length === 0 ? (
        <EmptyState
          title="Sin personal staff"
          description="Asigna roles en Admin → Equipo y roles para ver miembros aquí."
          variant="light"
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.06] dark:border-white/[0.08]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.03] text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Nombre</th>
                <th className="px-3 py-2.5 font-medium">Rol</th>
                <th className="px-3 py-2.5 font-medium">Área</th>
                <th className="px-3 py-2.5 font-medium">Checklist</th>
                <th className="px-3 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.staff.map((s) => (
                <tr key={s.userId} className="bg-white/80 dark:bg-transparent">
                  <td className="px-3 py-2.5 font-medium">{s.displayName ?? s.userId.slice(0, 8)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone="info">{s.roleLabel}</StatusBadge>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 capitalize">{s.department}</td>
                  <td className="px-3 py-2.5">
                    <span className={`tabular-nums font-medium ${pctToneClass(s.taskPct)}`}>
                      {s.taskDone}/{s.taskTotal} ({s.taskPct}%)
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link href={deptHref(s.department)} className="text-xs text-violet-600 hover:underline">
                      Ver área
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
