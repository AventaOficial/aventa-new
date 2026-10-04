import { roleHasPermission } from '../../permissions/grants';
import type { TeamMembership } from '../../roles/membership';
import { rulesForEvent, TEAM_XP_RULES } from './catalog';
import type {
  TeamXpConditionId,
  TeamXpDomainEvent,
  TeamXpRule,
  TeamXpRuleDecision,
} from './types';

function recipientFor(rule: TeamXpRule, event: TeamXpDomainEvent): string | null {
  if (rule.recipient === 'actor') return event.actorUserId;
  return event.batchItem?.submittedBy ?? null;
}

function objectRef(rule: TeamXpRule, event: TeamXpDomainEvent): string | null {
  if (rule.objectKey === 'offer') return event.offerId;
  return event.batchItem?.id ?? null;
}

function conditionFails(id: TeamXpConditionId, event: TeamXpDomainEvent, recipient: string): boolean {
  switch (id) {
    case 'decision_from_pending':
      return event.previousStatus !== 'pending';
    case 'not_bulk':
      return event.bulk;
    case 'actor_not_offer_author':
      return event.offerAuthorId !== null && event.offerAuthorId === event.actorUserId;
    case 'decision_approved':
      return event.decision !== 'approved';
    case 'recipient_not_actor':
      return recipient === event.actorUserId;
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}

export function teamXpIdempotencyKey(rule: TeamXpRule, ref: string): string {
  return `team-xp:${rule.id}:${ref}`;
}

/**
 * Evalúa solo las reglas del tipo de evento.
 * No aplica: evento de máquina o regla sin destinatario u objeto.
 * Aplica y se omite: queda registrado con su motivo para que un reintento no lo conceda.
 */
export function evaluateTeamXpEvent(
  event: TeamXpDomainEvent,
  membershipsByUser: ReadonlyMap<string, readonly TeamMembership[]>,
  rules: readonly TeamXpRule[] = TEAM_XP_RULES,
): TeamXpRuleDecision[] {
  if (event.actorKind !== 'human') return [];
  const decisions: TeamXpRuleDecision[] = [];
  for (const rule of rulesForEvent(event.type, rules)) {
    const recipient = recipientFor(rule, event);
    const ref = objectRef(rule, event);
    if (!recipient || !ref) continue;

    let skipReason: TeamXpRuleDecision['skipReason'] = null;
    for (const condition of rule.conditions) {
      if (conditionFails(condition, event, recipient)) {
        skipReason = condition;
        break;
      }
    }

    if (!skipReason) {
      const membership = (membershipsByUser.get(recipient) ?? []).find(
        (item) => item.userId === recipient && item.teamId === rule.teamId && item.status === 'ACTIVE',
      );
      if (!membership) skipReason = 'recipient_not_active';
      else if (!roleHasPermission(rule.teamId, membership.role, rule.requiredPermission)) {
        skipReason = 'missing_permission';
      }
    }

    decisions.push({
      rule,
      actorUserId: event.actorUserId,
      recipientUserId: recipient,
      idempotencyKey: teamXpIdempotencyKey(rule, ref),
      eventRef: event.eventRef,
      skipReason,
    });
  }
  return decisions;
}
