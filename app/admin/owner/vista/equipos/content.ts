import type { TeamId } from '../../command/types';

export type TeamVista = {
  id: TeamId;
  title: string;
  subtitle: string;
  toolHref: string;
  toolLabel: string;
  people: { title: string };
};

export const TEAM_VIEWS: Record<TeamId, TeamVista> = {
  moderacion: {
    id: 'moderacion',
    title: 'Equipo de moderación',
    subtitle: 'Gestión, rendimiento y actividad del equipo de moderadores.',
    toolHref: '/admin/moderation',
    toolLabel: 'Ver moderación',
    people: { title: 'Moderadores' },
  },
  finanzas: {
    id: 'finanzas',
    title: 'Equipo de finanzas',
    subtitle: 'Pagos, lotes y estado del flujo de dinero.',
    toolHref: '/equipo/contabilidad',
    toolLabel: 'Abrir contabilidad',
    people: { title: 'Lotes recientes' },
  },
  growth: {
    id: 'growth',
    title: 'Equipo de growth',
    subtitle: 'Visitas, clics y conversión de la comunidad.',
    toolHref: '/admin/owner/crecimiento',
    toolLabel: 'Abrir crecimiento',
    people: { title: 'Campañas' },
  },
  producto: {
    id: 'producto',
    title: 'Equipo de producto',
    subtitle: 'Salud del producto, errores y tiempos de respuesta.',
    toolHref: '/admin/health',
    toolLabel: 'Abrir salud',
    people: { title: 'Superficies' },
  },
  hunter: {
    id: 'hunter',
    title: 'Equipo Hunter',
    subtitle: 'Captura de ofertas, fuentes y runs.',
    toolHref: '/admin/hunter',
    toolLabel: 'Abrir Hunter',
    people: { title: 'Fuentes' },
  },
  comunidad: {
    id: 'comunidad',
    title: 'Equipo de comunidad',
    subtitle: 'Publicaciones, votos, comentarios y reportes.',
    toolHref: '/plaza',
    toolLabel: 'Abrir Plaza',
    people: { title: 'Temas activos' },
  },
  operaciones: {
    id: 'operaciones',
    title: 'Equipo de operaciones',
    subtitle: 'Servicios, colas y procesos que mantienen Aventa en pie.',
    toolHref: '/admin/operaciones',
    toolLabel: 'Abrir operaciones',
    people: { title: 'Procesos' },
  },
};
