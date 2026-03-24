'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ClientLayout from '@/app/ClientLayout';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Shield,
  UserCog,
  Megaphone,
  FlaskConical,
  ChevronRight,
  ClipboardList,
  CheckCircle,
  XCircle,
  MessageCircle,
  Flag,
  ShieldOff,
  Building2,
  Heart,
  FileText,
} from 'lucide-react';

type PanelLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const SECTIONS: {
  id: string;
  title: string;
  context: string;
  links: PanelLink[];
}[] = [
  {
    id: 'comunidad',
    title: 'Comunidad y calidad',
    context:
      'Todo lo que la gente publica y consume: cola de ofertas, comentarios, reportes de la comunidad y accesos restringidos. Es el núcleo operativo del día a día.',
    links: [
      { href: '/admin/moderation', label: 'Pendientes', icon: ClipboardList },
      { href: '/admin/moderation/approved', label: 'Aprobadas', icon: CheckCircle },
      { href: '/admin/moderation/rejected', label: 'Rechazadas', icon: XCircle },
      { href: '/admin/moderation/comments', label: 'Comentarios', icon: MessageCircle },
      { href: '/admin/reports', label: 'Reportes', icon: Flag },
      { href: '/admin/moderation/bans', label: 'Baneos', icon: ShieldOff },
      { href: '/admin/communities', label: 'Comunidades', icon: Building2 },
    ],
  },
  {
    id: 'analisis',
    title: 'Análisis y salud',
    context:
      'Métricas de uso y rendimiento del producto: actividad, retención, vistas/clics y comprobaciones de salud. Sirve para priorizar y detectar incidencias.',
    links: [
      { href: '/admin/metrics', label: 'Métricas', icon: BarChart3 },
      { href: '/admin/health', label: 'Health', icon: Heart },
      { href: '/admin/analista', label: 'Panel analista', icon: LayoutDashboard },
    ],
  },
  {
    id: 'admin',
    title: 'Administración',
    context:
      'Usuarios del sistema y registro de acciones (moderación, equipo). Útil para auditoría y soporte.',
    links: [
      { href: '/admin/users', label: 'Usuarios', icon: Users },
      { href: '/admin/logs', label: 'Logs', icon: FileText },
    ],
  },
  {
    id: 'equipo',
    title: 'Equipo y comunicación',
    context:
      'Quién tiene acceso al panel, avisos globales en la app y la opción de mostrar ofertas de ejemplo (testers) en la home — se configura desde moderación.',
    links: [
      { href: '/admin/team', label: 'Equipo y roles', icon: UserCog },
      { href: '/admin/announcements', label: 'Avisos del sitio', icon: Megaphone },
      { href: '/admin/moderation', label: 'Ofertas de testers (config)', icon: FlaskConical },
    ],
  },
];

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
        <div className="max-w-3xl mx-auto px-4 py-8 md:py-10 pb-28 md:pb-10">
          <header className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Panel owner
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Mapa de AVENTA por áreas: enlaces al mismo panel admin, ordenado por función.
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mt-4 pl-0 md:pl-14">
              Cada bloque resume <strong className="text-gray-800 dark:text-gray-200">qué parte del producto</strong>{' '}
              tocas ahí. No duplica lógica: solo te orienta antes de entrar a Moderación, Métricas, Equipo, etc.
            </p>
          </header>

          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <section
                key={section.id}
                className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 overflow-hidden shadow-sm"
              >
                <div className="px-4 py-4 md:px-5 md:py-5 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-900/40">
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
