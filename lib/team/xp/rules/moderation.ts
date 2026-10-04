import type { SupabaseClient } from '@supabase/supabase-js';
import { applyTeamXpEvent, type TeamXpApplyResult } from './apply';
import { loadBatchLinks, moderationDecisionEvent } from './moderationSource';
import type { ModerationOfferDecidedEvent } from './types';

/**
 * Después de guardar la decisión y su fila en moderation_logs.
 * Nunca hace fallar la respuesta de moderación: si falla, la reconciliación lo repite.
 */
export async function recordModerationDecisionTeamXp(
  supabase: SupabaseClient,
  input: Parameters<typeof moderationDecisionEvent>[1],
): Promise<TeamXpApplyResult[]> {
  try {
    const event = await moderationDecisionEvent(supabase, input);
    return await applyTeamXpEvent(event);
  } catch (error) {
    console.error('[team-xp] moderation decision', error instanceof Error ? error.message : 'unknown');
    return [];
  }
}

const RECONCILE_WINDOW_HOURS = 48;
const RECONCILE_LIMIT = 500;

type LogRow = {
  id: string;
  offer_id: string;
  user_id: string;
  action: 'approved' | 'rejected';
  previous_status: string | null;
};

function readLog(row: unknown): LogRow | null {
  if (!row || typeof row !== 'object') return null;
  const value = row as Record<string, unknown>;
  const id = typeof value.id === 'string' || typeof value.id === 'number' ? String(value.id) : null;
  const offerId = typeof value.offer_id === 'string' ? value.offer_id : null;
  const userId = typeof value.user_id === 'string' ? value.user_id : null;
  const action = value.action === 'approved' || value.action === 'rejected' ? value.action : null;
  const previous = typeof value.previous_status === 'string' ? value.previous_status : null;
  if (!id || !offerId || !userId || !action) return null;
  return { id, offer_id: offerId, user_id: userId, action, previous_status: previous };
}

/**
 * Repite los eventos de las últimas 48 h. Las claves ya resueltas devuelven `duplicate`.
 * Las acciones en lote no quedan en el log como tales; su resultado en vivo ya quedó guardado.
 */
export async function reconcileModerationTeamXp(
  supabase: SupabaseClient,
  now = new Date(),
): Promise<{ scanned: number; results: TeamXpApplyResult[] }> {
  const since = new Date(now.getTime() - RECONCILE_WINDOW_HOURS * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('moderation_logs')
    .select('id, offer_id, user_id, action, previous_status')
    .in('action', ['approved', 'rejected'])
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(RECONCILE_LIMIT);
  if (error || !data) return { scanned: 0, results: [] };

  const logs = data.map(readLog).filter((row): row is LogRow => row !== null);
  const offerIds = [...new Set(logs.map((row) => row.offer_id))];
  const authors = new Map<string, string | null>();
  if (offerIds.length > 0) {
    const { data: offers } = await supabase.from('offers').select('id, created_by').in('id', offerIds);
    for (const offer of offers ?? []) {
      if (!offer || typeof offer !== 'object') continue;
      const id = 'id' in offer && typeof offer.id === 'string' ? offer.id : null;
      const author = 'created_by' in offer && typeof offer.created_by === 'string' ? offer.created_by : null;
      if (id) authors.set(id, author);
    }
  }
  const links = await loadBatchLinks(
    supabase,
    logs.filter((row) => row.action === 'approved').map((row) => row.offer_id),
  );

  const results: TeamXpApplyResult[] = [];
  for (const log of logs) {
    const event: ModerationOfferDecidedEvent = {
      type: 'moderation.offer_decided',
      eventRef: `moderation_logs:${log.id}`,
      actorKind: 'human',
      actorUserId: log.user_id,
      offerId: log.offer_id,
      decision: log.action,
      previousStatus: log.previous_status ?? 'pending',
      offerAuthorId: authors.get(log.offer_id) ?? null,
      bulk: false,
      batchItem: log.action === 'approved' ? (links.get(log.offer_id) ?? null) : null,
    };
    results.push(...(await applyTeamXpEvent(event)));
  }
  return { scanned: logs.length, results };
}
