'use client';

import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';
import { Mail, Bell, Heart, Shield, Sparkles } from 'lucide-react';

export default function DescubrePage() {
  return (
    <ClientLayout>
      <div className="min-h-screen bg-transparent">
        <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
          <h1 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] dark:text-gray-100 mb-2">
            Descubre AVENTA
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Las mejores ofertas, elegidas por la comunidad. Aquí tienes todo lo que puedes hacer con nosotros.
          </p>

          <div className="space-y-6">
            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Ofertas por la comunidad</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Publica ofertas, vota y comenta. Las que más sumen suben en el ranking. Top 10 del día y resumen semanal para no perderte nada.
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
                Activa en <strong>Configuración</strong> el resumen diario (Top 10 del día) y/o el resumen semanal (más comentadas y mejor votadas). Te enviamos un correo a la hora de salida del trabajo.
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
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Notificaciones</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Revisa la campana en la barra superior: notificaciones de ofertas (aprobadas, comentarios) y avisos del equipo.
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Heart className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">Favoritos y perfil</h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Guarda ofertas en favoritos y comparte tu perfil con tu nombre visible. Puedes cambiar el nombre cada 14 días desde Configuración.
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
                Las ofertas pasan por moderación antes de publicarse. La comunidad vota y comenta; el ranking combina votos y reputación.
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
