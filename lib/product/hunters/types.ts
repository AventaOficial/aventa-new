/**
 * Aventa Hunter: identidad editorial oficial del producto.
 * No es un usuario, un rol, un miembro de equipo ni una entidad de dinero.
 */

export const HUNTER_STATUSES = ['draft', 'active', 'archived'] as const;
export type HunterStatus = (typeof HUNTER_STATUSES)[number];

export type EditorialHunter = {
  id: string;
  /** Inmutable. Nunca es el nombre ni un emoji. */
  code: string;
  slug: string;
  name: string;
  displayName: string;
  title: string;
  specialty: string;
  shortBio: string;
  longBio: string;
  /** Contenido editorial. No decide permisos, rewards ni dinero. */
  personality: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  /** URL del ícono en storage. No es un emoji ni un permiso. */
  icon: string | null;
  /** Color #rrggbb. Metadata visual, no un archivo. */
  accent: string | null;
  status: HunterStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
