import type { SupabaseClient } from '@supabase/supabase-js';
import { excludesHumanSurfaces, resolveActorType } from '@/lib/actors/actorType';
import { isBotUserId } from '@/lib/bots/ingest/isBotUserId';

/**
 * Firewall económico de autores máquina.
 *
 * La clasificación vive en resolveActorType (HUMAN | MACHINE_HUNTER | SYSTEM).
 * MACHINE_HUNTER y SYSTEM quedan fuera de reputación, XP, logros, Rewards,
 * atribución de comisión, settlement, ledger y payouts.
 * Sus ofertas siguen siendo supply de catálogo.
 *
 * Fuentes, sin nombres ni ids fijos:
 *  - entorno: BOT_INGEST_USER_ID* (SYSTEM) y MCP_BOT_AUTHOR_USER_IDS (MACHINE_HUNTER);
 *  - base de datos: cualquier machine_clients.author_profile_id, en cualquier estado.
 */

export type EconomicActorKind = 'human' | 'bot';

export const BOT_AUTHOR_BLOCKED_REASON = 'bot_author' as const;

/** Chequeo síncrono, sólo entorno. Úsalo donde no hay cliente Supabase. */
export function isEconomicallyInertUserId(userId: string | null | undefined): boolean {
  return isBotUserId(userId);
}

/**
 * MACHINE_HUNTER o SYSTEM. Un id vacío no es un actor.
 * Si machine_clients no existe, sólo cuenta el entorno.
 * Cualquier otro error de lectura cierra el paso.
 */
export async function isEconomicallyInertAuthor(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<boolean> {
  const id = userId?.trim();
  if (!id) return false;
  return excludesHumanSurfaces(await resolveActorType(supabase, id));
}

/** Adaptador binario. El tipo de dominio es ActorType. */
export async function economicActorKind(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<EconomicActorKind> {
  const id = userId?.trim();
  if (!id) return 'human';
  return excludesHumanSurfaces(await resolveActorType(supabase, id)) ? 'bot' : 'human';
}
