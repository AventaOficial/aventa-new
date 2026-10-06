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
 * El resto ve solo los equipos de su membresía activa, más Mi equipo.
 */
export function profileMenuLinks(input: {
  isOwner: boolean;
  teamIds: readonly string[];
}): ProfileMenuLink[] {
  const links: ProfileMenuLink[] = [];

  if (input.isOwner) {
    links.push({ id: 'ceo', href: '/admin/owner', label: 'CEO Dashboard' });
  } else {
    const active = new Set(input.teamIds);
    for (const teamId of TEAM_IDS) {
      if (!active.has(teamId)) continue;
      links.push({
        id: teamId,
        href: `/team/${teamId}`,
        label: DASHBOARD_LABEL[teamId],
      });
    }
  }

  links.push({ id: 'mine', href: '/team', label: 'Mi equipo' });
  return links;
}
