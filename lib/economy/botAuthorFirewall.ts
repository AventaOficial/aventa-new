import type { SupabaseClient } from '@supabase/supabase-js';
import { isBotUserId } from '@/lib/bots/ingest/isBotUserId';

/**
 * Firewall económico de autores máquina.
 *
 * Invariante: BOT AUTHOR => ECONOMICALLY INERT.
 * Un autor máquina (bots de ingesta, autores de clientes MCP) no gana ni pierde reputación,
 * no recibe XP ni logros, no desbloquea Rewards, no entra en atribución de comisión,
 * settlement ni ledger, y no recibe notificaciones ni correos económicos.
 *
 * Fuentes:
 *  - entorno: `isBotUserId` (BOT_INGEST_USER_ID*, MCP_BOT_AUTHOR_USER_IDS);
 *  - base de datos: cualquier `machine_clients.author_profile_id`, en cualquier estado.
 *    Un cliente revocado sigue marcando a su autor como inerte.
 */

export type EconomicActorKind = 'human' | 'bot';

export const BOT_AUTHOR_BLOCKED_REASON = 'bot_author' as const;

/** Chequeo síncrono, sólo entorno. Úsalo donde no hay cliente Supabase. */
export function isEconomicallyInertUserId(userId: string | null | undefined): boolean {
  return isBotUserId(userId);
}

function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /relation .*machine_clients.* does not exist|could not find the table/i.test(error.message ?? '');
}

/**
 * Chequeo completo: entorno o `machine_clients.author_profile_id`.
 * Si la tabla aún no existe (migración sin aplicar) usa sólo el entorno.
 * Cualquier otro error de lectura cierra el paso: el autor se trata como inerte.
 */
export async function isEconomicallyInertAuthor(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<boolean> {
  const id = userId?.trim();
  if (!id) return false;
  if (isBotUserId(id)) return true;
  try {
    const { data, error } = await supabase
      .from('machine_clients')
      .select('id')
      .eq('author_profile_id', id)
      .limit(1);
    if (error) {
      if (isMissingRelation(error)) return false;
      console.error('[bot-firewall] machine_clients lookup failed; failing closed');
      return true;
    }
    return Array.isArray(data) && data.length > 0;
  } catch {
    console.error('[bot-firewall] machine_clients lookup threw; failing closed');
    return true;
  }
}

export async function economicActorKind(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<EconomicActorKind> {
  return (await isEconomicallyInertAuthor(supabase, userId)) ? 'bot' : 'human';
}
