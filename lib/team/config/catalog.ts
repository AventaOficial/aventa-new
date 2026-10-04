import type { TeamId } from '../roles/teams';
import type { TeamMetadata } from './types';

/**
 * Identidad de cada equipo en Team OS.
 * Los permisos citados en la navegación no otorgan acceso: solo nombran
 * la capacidad que la autorización ya resolvió.
 */
export const TEAM_METADATA = {
  moderation: {
    teamId: 'moderation',
    displayName: 'Moderación',
    shortDescription: 'Cuidas lo que se publica en Aventa.',
    tagline: 'La puerta de lo que entra.',
    homeLine: 'Aquí va el trabajo de moderación. La decisión sigue siendo rápida.',
    icon: 'shield',
    accentClass: 'bg-violet-600',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'moderation.offers.read' }],
  },
  hunter: {
    teamId: 'hunter',
    displayName: 'Cazadores',
    shortDescription: 'Sigues la caza y las decisiones de tus lotes.',
    tagline: 'La búsqueda, en claro.',
    homeLine: 'Aquí vas a ver tu actividad de caza. La ingesta sigue fuera de este espacio.',
    icon: 'crosshair',
    accentClass: 'bg-amber-500',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'hunter.offers.read' }],
  },
  growth: {
    teamId: 'growth',
    displayName: 'Growth',
    shortDescription: 'Ves cómo llega la gente a Aventa.',
    tagline: 'De la visita a la comunidad.',
    homeLine: 'El espacio de growth muestra solo lo que ya tiene fuente real.',
    icon: 'sprout',
    accentClass: 'bg-emerald-600',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'growth.overview.read' }],
  },
  product: {
    teamId: 'product',
    displayName: 'Producto',
    shortDescription: 'Lees la salud del producto.',
    tagline: 'Qué está funcionando.',
    homeLine: 'Producto se queda en salud y lectura. No hay un gestor de issues aquí.',
    icon: 'box',
    accentClass: 'bg-sky-600',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'product.overview.read' }],
  },
  community: {
    teamId: 'community',
    displayName: 'Comunidad',
    shortDescription: 'Acompañas la conversación de la plaza.',
    tagline: 'La plaza, de cerca.',
    homeLine: 'Comunidad entra por lo que ya está registrado. Sin cifras inventadas.',
    icon: 'messages',
    accentClass: 'bg-rose-600',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'community.overview.read' }],
  },
  operations: {
    teamId: 'operations',
    displayName: 'Operaciones',
    shortDescription: 'Miras que la operación siga en pie.',
    tagline: 'El día, en orden.',
    homeLine: 'Operaciones muestra el estado que el sistema ya conoce.',
    icon: 'activity',
    accentClass: 'bg-orange-600',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'operations.overview.read' }],
  },
  finance: {
    teamId: 'finance',
    displayName: 'Finanzas',
    shortDescription: 'Lees el estado del dinero, sin moverlo.',
    tagline: 'Lectura, no movimiento.',
    homeLine: 'Finanzas es de lectura mientras el camino de dinero está congelado.',
    icon: 'landmark',
    accentClass: 'bg-teal-600',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'finance.overview.read' }],
  },
} as const satisfies Record<TeamId, TeamMetadata>;

export function teamMetadata(teamId: TeamId): TeamMetadata {
  return TEAM_METADATA[teamId];
}
