import { createServerClient } from '@/lib/supabase/server';

/**
 * Recalcula reputation_score, reputation_level e is_trusted de un usuario.
 * Reglas: +10 oferta aprobada, -15 rechazada, +2 comentario aprobado, -5 rechazado, +1 like recibido.
 * Niveles: 1 (0-49), 2 (50-199), 3 (200-499), 4 (500+).
 * No lanza; solo registra errores (p. ej. si la función RPC o comment_likes no existen).
 */
export async function recalculateUserReputation(userId: string): Promise<void> {
  try {
    const supabase = createServerClient();
    await supabase.rpc('recalculate_user_reputation', { p_user_id: userId });
  } catch (e) {
    console.error('[reputation] recalculate_user_reputation failed for', userId, e);
  }
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

/** Puntos de voto por nivel (backend only; up, down). Nivel 1: +2/-1, 2: +2.2/-1.1, 3: +2.5/-1.2, 4: +3/-1.5 */
export const VOTE_POINTS_BY_LEVEL: Record<number, { up: number; down: number }> = {
  1: { up: 2, down: 1 },
  2: { up: 2.2, down: 1.1 },
  3: { up: 2.5, down: 1.2 },
  4: { up: 3, down: 1.5 },
};
