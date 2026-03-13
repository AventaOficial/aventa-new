 'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ClientLayout from '@/app/ClientLayout';
import { LayoutDashboard, FlaskConical, UserCog, Megaphone, ClipboardList, ChevronRight } from 'lucide-react';

function MiPanelPageInner() {
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
        <div className="max-w-xl mx-auto px-4 py-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            Mi panel
          </h1>

          <ul className="mt-6 space-y-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <li>
              <Link
                href="/admin/moderation"
                className="flex items-center justify-between px-4 py-3 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <FlaskConical className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Ofertas de testers
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>
            </li>
            <li className="border-t border-gray-200 dark:border-gray-700">
              <Link
                href="/admin/team"
                className="flex items-center justify-between px-4 py-3 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <UserCog className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  Equipo
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>
            </li>
            <li className="border-t border-gray-200 dark:border-gray-700">
              <Link
                href="/admin/announcements"
                className="flex items-center justify-between px-4 py-3 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <Megaphone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Avisos
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>
            </li>
            <li className="border-t border-gray-200 dark:border-gray-700">
              <Link
                href="/admin/moderation"
                className="flex items-center justify-between px-4 py-3 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <ClipboardList className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  Moderación
                </span>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </Link>
            </li>
          </ul>

          <section className="mt-8 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Qué toca ahora</h2>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside">
              <li>Privacidad: correo real en /privacy (sustituir placeholder).</li>
              <li>Prueba punta a punta: registro → subir oferta → votar → comentar → reportar → moderar.</li>
            </ul>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
              <span className="font-medium">docs/GUIA_AVENTA.md</span> · <span className="font-medium">docs/COMO_LLEVAR_AVENTA.md</span>
            </p>
          </section>
        </div>
      </div>
    </ClientLayout>
  );
}

export default function MiPanelPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
        </div>
      }
    >
      <MiPanelPageInner />
    </Suspense>
  );
}
