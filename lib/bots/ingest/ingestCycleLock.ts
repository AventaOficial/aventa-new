import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

export const INGEST_LOCK_TABLE = 'ingest_cycle_locks';

/**
 * TTL del lock. Atado al `maxDuration` de las rutas de cron (300 s): si un
 * isolate muere a mitad de ciclo, el siguiente puede tomar el lock en cuanto
 * ese plazo vence, en vez de dejar la ingesta parada para siempre.
 */
export const INGEST_LOCK_TTL_MS = 5 * 60 * 1000;

export type IngestLockOutcome =
  | { acquired: true; holder: string; reason: 'free' | 'stole_expired' | 'no_backend' }
  | { acquired: false; reason: 'held' };

function newHolderId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `holder_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function adminClient(): SupabaseClient | null {
  try {
    return createServerClient();
  } catch {
    return null;
  }
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /duplicate key|already exists/i.test(error.message ?? '');
}

/**
 * Intenta tomar el lock del ciclo.
 *
 * FAIL-OPEN A PROPÓSITO. Si la tabla no existe o la DB falla, el ciclo CONTINÚA.
 * Este lock evita trabajo duplicado, no protege integridad: de las carreras
 * reales ya se encarga el UNIQUE de `product_fingerprint` en offers. Bloquear la
 * ingesta porque falló una tabla auxiliar cambiaría un desperdicio de cómputo
 * por una parada de supply, que es mucho peor.
 *
 * Fail-closed se reserva para dinero y seguridad; esto no es ninguna de las dos.
 */
export async function acquireIngestCycleLock(opts: {
  lockKey: string;
  supabase?: SupabaseClient | null;
  now?: Date;
  ttlMs?: number;
}): Promise<IngestLockOutcome> {
  const holder = newHolderId();
  const supabase = opts.supabase !== undefined ? opts.supabase : adminClient();
  if (!supabase) return { acquired: true, holder, reason: 'no_backend' };

  const now = opts.now ?? new Date();
  const ttlMs = opts.ttlMs ?? INGEST_LOCK_TTL_MS;
  const nowIso = now.toISOString();
  const expiresIso = new Date(now.getTime() + ttlMs).toISOString();

  try {
    const insert = await supabase
      .from(INGEST_LOCK_TABLE)
      .insert([{ lock_key: opts.lockKey, holder, acquired_at: nowIso, expires_at: expiresIso }]);

    if (!insert.error) return { acquired: true, holder, reason: 'free' };
    if (!isUniqueViolation(insert.error)) return { acquired: true, holder, reason: 'no_backend' };

    // Ya existe una fila. Solo se puede tomar si el lock anterior venció.
    // El WHERE sobre expires_at hace la comprobación y la toma en una sola
    // sentencia, así que dos ciclos simultáneos no pueden ganar los dos.
    //
    // `lte` y no `lt`: un lock que caduca justo ahora ya está caducado. Liberar
    // es adelantar expires_at al instante actual, así que con `lt` el siguiente
    // ciclo tendría que esperar a que avanzara el reloj para entrar.
    const steal = await supabase
      .from(INGEST_LOCK_TABLE)
      .update({ holder, acquired_at: nowIso, expires_at: expiresIso, updated_at: nowIso })
      .eq('lock_key', opts.lockKey)
      .lte('expires_at', nowIso)
      .select('lock_key');

    if (steal.error) return { acquired: true, holder, reason: 'no_backend' };
    if (Array.isArray(steal.data) && steal.data.length > 0) {
      return { acquired: true, holder, reason: 'stole_expired' };
    }
    return { acquired: false, reason: 'held' };
  } catch {
    return { acquired: true, holder, reason: 'no_backend' };
  }
}

/**
 * Libera el lock adelantando su caducidad. No borra la fila: no hace falta un
 * camino de DELETE para esto.
 *
 * El filtro por `holder` evita que un ciclo lento libere el lock de otro que ya
 * se lo había robado tras vencer.
 */
export async function releaseIngestCycleLock(opts: {
  lockKey: string;
  holder: string;
  supabase?: SupabaseClient | null;
  now?: Date;
}): Promise<void> {
  const supabase = opts.supabase !== undefined ? opts.supabase : adminClient();
  if (!supabase) return;
  const nowIso = (opts.now ?? new Date()).toISOString();

  try {
    await supabase
      .from(INGEST_LOCK_TABLE)
      .update({ expires_at: nowIso, updated_at: nowIso })
      .eq('lock_key', opts.lockKey)
      .eq('holder', opts.holder);
  } catch {
    // Soltar el lock nunca puede tumbar un ciclo: el TTL lo libera igualmente.
  }
}
