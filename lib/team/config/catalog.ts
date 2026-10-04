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
    tagline: 'Protege la calidad de Aventa.',
    homeLine: 'Aquí va el trabajo de moderación. La decisión sigue siendo rápida.',
    icon: 'shield',
    accentClass: 'bg-violet-600',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'moderation.offers.read' }],
  },
  hunter: {
    teamId: 'hunter',
    displayName: 'Cazadores',
    shortDescription: 'Sigues la caza y las decisiones de tus lotes.',
    tagline: 'La caza se mira aquí. La ingesta no.',
    homeLine: 'Aquí vas a ver tu actividad de caza. La ingesta sigue fuera de este espacio.',
    icon: 'crosshair',
    accentClass: 'bg-amber-500',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'hunter.offers.read' }],
  },
  growth: {
    teamId: 'growth',
    displayName: 'Growth',
    shortDescription: 'Ves cómo llega la gente a Aventa.',
    tagline: 'Cómo llega la gente, cuando el dato es real.',
    homeLine: 'El espacio de growth muestra solo lo que ya tiene fuente real.',
    icon: 'sprout',
    accentClass: 'bg-emerald-600',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'growth.overview.read' }],
  },
  product: {
    teamId: 'product',
    displayName: 'Producto',
    shortDescription: 'Lees la salud del producto.',
    tagline: 'La salud del producto, sin un gestor de issues.',
    homeLine: 'Producto se queda en salud y lectura. No hay un gestor de issues aquí.',
    icon: 'box',
    accentClass: 'bg-sky-600',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'product.overview.read' }],
  },
  community: {
    teamId: 'community',
    displayName: 'Comunidad',
    shortDescription: 'Acompañas la conversación de la plaza.',
    tagline: 'La plaza, con lo que ya está escrito.',
    homeLine: 'Comunidad entra por lo que ya está registrado. Sin cifras inventadas.',
    icon: 'messages',
    accentClass: 'bg-rose-600',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'community.overview.read' }],
  },
  operations: {
    teamId: 'operations',
    displayName: 'Operaciones',
    shortDescription: 'Miras que la operación siga en pie.',
    tagline: 'La operación del día, sin autoría inventada.',
    homeLine: 'Operaciones muestra el estado que el sistema ya conoce.',
    icon: 'activity',
    accentClass: 'bg-orange-600',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'operations.overview.read' }],
  },
  finance: {
    teamId: 'finance',
    displayName: 'Finanzas',
    shortDescription: 'Lees el estado del dinero, sin moverlo.',
    tagline: 'Lectura del dinero. Sin moverlo.',
    homeLine: 'Finanzas es de lectura mientras el camino de dinero está congelado.',
    icon: 'landmark',
    accentClass: 'bg-teal-600',
    navigation: [{ id: 'home', label: 'Inicio', permission: 'finance.overview.read' }],
  },
} as const satisfies Record<TeamId, TeamMetadata>;

export function teamMetadata(teamId: TeamId): TeamMetadata {
  return TEAM_METADATA[teamId];
}
