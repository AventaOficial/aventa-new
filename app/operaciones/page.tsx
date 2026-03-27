'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ClientLayout from '@/app/ClientLayout';
import {
  ClipboardCheck,
  Gauge,
  Users,
  Sparkles,
  LayoutDashboard,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

type IntegrityCheck = { name: string; ok: boolean; detail: string };
type IntegrityResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  checks: IntegrityCheck[];
  summary: { total: number; failed: number; passed: number };
};

function OperacionesPageInner() {
  const router = useRouter();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(true);
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const [integrityError, setIntegrityError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const fetchIntegrity = async (runNow = false) => {
      setIntegrityError(null);
      if (runNow) setIntegrityRunning(true);
      else setIntegrityLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          setIntegrityError('Sin sesión para consultar integridad');
          return;
        }
        const res = await fetch(`/api/admin/system-integrity${runNow ? '?run=1' : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setIntegrityError(body?.error ?? 'No se pudo obtener estado de integridad');
          return;
        }
        setIntegrity((body?.result ?? null) as IntegrityResult | null);
      } catch {
        setIntegrityError('Error de red al consultar integridad');
      } finally {
        setIntegrityLoading(false);
        setIntegrityRunning(false);
      }
    };

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/');
        return;
      }
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .maybeSingle()
        .then(({ data }) => {
          setIsOwner(!!data);
          if (!data) {
            router.replace('/');
            return;
          }
          fetchIntegrity(false).catch(() => {});
        });
    });
  }, [router]);

  if (isOwner === null) {
    return (
      <ClientLayout>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
        </div>
      </ClientLayout>
    );
  }

  if (!isOwner) return null;

  return (
    <ClientLayout>
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a]">
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-10 pb-28 md:pb-10">
          <header className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
                <ClipboardCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Centro de operaciones
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Tu espacio privado como dueño: lanzamiento, pulso del producto y próximos controles.
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mt-4 pl-0 md:pl-14">
              El mapa por áreas del admin sigue en{' '}
              <Link href="/contexto" className="font-medium text-violet-600 dark:text-violet-400 hover:underline">
                Contexto
              </Link>
              . Aquí concentras lo que revisas tú cada día.
            </p>
          </header>

          <div className="space-y-6">
            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Lanzamiento y checklist</h2>
              </div>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-disc list-inside mb-4">
                <li>Cola de moderación sin ofertas críticas pendientes demasiado tiempo.</li>
                <li>Métricas y health sin errores rojos antes de campañas.</li>
                <li>Avisos del sitio actualizados si hay promo o cambio de reglas.</li>
              </ul>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Lista detallada en el repo: <code className="text-gray-600 dark:text-gray-400">docs/LAUNCH_CHECKLIST_BETA.md</code>{' '}
                y <code className="text-gray-600 dark:text-gray-400">docs/AUDITORIA_PRE_LANZAMIENTO.md</code>.
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                    <Gauge className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100">Estado automático del sistema</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Chequeo diario por cron + ejecución manual cuando quieras.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createClient();
                    setIntegrityError(null);
                    setIntegrityRunning(true);
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      const token = session?.access_token;
                      if (!token) {
                        setIntegrityError('Sin sesión para ejecutar chequeo');
                        return;
                      }
                      const res = await fetch('/api/admin/system-integrity?run=1', {
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      const body = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        setIntegrityError(body?.error ?? 'No se pudo ejecutar chequeo');
                        return;
                      }
                      setIntegrity((body?.result ?? null) as IntegrityResult | null);
                    } catch {
                      setIntegrityError('Error de red al ejecutar chequeo');
                    } finally {
                      setIntegrityRunning(false);
                      setIntegrityLoading(false);
                    }
                  }}
                  disabled={integrityRunning}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-violet-50/60 dark:hover:bg-violet-900/20 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${integrityRunning ? 'animate-spin' : ''}`} />
                  {integrityRunning ? 'Ejecutando…' : 'Ejecutar ahora'}
                </button>
              </div>

              {integrityLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Cargando estado…</p>
              ) : integrityError ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">{integrityError}</p>
              ) : integrity ? (
                <div className="space-y-3">
                  <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${integrity.ok ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                    {integrity.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {integrity.ok ? 'Integridad OK' : `Integridad con fallos (${integrity.summary.failed})`}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Última ejecución: {new Date(integrity.finishedAt).toLocaleString('es-MX')}
                  </p>
                  <div className="grid gap-2">
                    {integrity.checks.slice(0, 6).map((check) => (
                      <div key={check.name} className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs">
                        <p className={`font-semibold ${check.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                          {check.ok ? 'OK' : 'FALLO'} · {check.name}
                        </p>
                        <p className="mt-1 text-gray-600 dark:text-gray-400">{check.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">Sin datos previos de integridad.</p>
              )}
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Gauge className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Atajos críticos</h2>
              </div>
              <div className="grid gap-2">
                <Link
                  href="/admin/moderation"
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-violet-50/60 dark:hover:bg-violet-900/15 transition-colors"
                >
                  <span className="flex items-center gap-2">Moderación pendientes</span>
                  <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                </Link>
                <Link
                  href="/admin/metrics"
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-violet-50/60 dark:hover:bg-violet-900/15 transition-colors"
                >
                  <span className="flex items-center gap-2">Métricas</span>
                  <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                </Link>
                <Link
                  href="/admin/users"
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-violet-50/60 dark:hover:bg-violet-900/15 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    Usuarios
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                </Link>
                <Link
                  href="/contexto"
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-violet-50/60 dark:hover:bg-violet-900/15 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    Contexto (mapa completo)
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-violet-200/80 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/25 p-5 md:p-6">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Crecimiento y “marea”</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-3">
                Ajusta cuánto pesa el like de cuentas concretas en el ranking (útil al inicio). Ejecuta en Supabase la
                migración SQL y luego usa el panel admin.
              </p>
              <Link
                href="/admin/vote-weights"
                className="inline-flex items-center gap-2 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline"
              >
                Ir a Peso de voto
                <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}

export default function OperacionesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
        </div>
      }
    >
      <OperacionesPageInner />
    </Suspense>
  );
}
