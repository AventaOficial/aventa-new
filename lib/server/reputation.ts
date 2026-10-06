import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { isEconomicallyInertAuthor } from '@/lib/economy/botAuthorFirewall';

/**
 * Recalcula reputation_score, reputation_level e is_trusted de un usuario.
 * Reglas: +10 oferta aprobada, -15 rechazada, +2 comentario aprobado, -5 rechazado, +1 like recibido.
 * profiles.achievement_xp no entra en esta fórmula.
 * Niveles: 1 (0-99), 2 (100-399), 3 (400-999), 4 (1000+).
 * No lanza; solo registra errores (p. ej. si la función RPC o comment_likes no existen).
 */
export async function recalculateUserReputation(userId: string): Promise<void> {
  try {
    const supabase = createServerClient();
    if (await isEconomicallyInertAuthor(supabase, userId)) return;
    await supabase.rpc('recalculate_user_reputation', { p_user_id: userId });
  } catch (e) {
    console.error('[reputation] recalculate_user_reputation failed for', userId, e);
  }
}

export type HumanOfferCounterRpc =
  | 'increment_offers_approved_count'
  | 'increment_offers_rejected_count'
  | 'increment_offers_submitted_count';

/**
 * Contadores de perfil usados por moderación y por el alta de ofertas.
 * MACHINE_HUNTER y SYSTEM no los incrementan. La oferta en catálogo no depende de esto.
 */
export async function incrementHumanOfferCounter(
  supabase: SupabaseClient,
  userId: string,
  rpc: HumanOfferCounterRpc,
): Promise<'skipped' | 'ok' | 'error'> {
  if (await isEconomicallyInertAuthor(supabase, userId)) return 'skipped';
  const { error } = await supabase.rpc(rpc, { uuid: userId });
  if (error) return 'error';
  return 'ok';
}

/** Umbral de nivel para auto-aprobar comentarios (>= 2). */
export const REPUTATION_LEVEL_AUTO_APPROVE_COMMENTS = 2;

/** Umbral de nivel para publicar ofertas directo en "Nuevas" (>= 3). */
export const REPUTATION_LEVEL_AUTO_APPROVE_OFFERS = 3;

import { REPUTATION_LEVELS as LEVELS } from '@/lib/reputation';

/** Re-export para uso en servidor. */
export const REPUTATION_LEVELS = LEVELS;

export function getReputationLabel(level: number): string {
  const found = REPUTATION_LEVELS.find((l) => l.level === level);
  return found?.label ?? 'Nuevo';
}

/** Progreso 0..1 dentro del nivel actual (para barra). */
export function getReputationProgress(score: number, level: number): number {
  const config = REPUTATION_LEVELS.find((l) => l.level === level);
  if (!config || config.maxScore === Infinity) return 1;
  const span = config.maxScore - config.minScore + 1;
  const inLevel = score - config.minScore;
  return Math.min(1, Math.max(0, inLevel / span));
}
