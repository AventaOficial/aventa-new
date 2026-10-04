import type { TeamPermission } from '../../permissions/registry';
import type { TeamId } from '../../roles/teams';

/** Quién produjo el evento. Lo fija el servidor, nunca el cliente. */
export type TeamXpActorKind = 'human' | 'system' | 'worker';

/**
 * Decisión de moderación ya persistida en `moderation_logs`.
 * `eventRef` es el id de esa fila. Sin fila no hay evento.
 */
export type ModerationOfferDecidedEvent = {
  type: 'moderation.offer_decided';
  eventRef: string;
  actorKind: TeamXpActorKind;
  actorUserId: string;
  offerId: string;
  decision: 'approved' | 'rejected';
  previousStatus: string;
  offerAuthorId: string | null;
  bulk: boolean;
  batchItem: { id: string; submittedBy: string } | null;
};

export type TeamXpDomainEvent = ModerationOfferDecidedEvent;
export type TeamXpEventType = TeamXpDomainEvent['type'];

/** Las condiciones son datos para que la regla pueda persistirse más adelante. */
export type TeamXpConditionId =
  | 'decision_from_pending'
  | 'not_bulk'
  | 'actor_not_offer_author'
  | 'decision_approved'
  | 'recipient_not_actor';

export type TeamXpRecipient = 'actor' | 'batch_submitter';
export type TeamXpObjectKey = 'offer' | 'batch_item';

export type TeamXpRule = {
  id: string;
  teamId: TeamId;
  version: number;
  enabled: boolean;
  eventType: TeamXpEventType;
  amount: number;
  dailyCap: number;
  recipient: TeamXpRecipient;
  objectKey: TeamXpObjectKey;
  requiredPermission: TeamPermission;
  conditions: readonly TeamXpConditionId[];
  antiFarming: readonly string[];
};

export type TeamXpSkipReason =
  | TeamXpConditionId
  | 'recipient_not_active'
  | 'missing_permission';

export type TeamXpRuleDecision = {
  rule: TeamXpRule;
  actorUserId: string;
  recipientUserId: string;
  idempotencyKey: string;
  eventRef: string;
  skipReason: TeamXpSkipReason | null;
};
