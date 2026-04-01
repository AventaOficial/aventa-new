'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, BarChart3, Clock3, Flag, Shield, Wrench } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  canAccessHealth,
  canAccessMetrics,
  canAccessModeration,
  canAccessOwnerOperationsPanel,
  type Role,
} from '@/lib/admin/roles';

type DashboardStats = {
  pendingOffers: number;
  pendingReports: number;
  healthStatus: 'ok' | 'degraded' | 'error';
  productMetrics?: {
    new_users_today: number;
    active_users_24h: number;
    retention_48h_pct: number | null;
    growth_weekly_pct?: number | null;
  } | null;
};

function StatCard({
  href,
  label,
  value,
  icon: Icon,
  tone = 'violet',
}: {
  href?: string;
  label: string;
  value: string | number;
  icon: typeof Clock3;
  tone?: 'violet' | 'amber' | 'emerald' | 'red';
}) {
  const tones = {
    violet: 'text-violet-600 dark:text-violet-400',
    amber: 'text-amber-500 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-500 dark:text-red-400',
  } as const;

  const content = (
    <div className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">{value}</p>
        </div>
        <Icon className={`h-8 w-8 ${tones[tone]}`} />
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<Role | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setLoading(false);
        return;
      }

      try {
        const roleRes = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .in('role', ['owner', 'admin', 'moderator', 'analyst']);
        const roles = ((roleRes.data ?? []) as { role: Role }[]).map((item) => item.role);
        const priority: Role[] = ['owner', 'admin', 'moderator', 'analyst'];
        setUserRole(priority.find((role) => roles.includes(role)) ?? null);

        const headers = { Authorization: `Bearer ${session.access_token}` };
        const [pendingOffersRes, pendingReportsRes, healthRes, metricsRes] = await Promise.all([
          fetch('/api/admin/moderation-pending-offers', { headers }),
          fetch('/api/admin/reports?status=pending', { headers }),
          fetch('/api/health'),
          fetch('/api/admin/product-metrics', { headers }),
        ]);

        const pendingOffersJson = await pendingOffersRes.json().catch(() => ({}));
        const pendingReportsJson = await pendingReportsRes.json().catch(() => []);
        const healthJson = await healthRes.json().catch(() => ({ status: 'error' }));
        const metricsJson = metricsRes.ok ? await metricsRes.json().catch(() => null) : null;

        setStats({
          pendingOffers: Array.isArray(pendingOffersJson?.offers) ? pendingOffersJson.offers.length : 0,
          pendingReports: Array.isArray(pendingReportsJson) ? pendingReportsJson.length : 0,
          healthStatus:
            healthJson?.status === 'ok'
              ? 'ok'
              : healthJson?.status === 'degraded'
                ? 'degraded'
                : 'error',
          productMetrics: metricsJson,
        });
      } catch {
        setStats({
          pendingOffers: 0,
          pendingReports: 0,
          healthStatus: 'error',
          productMetrics: null,
        });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const canMod = canAccessModeration(userRole);
  const canMet = canAccessMetrics(userRole);
  const canHea = canAccessHealth(userRole);
  const canOwnerOps = canAccessOwnerOperationsPanel(userRole);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
          Panel de control
        </p>
        <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">
          Admin AVENTA
        </h1>
        <p className="mt-3 max-w-2xl text-sm md:text-base text-gray-500 dark:text-gray-400 leading-relaxed">
          Vista rápida de lo que urge hoy: cola de moderación, reportes, salud del sistema y accesos
          directos a las herramientas más importantes.
        </p>
      </section>

      {loading ? (
        <div className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-6 text-sm text-gray-500 dark:text-gray-400">
          Cargando panel...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {canMod ? (
              <StatCard
                href="/admin/moderation"
                label="Pendientes de moderación"
                value={stats?.pendingOffers ?? 0}
                icon={Clock3}
                tone="amber"
              />
            ) : null}
            {canMod ? (
              <StatCard
                href="/admin/reports?status=pending"
                label="Reportes pendientes"
                value={stats?.pendingReports ?? 0}
                icon={Flag}
                tone="red"
              />
            ) : null}
            {canHea ? (
              <StatCard
                href="/admin/health"
                label="Salud del sistema"
                value={
                  stats?.healthStatus === 'ok'
                    ? 'OK'
                    : stats?.healthStatus === 'degraded'
                      ? 'Degradado'
                      : 'Error'
                }
                icon={Activity}
                tone={stats?.healthStatus === 'ok' ? 'emerald' : 'amber'}
              />
            ) : null}
            {canOwnerOps ? (
              <StatCard href="/admin/technical" label="Vista técnica" value="Abrir" icon={Wrench} tone="violet" />
            ) : null}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
            <section className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
              <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">
                Resumen de comunidad
              </h2>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl bg-[#F5F5F7] dark:bg-[#111113] p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Usuarios nuevos hoy</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">
                    {stats?.productMetrics?.new_users_today ?? '—'}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#F5F5F7] dark:bg-[#111113] p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Activos últimas 24h</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">
                    {stats?.productMetrics?.active_users_24h ?? '—'}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#F5F5F7] dark:bg-[#111113] p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Retención 48h</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">
                    {stats?.productMetrics?.retention_48h_pct != null
                      ? `${stats.productMetrics.retention_48h_pct}%`
                      : '—'}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl bg-white dark:bg-[#1C1C1E] border border-gray-200/70 dark:border-gray-800 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-violet-500" />
                <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100">
                  Acciones rápidas
                </h2>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {canMod ? (
                  <Link
                    href="/admin/moderation"
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 bg-violet-600 text-white text-sm font-semibold transition-transform active:scale-95 hover:bg-violet-700"
                  >
                    <Clock3 className="h-4 w-4" />
                    Revisar cola
                  </Link>
                ) : null}
                {canMet ? (
                  <Link
                    href="/admin/metrics"
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 bg-gray-100 dark:bg-[#111113] text-gray-800 dark:text-gray-200 text-sm font-semibold transition-transform active:scale-95 hover:bg-gray-200 dark:hover:bg-[#202024]"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Ver métricas
                  </Link>
                ) : null}
                {canOwnerOps ? (
                  <Link
                    href="/admin/operaciones/trabajo"
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 bg-gray-100 dark:bg-[#111113] text-gray-800 dark:text-gray-200 text-sm font-semibold transition-transform active:scale-95 hover:bg-gray-200 dark:hover:bg-[#202024]"
                  >
                    <Wrench className="h-4 w-4" />
                    Trabajo
                  </Link>
                ) : null}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
