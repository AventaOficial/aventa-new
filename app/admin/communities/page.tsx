'use client';

import Link from 'next/link';
import { Building2, ExternalLink } from 'lucide-react';

export default function AdminCommunitiesPage() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
          <Building2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Comunidades</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Vista pública y contexto para el equipo
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
          Las comunidades visibles para los usuarios están en la sección pública. Los datos (slugs, orden,
          visibilidad) se gestionan en Supabase; aquí tienes un acceso rápido al listado en la web.
        </p>
        <Link
          href="/communities"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2.5 transition-colors"
        >
          Abrir comunidades
          <ExternalLink className="h-4 w-4 opacity-90" />
        </Link>
      </div>
    </div>
  );
}
