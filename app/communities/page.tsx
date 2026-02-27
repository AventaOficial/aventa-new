'use client';

import { Users2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';

export default function CommunitiesPage() {
  return (
    <ClientLayout>
      <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100">
        <section className="max-w-2xl mx-auto px-4 py-16 md:py-24">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-pink-100 dark:from-violet-900/30 dark:to-pink-900/30 mb-6">
              <Users2 className="h-10 w-10 text-violet-600 dark:text-violet-400" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] dark:text-gray-100 mb-2">
              Comunidades
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md">
              Hubs de cazadores de ofertas. Cada comunidad tiene su líder, sus ofertas y su tráfico. Próximamente.
            </p>
            <div className="rounded-xl border border-violet-200 dark:border-violet-800/40 bg-violet-50/50 dark:bg-violet-900/20 px-6 py-4 flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400 flex-shrink-0" />
              <p className="text-sm text-violet-800 dark:text-violet-300 text-left">
                Estamos construyendo las comunidades. Será el núcleo de distribución de AVENTA.
              </p>
            </div>
            <Link
              href="/"
              className="mt-8 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 px-6 py-3 font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
            >
              Volver al inicio
            </Link>
          </div>
        </section>
      </div>
    </ClientLayout>
  );
}
