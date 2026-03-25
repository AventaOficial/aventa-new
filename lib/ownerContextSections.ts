import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList,
  CheckCircle,
  XCircle,
  MessageCircle,
  Flag,
  ShieldOff,
  BarChart3,
  Heart,
  LayoutDashboard,
  Users,
  FileText,
  UserCog,
  Megaphone,
  FlaskConical,
} from 'lucide-react';

export type PanelLink = { href: string; label: string; icon: LucideIcon };

export const OWNER_CONTEXT_SECTIONS: {
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
