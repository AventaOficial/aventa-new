import { TEAM_IDS, type TeamId } from '../../roles/teams';
import type { TeamXpRule } from './types';

/**
 * Escala: 10 = una decisión humana completa sobre un objeto.
 * Más que 10 solo si el resultado pasó por la revisión de otra persona.
 * La versión cambia con cualquier cambio de monto, límite o condición;
 * los grants anteriores conservan su versión y su monto.
 */
export const TEAM_XP_RULES: readonly TeamXpRule[] = [
  {
    id: 'moderation.offer_decision',
    teamId: 'moderation',
    version: 1,
    enabled: true,
    eventType: 'moderation.offer_decided',
    amount: 10,
    dailyCap: 300,
    recipient: 'actor',
    objectKey: 'offer',
    requiredPermission: 'moderation.offers.decide',
    conditions: ['decision_from_pending', 'not_bulk', 'actor_not_offer_author'],
    antiFarming: [
      'Una sola vez por oferta, aunque vuelva a pending tras una edición.',
      'Aprobar y rechazar valen lo mismo para no premiar aprobar sin revisar.',
      'Sin XP si quien decide subió la oferta.',
      'Sin XP en acciones en lote.',
      'Tope diario de 300 por si una cuenta alimenta la cola con ofertas triviales.',
    ],
  },
  {
    id: 'hunter.batch_item_published',
    teamId: 'hunter',
    version: 1,
    enabled: true,
    eventType: 'moderation.offer_decided',
    amount: 15,
    dailyCap: 100,
    recipient: 'batch_submitter',
    objectKey: 'batch_item',
    requiredPermission: 'hunter.offers.read',
    conditions: ['decision_from_pending', 'not_bulk', 'decision_approved', 'recipient_not_actor'],
    antiFarming: [
      'Solo cuenta un enlace de lote que otra persona aprobó en moderación.',
      'Una sola vez por ítem de lote.',
      'Sin XP por pegar enlaces, procesarlos ni por rechazos.',
      'Sin XP si quien aprueba es quien envió el lote.',
      'Tope diario de 100 porque un solo pegado puede traer muchos enlaces.',
    ],
  },
];

export function rulesForEvent(type: TeamXpRule['eventType'], rules: readonly TeamXpRule[] = TEAM_XP_RULES): TeamXpRule[] {
  return rules.filter((rule) => rule.enabled && rule.eventType === type);
}

export function rulesForTeam(teamId: TeamId, rules: readonly TeamXpRule[] = TEAM_XP_RULES): TeamXpRule[] {
  return rules.filter((rule) => rule.teamId === teamId);
}

export function teamsWithoutRules(rules: readonly TeamXpRule[] = TEAM_XP_RULES): TeamId[] {
  return TEAM_IDS.filter((teamId) => rulesForTeam(teamId, rules).length === 0);
}
