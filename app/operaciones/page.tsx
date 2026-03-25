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
} from 'lucide-react';

function OperacionesPageInner() {
  const router = useRouter();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
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
          if (!data) router.replace('/');
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

            <section className="rounded-2xl border border-dashed border-violet-300/80 dark:border-violet-700/50 bg-violet-50/40 dark:bg-violet-950/20 p-5 md:p-6">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Crecimiento y “marea”</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                <strong className="text-gray-800 dark:text-gray-200">Multiplicador de voto por usuario</strong> (solo
                owner): poder elegir cuentas cuyo like pese más en el ranking (ej. ×50) para las primeras semanas. Requiere
                columna en perfiles o tabla admin, API de votos y UI en admin; lo dejamos como siguiente entrega técnica
                para no romper el trigger actual de <code className="text-xs">offer_votes</code> sin migración probada.
              </p>
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
