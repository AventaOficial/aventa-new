'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';
import { Puzzle, ArrowLeft, Clock } from 'lucide-react';

function ExtensionPageInner() {
  return (
    <ClientLayout>
      <div className="min-h-screen bg-transparent">
        <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>

          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
            <Clock className="h-3.5 w-3.5" />
            Pausada temporalmente
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] dark:text-gray-100 mb-2">
            Extensión AVENTA
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
            La extensión para Chrome está en pausa mientras concentramos la experiencia en la web. Puedes
            seguir publicando ofertas desde el sitio sin instalar nada.
          </p>

          <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5 md:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                <Puzzle className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Qué harás cuando vuelva</h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Desde Amazon o Mercado Libre, un clic enviará el producto al formulario de subir oferta en
              AVENTA. Mientras tanto, usa la publicación web: es el flujo oficial y soportado.
            </p>
            <Link
              href="/subir"
              className="inline-flex items-center justify-center rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-5 py-3 text-sm font-semibold transition-colors"
            >
              Subir oferta en la web
            </Link>
          </section>
        </div>
      </div>
    </ClientLayout>
  );
}

export default function ExtensionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
        </div>
      }
    >
      <ExtensionPageInner />
    </Suspense>
  );
}
