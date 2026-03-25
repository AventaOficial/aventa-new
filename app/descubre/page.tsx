'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';
import {
  Mail,
  Bell,
  Heart,
  Shield,
  Sparkles,
  Users2,
  PlusCircle,
  LayoutGrid,
  UserRound,
  Smartphone,
} from 'lucide-react';

function DescubrePageInner() {
  return (
    <ClientLayout>
      <div className="min-h-screen bg-transparent">
        <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
          <h1 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] dark:text-gray-100 mb-2">
            Descubre AVENTA
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Las mejores ofertas, elegidas por la comunidad. Aquí tienes un mapa de lo que puedes hacer en la
            web y la app.
          </p>

          <div className="space-y-6">
            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Inicio y ranking</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                En la página principal eliges cómo ver las ofertas: <strong>Día a día</strong>,{' '}
                <strong>Top</strong>, <strong>Para ti</strong> (según tus gustos) o <strong>Últimas</strong>.
                Vota para que suban o bajen en el ranking.
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
              >
                Ir al inicio
              </Link>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <PlusCircle className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Subir ofertas</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Usa el botón <strong className="text-gray-800 dark:text-gray-200">+</strong> en la barra inferior
                (móvil) o en el lateral (escritorio). Puedes pegar el enlace de la tienda: intentamos rellenar
                título, imagen y nombre de tienda. Las ofertas nuevas pasan por moderación salvo que tengas
                reputación alta (auto-aprobación).
              </p>
              <Link
                href="/subir"
                className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
              >
                Abrir subir oferta
              </Link>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <LayoutGrid className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Categorías, tiendas y comunidades</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Explora por categoría (macro: Tecnología, Gaming, Hogar, etc.), por tienda concreta, o entra en
                comunidades por tema.
              </p>
              <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                <li>
                  <Link href="/categoria/tecnologia" className="font-medium text-violet-600 dark:text-violet-400 hover:underline">
                    Categoría Tecnología
                  </Link>
                  <span className="text-gray-500 dark:text-gray-500"> — también hay gaming, hogar, moda…</span>
                </li>
                <li>
                  <Link href="/categoria/gaming" className="font-medium text-violet-600 dark:text-violet-400 hover:underline">
                    Categoría Gaming
                  </Link>
                </li>
                <li>
                  <Link href="/tienda/amazon" className="font-medium text-violet-600 dark:text-violet-400 hover:underline">
                    Ofertas por tienda (ej. Amazon)
                  </Link>
                  <span className="text-gray-500 dark:text-gray-500"> — el slug cambia según la tienda.</span>
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <UserRound className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Tu perfil público</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Cada usuario tiene una URL pública del tipo <strong>/u/tu-nombre</strong> para compartir tu
                actividad. Configura nombre y avatar desde Configuración.
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Users2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Comentarios y reportes</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Puedes comentar en ofertas (con moderación de comentarios) y reportar contenido que no cumpla las
                normas. Ayudas a mantener la calidad de la comunidad.
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Mail className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Resúmenes en tu correo</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Activa en <strong>Configuración</strong> el resumen diario (Top 10 del día) y/o el resumen
                semanal (más comentadas y mejor votadas).
              </p>
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
              >
                Ir a Configuración
              </Link>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Bell className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Notificaciones y avisos</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                La campana en la barra agrupa avisos de ofertas y del equipo. Esta guía también está en el{' '}
                <strong>menú de tu foto de perfil</strong> → «Descubre AVENTA».
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Heart className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Favoritos y tu espacio</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Guarda ofertas en favoritos, revisa <strong>Mis ofertas</strong> y tu actividad. El nombre
                visible se puede cambiar cada 14 días desde Configuración.
              </p>
              <div className="flex flex-wrap gap-4 text-sm font-medium">
                <Link href="/me" className="text-violet-600 dark:text-violet-400 hover:underline">
                  Mis ofertas
                </Link>
                <Link href="/me/favorites" className="text-violet-600 dark:text-violet-400 hover:underline">
                  Favoritos
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Smartphone className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">App en el móvil (PWA)</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Puedes <strong>añadir AVENTA a la pantalla de inicio</strong>: en Android suele ofrecerse
                «Instalar app»; en iPhone, compartir → «Añadir a pantalla de inicio».
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Shield className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Moderación y calidad</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Las ofertas pasan por moderación antes de publicarse (salvo auto-aprobación por reputación).
                El ranking combina votos y reputación; entre todos mantenemos la calidad.
              </p>
            </section>
          </div>

          <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-500">
            <Link href="/" className="text-violet-600 dark:text-violet-400 hover:underline">
              Volver al inicio
            </Link>
          </p>
        </div>
      </div>
    </ClientLayout>
  );
}

export default function DescubrePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <div className="text-gray-500 dark:text-gray-400">Cargando…</div>
        </div>
      }
    >
      <DescubrePageInner />
    </Suspense>
  );
}
