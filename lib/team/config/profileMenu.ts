import { TEAM_IDS, type TeamId } from '../roles/teams';

export type ProfileMenuLink = {
  id: 'ceo' | 'mine' | TeamId;
  href: string;
  label: string;
};

/**
 * Etiquetas del menú de perfil.
 * `product` se muestra como Technical: es el equipo de salud de producto.
 * No hay un TeamId `technical` y no se crea otro sistema de roles.
 */
const DASHBOARD_LABEL: Record<TeamId, string> = {
  moderation: 'Moderación',
  hunter: 'Hunter',
  growth: 'Growth',
  product: 'Technical',
  community: 'Comunidad',
  operations: 'Operations',
  finance: 'Finance',
};

/**
 * Navegación contextual del menú de perfil.
 * El Owner entra al CEO Dashboard y no ve el atajo de otro equipo.
 * «Mi equipo» solo aparece con una membresía activa. Una sesión sin equipo no lo ve.
 */
export function profileMenuLinks(input: {
  isOwner: boolean;
  teamIds: readonly string[];
}): ProfileMenuLink[] {
  const links: ProfileMenuLink[] = [];
  const active = TEAM_IDS.filter((teamId) => input.teamIds.includes(teamId));

  if (input.isOwner) {
    links.push({ id: 'ceo', href: '/admin/owner', label: 'CEO Dashboard' });
  } else {
    for (const teamId of active) {
      links.push({
        id: teamId,
        href: `/team/${teamId}`,
        label: DASHBOARD_LABEL[teamId],
      });
    }
  }

  if (active.length > 0) {
    links.push({ id: 'mine', href: '/team', label: 'Mi equipo' });
  }
  return links;
}
