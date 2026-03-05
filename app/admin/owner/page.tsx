'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  ClipboardList,
  UserCog,
  Megaphone,
  FileText,
  ExternalLink,
  FlaskConical,
} from 'lucide-react';

export default function OwnerPanelPage() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <LayoutDashboard className="h-7 w-7 text-purple-600 dark:text-purple-400" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Mi panel
        </h1>
      </div>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Todo lo que solo tú controlas, en un solo lugar. Privado y solo owner.
      </p>

      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
        <Link
          href="/admin/moderation"
          className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300 dark:hover:border-purple-600 transition-colors"
        >
          <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40">
            <FlaskConical className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              Ofertas de testers
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Activa o desactiva las ofertas de ejemplo en el home. Toggle en Moderación → Pendientes.
            </p>
            <span className="inline-flex items-center gap-1 mt-2 text-sm text-purple-600 dark:text-purple-400 font-medium">
              Ir a Moderación <ExternalLink className="h-3.5 w-3.5" />
            </span>
          </div>
        </Link>

        <Link
          href="/admin/team"
          className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300 dark:hover:border-purple-600 transition-colors"
        >
          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/40">
            <UserCog className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              Equipo
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Gestionar roles: admin, moderador, analista. Solo owner.
            </p>
            <span className="inline-flex items-center gap-1 mt-2 text-sm text-purple-600 dark:text-purple-400 font-medium">
              Ir a Equipo <ExternalLink className="h-3.5 w-3.5" />
            </span>
          </div>
        </Link>

        <Link
          href="/admin/announcements"
          className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300 dark:hover:border-purple-600 transition-colors"
        >
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40">
            <Megaphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              Avisos
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Mensajes globales del sitio. Crear, editar y programar.
            </p>
            <span className="inline-flex items-center gap-1 mt-2 text-sm text-purple-600 dark:text-purple-400 font-medium">
              Ir a Avisos <ExternalLink className="h-3.5 w-3.5" />
            </span>
          </div>
        </Link>

        <Link
          href="/admin/moderation"
          className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300 dark:hover:border-purple-600 transition-colors"
        >
          <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
            <ClipboardList className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              Moderación
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Pendientes, aprobadas, rechazadas, comentarios, reportes, baneos.
            </p>
            <span className="inline-flex items-center gap-1 mt-2 text-sm text-purple-600 dark:text-purple-400 font-medium">
              Ir a Pendientes <ExternalLink className="h-3.5 w-3.5" />
            </span>
          </div>
        </Link>
      </div>

      <section className="mt-8 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            Qué toca ahora
          </h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Resumen desde la guía: pendientes antes de lanzar abierto y recordatorios.
        </p>
        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside">
          <li>Privacidad: correo de contacto real en /privacy (sustituir placeholder).</li>
          <li>Prueba punta a punta: registro → subir oferta → votar → comentar → reportar → moderar.</li>
        </ul>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
          Detalle completo en <strong>docs/GUIA_AVENTA.md</strong> y día a día en <strong>docs/COMO_LLEVAR_AVENTA.md</strong>.
        </p>
      </section>
    </div>
  );
}
