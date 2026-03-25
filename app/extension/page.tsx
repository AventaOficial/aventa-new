'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';
import { Puzzle, Chrome, ExternalLink, ArrowLeft } from 'lucide-react';

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
            Extensión AVENTA
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Caza ofertas desde Amazon y Mercado Libre y envíalas a AVENTA en un clic.
          </p>

          <div className="space-y-6">
            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Puzzle className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Qué hace</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                En una página de producto compatible, la extensión lee título, imagen, enlace y tienda. Al pulsar el
                botón se abre AVENTA con el formulario de subir oferta ya rellenado; solo completas precio y categoría y
                envías.
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Chrome className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Instalar (Chrome, modo desarrollo)</h2>
              </div>
              <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-3 list-decimal list-inside leading-relaxed">
                <li>
                  Abre{' '}
                  <span className="font-medium text-gray-800 dark:text-gray-200">chrome://extensions</span>.
                </li>
                <li>Activa &quot;Modo desarrollador&quot; (arriba a la derecha).</li>
                <li>Pulsa &quot;Cargar descomprimida&quot; y elige la carpeta del proyecto llamada exactamente{' '}
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">browser-extension</code>.
                </li>
                <li>Entra a un producto en Amazon o Mercado Libre, haz clic en el icono de la extensión y luego en &quot;Cazar oferta en Aventa&quot;.</li>
              </ol>
              <p className="mt-4 text-xs text-gray-500 dark:text-gray-500">
                Cuando publiquemos en Chrome Web Store, añadiremos aquí el enlace de instalación en un clic.
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <ExternalLink className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Documentación técnica</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Misma información en el repositorio:{' '}
                <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">browser-extension/README.md</code>{' '}
                y <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">docs/PRD/browser-extension.md</code>.
              </p>
              <Link
                href="/subir"
                className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
              >
                Abrir subir oferta en la web
              </Link>
            </section>
          </div>
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
