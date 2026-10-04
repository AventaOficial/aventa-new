import type { SupabaseClient } from '@supabase/supabase-js';
import { membershipFromRow } from '../../gate/policy';
import type { TeamMembership } from '../../roles/membership';
import { TEAM_XP_RULES } from './catalog';
import type { ModerationOfferDecidedEvent, TeamXpActorKind } from './types';

type BatchLink = { id: string; submittedBy: string };

/**
 * Contexto de la decisión congelado en `moderation_logs.metadata.team_xp`, en la misma
 * fila del evento. La ruta en vivo y la reconciliación evalúan exactamente esto:
 * membresías al momento del evento, `bulk` real y autor de la oferta.
 */
export type TeamXpEventSnapshot = {
  v: 1;
  actorKind: TeamXpActorKind;
  bulk: boolean;
  offerAuthorId: string | null;
  batchItem: BatchLink | null;
  memberships: { userId: string; teamId: string; role: string }[];
};

export type PersistedModerationEvent = {
  event: ModerationOfferDecidedEvent;
  occurredAt: string;
  memberships: ReadonlyMap<string, readonly TeamMembership[]>;
};

/** Columnas que la ruta devuelve tras insertar y que la reconciliación lee. */
export const MODERATION_LOG_EVENT_COLUMNS = 'id, offer_id, user_id, action, previous_status, created_at, metadata';

const RULE_TEAMS: ReadonlySet<string> = new Set(TEAM_XP_RULES.map((rule) => rule.teamId));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Ítem de lote que creó la oferta y quién envió ese lote. */
export async function loadBatchLinks(
  supabase: SupabaseClient,
  offerIds: readonly string[],
): Promise<Map<string, BatchLink>> {
  const links = new Map<string, BatchLink>();
  if (offerIds.length === 0) return links;
  const { data: items, error } = await supabase
    .from('offer_batch_items')
    .select('id, batch_id, offer_id')
    .in('offer_id', [...offerIds]);
  if (error || !items) return links;

  const rows = items.flatMap((row) => {
    if (!isRecord(row)) return [];
    const id = readString(row.id);
    const batchId = readString(row.batch_id);
    const offerId = readString(row.offer_id);
    return id && batchId && offerId ? [{ id, batchId, offerId }] : [];
  });
  if (rows.length === 0) return links;

  const { data: batches, error: batchError } = await supabase
    .from('offer_batches')
    .select('id, created_by')
    .in('id', [...new Set(rows.map((row) => row.batchId))]);
  if (batchError || !batches) return links;

  const creators = new Map<string, string>();
  for (const batch of batches) {
    if (!isRecord(batch)) continue;
    const id = readString(batch.id);
    const createdBy = readString(batch.created_by);
    if (id && createdBy) creators.set(id, createdBy);
  }
  for (const row of rows) {
    const submittedBy = creators.get(row.batchId);
    if (submittedBy) links.set(row.offerId, { id: row.id, submittedBy });
  }
  return links;
}

/** Una consulta para todas las personas del evento. Solo equipos con reglas. */
async function loadEventMemberships(
  supabase: SupabaseClient,
  userIds: readonly string[],
): Promise<TeamXpEventSnapshot['memberships'] | null> {
  const { data, error } = await supabase
    .from('team_memberships')
    .select('user_id, team_id, role, status')
    .in('user_id', [...userIds])
    .eq('status', 'ACTIVE');
  if (error || !data) return null;
  return data.flatMap((row) => {
    if (!isRecord(row) || row.status !== 'ACTIVE') return [];
    const userId = readString(row.user_id);
    const teamId = readString(row.team_id);
    const role = readString(row.role);
    if (!userId || !teamId || !role || !RULE_TEAMS.has(teamId)) return [];
    return [{ userId, teamId, role }];
  });
}

/**
 * Se arma antes de insertar el log. El actor es el usuario autenticado que la ruta ya validó.
 * `null` = no se pudo congelar el contexto; el evento queda fuera de Team XP.
 */
export async function buildModerationTeamXpSnapshot(
  supabase: SupabaseClient,
  input: {
    actorUserId: string;
    offerId: string;
    decision: 'approved' | 'rejected';
    offerAuthorId: string | null;
    bulk: boolean;
  },
): Promise<TeamXpEventSnapshot | null> {
  try {
    const links =
      input.decision === 'approved' ? await loadBatchLinks(supabase, [input.offerId]) : new Map<string, BatchLink>();
    const batchItem = links.get(input.offerId) ?? null;
    const people = [...new Set([input.actorUserId, ...(batchItem ? [batchItem.submittedBy] : [])])];
    const memberships = await loadEventMemberships(supabase, people);
    if (!memberships) return null;
    return {
      v: 1,
      actorKind: 'human',
      bulk: input.bulk,
      offerAuthorId: input.offerAuthorId,
      batchItem,
      memberships,
    };
  } catch {
    return null;
  }
}

export function readTeamXpSnapshot(metadata: unknown): TeamXpEventSnapshot | null {
  if (!isRecord(metadata)) return null;
  const raw = metadata.team_xp;
  if (!isRecord(raw) || raw.v !== 1) return null;
  const actorKind = raw.actorKind;
  if (actorKind !== 'human' && actorKind !== 'system' && actorKind !== 'worker') return null;
  if (typeof raw.bulk !== 'boolean') return null;
  const offerAuthorId = raw.offerAuthorId === null ? null : readString(raw.offerAuthorId);
  if (offerAuthorId === null && raw.offerAuthorId !== null) return null;

  let batchItem: BatchLink | null = null;
  if (raw.batchItem !== null) {
    if (!isRecord(raw.batchItem)) return null;
    const id = readString(raw.batchItem.id);
    const submittedBy = readString(raw.batchItem.submittedBy);
    if (!id || !submittedBy) return null;
    batchItem = { id, submittedBy };
  }

  if (!Array.isArray(raw.memberships)) return null;
  const memberships: TeamXpEventSnapshot['memberships'] = [];
  for (const item of raw.memberships) {
    if (!isRecord(item)) return null;
    const userId = readString(item.userId);
    const teamId = readString(item.teamId);
    const role = readString(item.role);
    if (!userId || !teamId || !role) return null;
    memberships.push({ userId, teamId, role });
  }
  return { v: 1, actorKind, bulk: raw.bulk, offerAuthorId, batchItem, memberships };
}

function membershipMap(snapshot: TeamXpEventSnapshot): Map<string, TeamMembership[]> {
  const map = new Map<string, TeamMembership[]>();
  for (const item of snapshot.memberships) {
    const membership = membershipFromRow(item.userId, { teamId: item.teamId, role: item.role, status: 'ACTIVE' });
    if (!membership) continue;
    map.set(item.userId, [...(map.get(item.userId) ?? []), membership]);
  }
  return map;
}

/**
 * Evento desde la fila persistida. Sin foto del contexto (logs anteriores) no hay evento:
 * no se reconstruye `bulk` ni membresías a partir del estado actual.
 */
export function moderationEventFromLog(row: unknown): PersistedModerationEvent | null {
  if (!isRecord(row)) return null;
  const id = typeof row.id === 'number' ? String(row.id) : readString(row.id);
  const offerId = readString(row.offer_id);
  const actorUserId = readString(row.user_id);
  const decision = row.action === 'approved' || row.action === 'rejected' ? row.action : null;
  const previousStatus = readString(row.previous_status);
  const occurredAt = readString(row.created_at);
  if (!id || !offerId || !actorUserId || !decision || !previousStatus || !occurredAt) return null;
  if (Number.isNaN(Date.parse(occurredAt))) return null;
  const snapshot = readTeamXpSnapshot(row.metadata);
  if (!snapshot) return null;
  return {
    event: {
      type: 'moderation.offer_decided',
      eventRef: `moderation_logs:${id}`,
      actorKind: snapshot.actorKind,
      actorUserId,
      offerId,
      decision,
      previousStatus,
      offerAuthorId: snapshot.offerAuthorId,
      bulk: snapshot.bulk,
      batchItem: snapshot.batchItem,
    },
    occurredAt,
    memberships: membershipMap(snapshot),
  };
}
