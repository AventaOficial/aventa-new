'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';
import { Puzzle, ArrowLeft, Download, Chrome } from 'lucide-react';

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

          <h1 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] dark:text-gray-100 mb-2">
            Extensión AVENTA para Chrome
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
            Publica ofertas de Amazon y Mercado Libre en AVENTA sin salir de la tienda. La extensión
            analiza la página, rellena el formulario y respeta tu sesión y cooldown de publicación.
          </p>

          <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5 md:p-6 space-y-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                <Puzzle className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Cómo instalarla</h2>
            </div>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li>Descarga o carga la extensión desde la carpeta <code className="text-xs">browser-extension</code> del repositorio (modo desarrollador en Chrome).</li>
              <li>Inicia sesión en AVENTA en el navegador y abre el popup de la extensión.</li>
              <li>Visita un producto en Amazon o Mercado Libre y pulsa «Cazar oferta».</li>
            </ol>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              La publicación en la web sigue siendo el flujo principal y siempre está disponible.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/subir"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-5 py-3 text-sm font-semibold transition-colors"
              >
                <Chrome className="h-4 w-4" />
                Subir oferta en la web
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-4 text-sm text-gray-600 dark:text-gray-400">
            <p className="flex items-start gap-2">
              <Download className="h-4 w-4 mt-0.5 shrink-0 text-violet-600 dark:text-violet-400" />
              La versión en Chrome Web Store se publicará cuando esté lista para distribución masiva.
              Mientras tanto, la extensión V1 funciona en modo desarrollador para cazadores del equipo.
            </p>
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
