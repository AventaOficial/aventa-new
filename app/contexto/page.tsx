'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ClientLayout from '@/app/ClientLayout';
import { Shield, ChevronRight } from 'lucide-react';
import { OWNER_CONTEXT_SECTIONS } from '@/lib/ownerContextSections';

function ContextoPageInner() {
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
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Contexto</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Mapa del producto por áreas: enlaces al panel admin, ordenados por función.
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mt-4 pl-0 md:pl-14">
              Cada bloque resume <strong className="text-gray-800 dark:text-gray-200">qué parte del producto</strong>{' '}
              tocas ahí. Para tu día a día como fundador usa también{' '}
              <Link href="/admin/operaciones" className="font-medium text-violet-600 dark:text-violet-400 hover:underline">
                Centro de operaciones
              </Link>
              .
            </p>
          </header>

          <div className="space-y-8">
            {OWNER_CONTEXT_SECTIONS.map((section) => (
              <section
                key={section.id}
                className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1a]/80 overflow-hidden shadow-sm"
              >
                <div className="px-4 py-4 md:px-5 md:py-5 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50/80 dark:bg-[#141414]/40">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                    {section.title}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{section.context}</p>
                </div>
                <ul className="divide-y divide-gray-100 dark:divide-gray-700/80">
                  {section.links.map(({ href, label, icon: Icon }) => (
                    <li key={href + label}>
                      <Link
                        href={href}
                        className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5 text-gray-900 dark:text-gray-100 hover:bg-violet-50/60 dark:hover:bg-violet-900/15 transition-colors"
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <Icon className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                          <span className="font-medium truncate">{label}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <p className="mt-10 text-center text-xs text-gray-500 dark:text-gray-500">
            Documentación interna:{' '}
            <span className="font-medium text-gray-600 dark:text-gray-400">docs/GUIA_AVENTA.md</span>
          </p>
        </div>
      </div>
    </ClientLayout>
  );
}

export default function ContextoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
        </div>
      }
    >
      <ContextoPageInner />
    </Suspense>
  );
}
