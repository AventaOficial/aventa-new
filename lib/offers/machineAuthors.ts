import type { SupabaseClient } from '@supabase/supabase-js';
import { loadActorDirectory } from '@/lib/actors/actorType';

/** Los autores máquina cambian muy poco: basta releerlos cada pocos minutos por instancia. */
export const MACHINE_AUTHOR_CACHE_MS = 5 * 60_000;

let cached: { ids: string[]; at: number } | null = null;

/**
 * Ids de autores automáticos (Hunters MCP e ingesta): entorno + `machine_clients`.
 * null si la lectura falla o se trunca. Quien llama debe cerrar el paso, no tratarlo como lista vacía.
 * Solo se guarda en caché una lectura correcta.
 */
export async function loadMachineAuthorIds(
  supabase: SupabaseClient,
  now: number = Date.now(),
): Promise<string[] | null> {
  if (cached && now - cached.at < MACHINE_AUTHOR_CACHE_MS) return cached.ids;
  const directory = await loadActorDirectory(supabase);
  if (!directory) return null;
  const ids = [...new Set(directory.nonHumanIds())].sort();
  cached = { ids, at: now };
  return ids;
}

export function resetMachineAuthorCacheForTests(): void {
  cached = null;
}

/** Filtro PostgREST `not.in` para excluir autores automáticos. null si no hay nada que excluir. */
export function machineAuthorNotInList(ids: readonly string[]): string | null {
  return ids.length > 0 ? `(${ids.join(',')})` : null;
}
