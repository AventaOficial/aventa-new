import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveActorType } from '@/lib/actors/actorType';
import type { ProductActorClass } from '@/lib/analytics/funnelTaxonomy';

/**
 * Clase de actor para product_events, resuelta una vez al escribir.
 * No modifica el firewall económico. Un request sin usuario es ANONYMOUS:
 * resolveActorType('') devuelve HUMAN y no sirve para tráfico anónimo.
 */
export async function resolveProductActorClass(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<ProductActorClass> {
  const id = userId?.trim() ?? '';
  if (!id) return 'ANONYMOUS';
  const actor = await resolveActorType(supabase, id);
  if (actor === 'MACHINE_HUNTER' || actor === 'SYSTEM' || actor === 'HUMAN') return actor;
  return 'SYSTEM';
}
