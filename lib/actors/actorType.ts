import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tipo de actor de Aventa.
 *
 * HUMAN: persona. Participa en reputación, XP, logros, comunidad, rewards, comisiones y payouts.
 * MACHINE_HUNTER: autor de supply (cliente MCP o declarado en MCP_BOT_AUTHOR_USER_IDS).
 *   Sus ofertas cuentan en el catálogo. No participa en superficies humanas.
 * SYSTEM: ingesta u otro proceso sin autoría de cazador (BOT_INGEST_USER_ID*).
 *   Tampoco participa en superficies humanas. Un error de lectura se clasifica SYSTEM
 *   para cerrar el paso: no se trata como humano.
 *
 * La regla vive en resolveActorTypeFromSignals. resolveActorType es la única lectura
 * por usuario; loadActorDirectory aplica la misma regla a un lote.
 */

export type ActorType = 'HUMAN' | 'MACHINE_HUNTER' | 'SYSTEM';

/** Resultado de buscar author_profile_id en machine_clients. */
export type MachineClientAuthorSignal = boolean | 'unknown' | 'unavailable';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIRECTORY_CAP = 1000;

export function ingestSystemUserIds(): string[] {
  return [process.env.BOT_INGEST_USER_ID, process.env.BOT_INGEST_USER_ID_TECH, process.env.BOT_INGEST_USER_ID_STAPLES]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

export function declaredMachineHunterIds(): string[] {
  return (process.env.MCP_BOT_AUTHOR_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function resolveActorTypeFromSignals(
  userId: string | null | undefined,
  machineClientAuthor: MachineClientAuthorSignal,
): ActorType {
  const id = userId?.trim() ?? '';
  if (!id) return 'HUMAN';
  if (declaredMachineHunterIds().includes(id)) return 'MACHINE_HUNTER';
  if (machineClientAuthor === true) return 'MACHINE_HUNTER';
  if (machineClientAuthor === 'unknown') return 'SYSTEM';
  if (ingestSystemUserIds().includes(id)) return 'SYSTEM';
  return 'HUMAN';
}

export function excludesHumanSurfaces(type: ActorType): boolean {
  return type === 'MACHINE_HUNTER' || type === 'SYSTEM';
}

/** Ofertas de los tres tipos cuentan como supply de catálogo. */
export function countsAsCatalogSupply(type: ActorType): boolean {
  return type === 'HUMAN' || type === 'MACHINE_HUNTER' || type === 'SYSTEM';
}

export function isMissingMachineClientsRelation(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /relation .*machine_clients.* does not exist|could not find the table/i.test(error.message ?? '');
}

export async function resolveActorType(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<ActorType> {
  const id = userId?.trim() ?? '';
  if (!id) return 'HUMAN';
  if (declaredMachineHunterIds().includes(id)) return 'MACHINE_HUNTER';

  let signal: MachineClientAuthorSignal = false;
  try {
    const { data, error } = await supabase
      .from('machine_clients')
      .select('id')
      .eq('author_profile_id', id)
      .limit(1);
    if (error) {
      if (isMissingMachineClientsRelation(error)) signal = 'unavailable';
      else {
        console.error('[actor-type] machine_clients lookup failed; failing closed');
        signal = 'unknown';
      }
    } else {
      signal = Array.isArray(data) && data.length > 0;
    }
  } catch {
    console.error('[actor-type] machine_clients lookup threw; failing closed');
    signal = 'unknown';
  }
  return resolveActorTypeFromSignals(id, signal);
}

export type ActorDirectory = {
  classify(userId: string | null | undefined): ActorType;
  /** Ids UUID excluidos de métricas de usuarios humanos. */
  nonHumanIds(): string[];
};

/**
 * Un lote para métricas. null si la lectura falla o se trunca:
 * el llamador debe anular la métrica humana, no contar a todos como humanos.
 * Tabla ausente: sólo entorno.
 */
export async function loadActorDirectory(supabase: SupabaseClient): Promise<ActorDirectory | null> {
  const hunters = new Set(declaredMachineHunterIds());
  const systems = new Set(ingestSystemUserIds());
  try {
    const { data, error } = await supabase.from('machine_clients').select('author_profile_id').limit(DIRECTORY_CAP);
    if (error) {
      if (!isMissingMachineClientsRelation(error)) {
        console.error('[actor-type] machine_clients directory failed; failing closed');
        return null;
      }
    } else {
      const rows = data ?? [];
      if (rows.length >= DIRECTORY_CAP) {
        console.error('[actor-type] machine_clients directory truncated; failing closed');
        return null;
      }
      for (const row of rows) {
        const authorId = String((row as { author_profile_id?: string | null }).author_profile_id ?? '').trim();
        if (authorId) hunters.add(authorId);
      }
    }
  } catch {
    console.error('[actor-type] machine_clients directory threw; failing closed');
    return null;
  }

  for (const hunterId of hunters) systems.delete(hunterId);

  return {
    classify(userId) {
      const id = userId?.trim() ?? '';
      if (!id) return 'HUMAN';
      if (hunters.has(id)) return resolveActorTypeFromSignals(id, true);
      if (systems.has(id)) return resolveActorTypeFromSignals(id, false);
      return resolveActorTypeFromSignals(id, false);
    },
    nonHumanIds() {
      return [...hunters, ...systems].filter((id) => UUID_RE.test(id));
    },
  };
}
